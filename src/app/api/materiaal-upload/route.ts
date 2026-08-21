import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createGeminiClient, vereistGeminiKey, genereerGestructureerd } from "@/lib/gemini";

const MAX_BESTANDSGROOTTE = 15 * 1024 * 1024; // 15MB
const TOEGESTANE_TYPES = ["application/pdf", "image/jpeg", "image/jpg", "image/png", "image/webp", "application/json"];

function isJsonBestand(file: File) {
  return file.type === "application/json" || file.name.toLowerCase().endsWith(".json");
}

const ExtractieSchema = z.object({
  title: z.string().describe("Korte titel voor dit materiaal, bijv. 'Hoofdstuk 4 - Breuken'"),
  hoofdstuk: z.string().describe("Herkend hoofdstuknummer/naam, of leeg als niet te herkennen"),
  opdrachten: z.string().describe("Herkende opdracht-/opgavenummers (bijv. '2.1, 2.2, 2.5'), of leeg"),
  samenvatting: z
    .string()
    .describe(
      "De volledige, gestructureerde inhoud in het Nederlands, geschikt als kennisbank voor een AI-vakdocent. Bij een foto: beschrijf ook wat er te zien is (bijv. een diagram of som) zodat dit later in uitleg gebruikt kan worden."
    ),
});

function veiligeBestandsnaam(naam: string) {
  return naam.replace(/[^a-zA-Z0-9_.-]/g, "_").slice(-80);
}

export async function POST(request: Request) {
  try {
    vereistGeminiKey();
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "AI niet geconfigureerd." }, { status: 500 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Niet ingelogd." }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("family_id, role")
    .eq("id", user.id)
    .single();
  if (!profile) return NextResponse.json({ error: "Profiel niet gevonden." }, { status: 400 });

  const formData = await request.formData();
  const file = formData.get("file");
  const subjectId = String(formData.get("subjectId") || "");

  if (!(file instanceof File) || !subjectId) {
    return NextResponse.json({ error: "Kies een bestand en een vak." }, { status: 400 });
  }
  if (!TOEGESTANE_TYPES.includes(file.type) && !isJsonBestand(file)) {
    return NextResponse.json(
      { error: "Alleen PDF's, foto's (JPEG/PNG/WebP) en JSON-bestanden worden ondersteund." },
      { status: 400 }
    );
  }
  if (file.size > MAX_BESTANDSGROOTTE) {
    return NextResponse.json({ error: "Bestand is te groot (max 15MB)." }, { status: 400 });
  }

  const { data: subject } = await supabase
    .from("subjects")
    .select("id, family_id")
    .eq("id", subjectId)
    .single();
  if (!subject) return NextResponse.json({ error: "Vak niet gevonden." }, { status: 404 });

  const bytes = await file.arrayBuffer();
  const isJson = isJsonBestand(file);
  const bronType = isJson ? "tekst" : file.type === "application/pdf" ? "pdf" : "foto";

  let geextraheerd: { title: string; hoofdstuk?: string; opdrachten?: string; samenvatting: string };
  try {
    const client = createGeminiClient();

    let parts: ({ text: string } | { inlineData: { mimeType: string; data: string } })[];

    if (isJson) {
      const jsonTekst = Buffer.from(bytes).toString("utf-8");
      parts = [
        {
          text:
            "Dit is een JSON-bestand met lesstof voor een leerling op de Nederlandse middelbare school (Havo) - " +
            "bijvoorbeeld een export uit een andere leer-app, of handmatig opgestelde structuur. Herken hoofdstuk- " +
            "en opdrachtnummers waar mogelijk (indien aanwezig in de data) en zet de inhoud om in een heldere, " +
            "goed leesbare, gestructureerde samenvatting die een AI-vakdocent kan gebruiken om de leerling te " +
            "helpen. Negeer technische/opmaak-velden die geen leerinhoud bevatten.\n\nJSON-inhoud:\n" +
            jsonTekst.slice(0, 100000),
        },
      ];
    } else if (bronType === "pdf") {
      const base64 = Buffer.from(bytes).toString("base64");
      parts = [
        { inlineData: { mimeType: "application/pdf", data: base64 } },
        {
          text: "Analyseer dit lesmateriaal (PDF) voor een leerling op de Nederlandse middelbare school (Havo). Herken hoofdstuk- en opdrachtnummers waar mogelijk en zet de inhoud om in een heldere, gestructureerde samenvatting die een AI-vakdocent kan gebruiken om de leerling te helpen.",
        },
      ];
    } else {
      const base64 = Buffer.from(bytes).toString("base64");
      parts = [
        { inlineData: { mimeType: file.type, data: base64 } },
        {
          text: "Analyseer deze foto van lesmateriaal (bijv. een pagina uit een boek, aantekeningen, of een diagram) voor een leerling op de Nederlandse middelbare school (Havo). Herken hoofdstuk- en opdrachtnummers waar mogelijk en beschrijf de inhoud (inclusief eventuele afbeeldingen/diagrammen/sommen) zodat een AI-vakdocent dit later kan gebruiken om uitleg te geven.",
        },
      ];
    }

    geextraheerd = await genereerGestructureerd(client, ExtractieSchema, [{ role: "user", parts }]);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? `AI-verwerking mislukt: ${e.message}` : "AI-verwerking mislukt." },
      { status: 502 }
    );
  }

  const storagePad = `${profile.family_id}/${subjectId}/${randomUUID()}-${veiligeBestandsnaam(file.name)}`;
  const { error: uploadError } = await supabase.storage.from("lesstof").upload(storagePad, bytes, {
    contentType: file.type || (isJson ? "application/json" : "application/octet-stream"),
    upsert: false,
  });
  if (uploadError) {
    return NextResponse.json({ error: `Uploaden mislukt: ${uploadError.message}` }, { status: 500 });
  }

  const { data: nieuwMateriaal, error: insertError } = await supabase
    .from("materials")
    .insert({
      family_id: profile.family_id,
      subject_id: subjectId,
      title: geextraheerd.title || file.name,
      content: geextraheerd.samenvatting,
      hoofdstuk: geextraheerd.hoofdstuk || null,
      opdrachten: geextraheerd.opdrachten || null,
      file_url: storagePad,
      image_path: bronType === "foto" ? storagePad : null,
      bron_type: bronType,
      uploaded_by: user.id,
      uploaded_by_role: profile.role,
    })
    .select("id, title, hoofdstuk, opdrachten")
    .single();

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ material: nieuwMateriaal });
}
