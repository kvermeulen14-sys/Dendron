import { NextResponse } from "next/server";
import { SchemaType, type Schema } from "@google/generative-ai";
import { createClient } from "@/lib/supabase/server";
import { createGeminiClient, vereistGeminiKey } from "@/lib/gemini";

const MAX_BESTANDSGROOTTE = 15 * 1024 * 1024; // 15MB
const TOEGESTANE_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];

const DAG_NAAR_NUMMER: Record<string, number> = {
  maandag: 1,
  ma: 1,
  dinsdag: 2,
  di: 2,
  woensdag: 3,
  wo: 3,
  donderdag: 4,
  do: 4,
  vrijdag: 5,
  vr: 5,
  zaterdag: 6,
  za: 6,
  zondag: 7,
  zo: 7,
};

const EXTRACTIE_SCHEMA: Schema = {
  type: SchemaType.ARRAY,
  items: {
    type: SchemaType.OBJECT,
    properties: {
      dag: { type: SchemaType.STRING, description: "Dag van de week in het Nederlands, bijv. 'maandag'" },
      start: { type: SchemaType.STRING, description: "Begintijd in HH:MM formaat, bijv. '09:15'" },
      eind: { type: SchemaType.STRING, description: "Eindtijd in HH:MM formaat, bijv. '10:05'" },
      vak: { type: SchemaType.STRING, description: "Naam van het vak of lesuur, bijv. 'Wiskunde'" },
    },
    required: ["dag", "start", "eind", "vak"],
  },
};

function naarDagNummer(dag: string): number {
  return DAG_NAAR_NUMMER[dag.trim().toLowerCase()] ?? 0;
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

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Kies een screenshot om te verwerken." }, { status: 400 });
  }
  if (!TOEGESTANE_TYPES.includes(file.type)) {
    return NextResponse.json({ error: "Alleen foto's/screenshots (JPEG/PNG/WebP) worden ondersteund." }, { status: 400 });
  }
  if (file.size > MAX_BESTANDSGROOTTE) {
    return NextResponse.json({ error: "Bestand is te groot (max 15MB)." }, { status: 400 });
  }

  const bytes = await file.arrayBuffer();
  const base64 = Buffer.from(bytes).toString("base64");

  try {
    const genAI = createGeminiClient();
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      generationConfig: { responseMimeType: "application/json", responseSchema: EXTRACTIE_SCHEMA },
    });

    const prompt =
      "Dit is een screenshot van een schoolrooster (bijvoorbeeld uit SomToday, Zermelo of Magister). " +
      "Herken alle losse lesuren met dag van de week, begintijd, eindtijd en vaknaam. Sla pauzes, " +
      "tussenuren en lege vakken over. Geef de lijst terug gesorteerd op dag en daarna op begintijd.";

    const result = await model.generateContent([
      { inlineData: { mimeType: file.type, data: base64 } },
      { text: prompt },
    ]);

    const ruweRegels: { dag: string; start: string; eind: string; vak: string }[] = JSON.parse(result.response.text());

    const regels = ruweRegels.map((r) => ({
      dagVanWeek: naarDagNummer(r.dag),
      dagLabel: r.dag,
      startTijd: r.start,
      eindTijd: r.eind,
      titel: r.vak,
    }));

    return NextResponse.json({ regels });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? `AI-verwerking mislukt: ${e.message}` : "AI-verwerking mislukt." },
      { status: 502 }
    );
  }
}
