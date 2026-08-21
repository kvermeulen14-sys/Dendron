import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createGeminiClient, vereistGeminiKey, genereerGestructureerd } from "@/lib/gemini";
import { GROTE_KENNISBANK_DREMPEL, kiesWillekeurigeSelectie } from "@/lib/kennisbank";

const MAX_KENNISBANK_TEKENS = 14000;
const MAX_OVERHOOR_MATERIALEN = 6;

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

  const { subjectId, spellingStrict, leerfase, gesteldeVragen, vorigeVraag, vorigAntwoord, modus, scopeInstructie } =
    await request.json();
  if (!subjectId) return NextResponse.json({ error: "subjectId is verplicht." }, { status: 400 });

  const { data: subject } = await supabase.from("subjects").select("id, name").eq("id", subjectId).single();
  if (!subject) return NextResponse.json({ error: "Vak niet gevonden." }, { status: 404 });

  const { data: materials } = await supabase
    .from("materials")
    .select("title, content, hoofdstuk")
    .eq("subject_id", subjectId);
  if (!materials || materials.length === 0) {
    return NextResponse.json(
      { error: "Er is nog geen lesstof voor dit vak, dus overhoren kan nog niet." },
      { status: 400 }
    );
  }

  const leerfaseInstructie = LEERFASE_INSTRUCTIE[leerfase] ?? LEERFASE_INSTRUCTIE.tussentijds;

  if (modus === "scope") {
    const hoofdstukken = Array.from(new Set(materials.map((m) => m.hoofdstuk).filter(Boolean)));
    const prompt = `Je gaat een leerling van de Nederlandse middelbare school (Havo) overhoren op het vak "${subject.name}".
${leerfaseInstructie}
Voordat je begint met vragen stellen, stel je EERST een korte, vriendelijke vraag aan de leerling om de sessie af te stemmen. Combineer in die ene vraag:
- welk onderdeel overhoord moet worden (noem er een paar concreet als voorbeeld, of vraag of het om alle stof gaat) - beschikbare hoofdstukken/onderwerpen: ${hoofdstukken.length > 0 ? hoofdstukken.join(", ") : "(geen indeling bekend, vraag algemeen naar het onderwerp)"};
- hoe de vragen gesteld moeten worden (bijvoorbeeld open vragen, of meerkeuze zoals de echte toets dat doet) - vraag dit vooral door als de leerling al weet hoe de toets eruitziet.
Stel dit als EEN natuurlijke, beknopte vraag (geen opsomming/lijstje), pas de toon aan op de leerfase hierboven. Zet dit in het "vraag"-veld. Laat "feedback" leeg en "beoordeling" op "geen".`;

    try {
      const client = createGeminiClient();
      const geparsed = await genereerGestructureerd(client, ResponsSchema, [{ role: "user", parts: [{ text: prompt }] }], 1024);
      return NextResponse.json(geparsed);
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? `AI-verwerking mislukt: ${e.message}` : "AI-verwerking mislukt." },
        { status: 502 }
      );
    }
  }

  const overhoorMaterialen =
    materials.length > GROTE_KENNISBANK_DREMPEL ? kiesWillekeurigeSelectie(materials, MAX_OVERHOOR_MATERIALEN) : materials;
  let kennisbank = overhoorMaterialen.map((m) => `## ${m.title}\n${m.content}`).join("\n\n");
  if (kennisbank.length > MAX_KENNISBANK_TEKENS) {
    kennisbank = kennisbank.slice(0, MAX_KENNISBANK_TEKENS) + "\n[...ingekort...]";
  }

  const spellingInstructie = spellingStrict
    ? "Let bij het beoordelen streng op correcte spelling - een verder inhoudelijk goed antwoord met een spelfout beoordeel je als 'deels' in plaats van 'goed'."
    : "Let bij het beoordelen alleen op de inhoud/betekenis van het antwoord - spelfouten mogen genegeerd worden.";

  const prompt = `Je overhoort een leerling van de Nederlandse middelbare school (Havo) op het vak "${subject.name}".
${leerfaseInstructie}
${spellingInstructie}
Stel altijd maar 1 vraag tegelijk, kort en concreet. Varieer het soort vraag (begripsvraag, rekenvraag, definitie, toepassing) waar de lesstof dat toelaat.
Stukjes tussen "[INTERN ..." en het einde van dat blok in de lesstof zijn alleen voor jou (bewijsniveau, bladzijde-status) - baseer daar nooit een vraag op en noem dit nooit tegen de leerling.
${
  scopeInstructie
    ? `\nDe leerling gaf aan bij het opstarten van deze sessie: "${scopeInstructie}". Houd hier zoveel mogelijk rekening mee - zowel bij de onderwerpkeuze (welk hoofdstuk/onderdeel, of alles) als bij de vraagstijl (bv. als meerkeuze gevraagd is, zet dan de opties duidelijk in de vraagtekst zelf, met letters a/b/c/d).\n`
    : ""
}
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
    const geparsed = await genereerGestructureerd(
      client,
      ResponsSchema,
      [{ role: "user", parts: [{ text: prompt }] }],
      2048
    );
    return NextResponse.json(geparsed);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? `AI-verwerking mislukt: ${e.message}` : "AI-verwerking mislukt." },
      { status: 502 }
    );
  }
}
