import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createGeminiClient, vereistGeminiKey, GEMINI_MODEL, jsonSchemaVoorGemini } from "@/lib/gemini";

const MAX_KENNISBANK_TEKENS = 14000;

const ResponsSchema = z.object({
  feedback: z.string().describe("Korte, vriendelijke feedback op het vorige antwoord, of leeg als er nog geen antwoord was"),
  beoordeling: z
    .enum(["goed", "deels", "fout", "geen"])
    .describe("Beoordeling van het vorige antwoord, of 'geen' als er nog geen antwoord was"),
  vraag: z.string().describe("De volgende overhoor-vraag"),
});

const LEERFASE_INSTRUCTIE: Record<string, string> = {
  eerste:
    "De leerling leert dit voor het eerst. Stel een laagdrempelige, ondersteunende vraag en help waar nodig met een klein duwtje in de goede richting.",
  tussentijds:
    "De leerling heeft dit al eerder geleerd en oefent nu. Stel een gemiddeld moeilijke vraag ter herhaling, met iets minder hulp.",
  laatste:
    "Dit is vlak voor de toets. Stel een pittige vraag zoals die op de toets zou kunnen staan, gericht op parate kennis, zonder hints vooraf.",
};

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

  const { subjectId, spellingStrict, leerfase, gesteldeVragen, vorigeVraag, vorigAntwoord } = await request.json();
  if (!subjectId) return NextResponse.json({ error: "subjectId is verplicht." }, { status: 400 });

  const { data: subject } = await supabase.from("subjects").select("id, name").eq("id", subjectId).single();
  if (!subject) return NextResponse.json({ error: "Vak niet gevonden." }, { status: 404 });

  const { data: materials } = await supabase.from("materials").select("title, content").eq("subject_id", subjectId);
  let kennisbank = (materials ?? []).map((m) => `## ${m.title}\n${m.content}`).join("\n\n");
  if (kennisbank.length > MAX_KENNISBANK_TEKENS) {
    kennisbank = kennisbank.slice(0, MAX_KENNISBANK_TEKENS) + "\n[...ingekort...]";
  }
  if (!kennisbank) {
    return NextResponse.json(
      { error: "Er is nog geen lesstof voor dit vak, dus overhoren kan nog niet." },
      { status: 400 }
    );
  }

  const leerfaseInstructie = LEERFASE_INSTRUCTIE[leerfase] ?? LEERFASE_INSTRUCTIE.tussentijds;
  const spellingInstructie = spellingStrict
    ? "Let bij het beoordelen streng op correcte spelling - een verder inhoudelijk goed antwoord met een spelfout beoordeel je als 'deels' in plaats van 'goed'."
    : "Let bij het beoordelen alleen op de inhoud/betekenis van het antwoord - spelfouten mogen genegeerd worden.";

  const prompt = `Je overhoort een leerling van de Nederlandse middelbare school (Havo) op het vak "${subject.name}".
${leerfaseInstructie}
${spellingInstructie}
Stel altijd maar 1 vraag tegelijk, kort en concreet. Varieer het soort vraag (begripsvraag, rekenvraag, definitie, toepassing) waar de lesstof dat toelaat.

${
  vorigeVraag && vorigAntwoord
    ? `Beoordeel eerst dit antwoord van de leerling:\nVraag: ${vorigeVraag}\nAntwoord van de leerling: ${vorigAntwoord}\nGeef korte (1-2 zinnen), vriendelijke en opbouwende feedback en een beoordeling (goed/deels/fout).\n\n`
    : "Er is nog geen vorig antwoord - laat feedback leeg en beoordeling op 'geen'.\n\n"
}Stel daarna een NIEUWE vraag over de lesstof hieronder. Deze vragen zijn deze sessie al gesteld, stel geen vraag die daar erg op lijkt: ${
    Array.isArray(gesteldeVragen) && gesteldeVragen.length > 0 ? gesteldeVragen.join(" | ") : "(nog geen)"
  }

LESSTOF:
${kennisbank}`;

  try {
    const client = createGeminiClient();
    const response = await client.models.generateContent({
      model: GEMINI_MODEL,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        maxOutputTokens: 1024,
        responseMimeType: "application/json",
        responseJsonSchema: jsonSchemaVoorGemini(ResponsSchema),
      },
    });

    if (!response.text) throw new Error("Geen bruikbaar resultaat van de AI ontvangen.");
    return NextResponse.json(ResponsSchema.parse(JSON.parse(response.text)));
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? `AI-verwerking mislukt: ${e.message}` : "AI-verwerking mislukt." },
      { status: 502 }
    );
  }
}
