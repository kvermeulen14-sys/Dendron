import { NextResponse } from "next/server";
import { SchemaType, type Schema } from "@google/generative-ai";
import { createClient } from "@/lib/supabase/server";
import { createGeminiClient, vereistGeminiKey } from "@/lib/gemini";

const MAX_BESTANDSGROOTTE = 15 * 1024 * 1024;
const TOEGESTANE_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];

const EXTRACTIE_SCHEMA: Schema = {
  type: SchemaType.ARRAY,
  items: {
    type: SchemaType.OBJECT,
    properties: {
      titel: { type: SchemaType.STRING, description: "Korte titel van het huiswerk, bijv. 'H4 par. 2 maken'" },
      vak: { type: SchemaType.STRING, description: "Naam van het vak, bijv. 'Wiskunde' (leeg als niet te herkennen)" },
      datum: { type: SchemaType.STRING, description: "Datum waarop het af moet in YYYY-MM-DD formaat" },
      beschrijving: { type: SchemaType.STRING, description: "Extra details/opdrachtomschrijving, of leeg" },
    },
    required: ["titel", "datum"],
  },
};

function bouwPrompt(vandaag: string) {
  return (
    `Vandaag is ${vandaag} (dus "morgen" is ${vandaag} + 1 dag, reken relatieve datums hiermee uit). ` +
    "Dit is een bron met huiswerkopdrachten voor een middelbare scholier (kan geplakte tekst zijn uit " +
    "bijv. SomToday, of een screenshot/foto van een planner, whiteboard of huiswerkblad). Herken elke " +
    "losse huiswerkopdracht met een korte titel, het vak (indien te herkennen), de datum waarop het af " +
    "moet (YYYY-MM-DD - redeneer relatieve datums zoals 'morgen' of 'volgende week maandag' uit vanaf " +
    "vandaag), en eventuele extra beschrijving. Geef een lijst terug, ook als het er maar 1 is."
  );
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

  const formData = await request.formData();
  const file = formData.get("file");
  const tekst = formData.get("text");
  const vandaag = new Date().toISOString().slice(0, 10);

  if (!(file instanceof File) && (!tekst || typeof tekst !== "string" || !tekst.trim())) {
    return NextResponse.json({ error: "Geef tekst op of kies een screenshot." }, { status: 400 });
  }

  if (file instanceof File) {
    if (!TOEGESTANE_TYPES.includes(file.type)) {
      return NextResponse.json({ error: "Alleen foto's/screenshots (JPEG/PNG/WebP) worden ondersteund." }, { status: 400 });
    }
    if (file.size > MAX_BESTANDSGROOTTE) {
      return NextResponse.json({ error: "Bestand is te groot (max 15MB)." }, { status: 400 });
    }
  }

  try {
    const genAI = createGeminiClient();
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      generationConfig: { responseMimeType: "application/json", responseSchema: EXTRACTIE_SCHEMA },
    });

    const parts: (
      | { text: string }
      | { inlineData: { mimeType: string; data: string } }
    )[] = [{ text: bouwPrompt(vandaag) }];

    if (file instanceof File) {
      const bytes = await file.arrayBuffer();
      parts.push({ inlineData: { mimeType: file.type, data: Buffer.from(bytes).toString("base64") } });
    } else {
      parts.push({ text: `Bron:\n${String(tekst)}` });
    }

    const result = await model.generateContent(parts);
    const items = JSON.parse(result.response.text());
    return NextResponse.json({ items });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? `AI-verwerking mislukt: ${e.message}` : "AI-verwerking mislukt." },
      { status: 502 }
    );
  }
}
