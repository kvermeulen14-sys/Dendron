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
  vraag: z
    .string()
    .describe("De volgende overhoor-vraag. Bij een meerkeuzevraag NOOIT de opties zelf in deze tekst herhalen (a/b/c/d) - die horen apart in 'opties'."),
  opties: z
    .array(z.string())
    .nullable()
    .describe(
      "Alleen bij een meerkeuzevraag: de losse antwoordopties, zonder letter-ervoor (de app voegt zelf a/b/c/d toe). Null bij een open vraag."
    ),
});

const LEERFASE_INSTRUCTIE: Record<string, string> = {
  eerste:
    "De leerling leert dit voor het eerst. Stel een laagdrempelige, ondersteunende vraag en help waar nodig met een klein duwtje in de goede richting.",
  tussentijds:
    "De leerling heeft dit al eerder geleerd en oefent nu. Stel een gemiddeld moeilijke vraag ter herhaling, met iets minder hulp.",
  laatste:
    "Dit is vlak voor de toets. Stel een pittige vraag zoals die op de toets zou kunnen staan, gericht op parate kennis, zonder hints vooraf.",
};

const OPMAAK_INSTRUCTIE = `Opmaak:
- Je mag markdown gebruiken (**vet**, opsommingen met "-") als dat de vraag of feedback echt duidelijker maakt, maar houd het kort.
- Gebruik NOOIT LaTeX-notatie (dus geen $...$, \\frac{}{}, \\times, \\cdot e.d.) - een leerling kent die syntax niet. Schrijf wiskunde in gewone, leesbare tekst: "2/3 × 4/5", "x²", "√2".`;

const UitlegSchema = z.object({
  uitleg: z
    .string()
    .describe(
      "Een echte, uitgebreidere uitleg van het onderwerp achter de vraag (met een concreet voorbeeld of vergelijking), zodat de leerling het nu wel gaat snappen - geen korte hint, maar een volwaardige uitleg."
    ),
});

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

  const { subjectId, spellingStrict, leerfase, gesteldeVragen, vorigeVraag, vorigAntwoord, scopeInstructie, modus, eerdereUitleg } =
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

  // Extra-uitleg-modus: de leerling snapt de vraag (nog) niet, ook niet na de
  // hint in de feedback. Geen nieuwe vraag/beoordeling - alleen een echte,
  // andere uitleg van hetzelfde onderwerp, zodat het uiteindelijk wel landt.
  if (modus === "uitleg") {
    if (!vorigeVraag) return NextResponse.json({ error: "Geen vraag om uit te leggen." }, { status: 400 });

    const overhoorMaterialenUitleg =
      materials.length > GROTE_KENNISBANK_DREMPEL ? kiesWillekeurigeSelectie(materials, MAX_OVERHOOR_MATERIALEN) : materials;
    let kennisbankUitleg = overhoorMaterialenUitleg.map((m) => `## ${m.title}\n${m.content}`).join("\n\n");
    if (kennisbankUitleg.length > MAX_KENNISBANK_TEKENS) {
      kennisbankUitleg = kennisbankUitleg.slice(0, MAX_KENNISBANK_TEKENS) + "\n[...ingekort...]";
    }

    const prompt = `Je helpt een leerling van de Nederlandse middelbare school (Havo) bij het vak "${subject.name}". De leerling snapt de volgende overhoorvraag (nog) niet:
Vraag: ${vorigeVraag}
${vorigAntwoord ? `Het antwoord dat de leerling gaf: ${vorigAntwoord}\n` : ""}${
      eerdereUitleg ? `Je hebt hier net al deze uitleg over gegeven, dat hielp nog niet genoeg - geef nu een ANDERE uitleg of een ander voorbeeld, herhaal niet hetzelfde:\n"${eerdereUitleg}"\n` : ""
    }
Leg het onderliggende onderwerp uit met een concreet voorbeeld of een herkenbare vergelijking, stap voor stap, zodat de leerling het nu echt gaat snappen. Wees warm en geduldig, geen preek - dit is een chatgesprek met een tiener.
${OPMAAK_INSTRUCTIE}

LESSTOF:
${kennisbankUitleg}`;

    try {
      const client = createGeminiClient();
      const geparsed = await genereerGestructureerd(client, UitlegSchema, [{ role: "user", parts: [{ text: prompt }] }], 1536);
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
${OPMAAK_INSTRUCTIE}
Stel altijd maar 1 vraag tegelijk, kort en concreet. Varieer het soort vraag (begripsvraag, rekenvraag, definitie, toepassing) waar de lesstof dat toelaat.
Stukjes tussen "[INTERN ..." en het einde van dat blok in de lesstof zijn alleen voor jou (bewijsniveau, bladzijde-status) - baseer daar nooit een vraag op en noem dit nooit tegen de leerling.
${
  scopeInstructie
    ? `\nDe leerling koos bij het opstarten van deze sessie: "${scopeInstructie}". Houd hier zoveel mogelijk rekening mee bij de onderwerpkeuze. Als er om meerkeuzevragen gevraagd is: vul dan bij ELKE vraag het "opties"-veld met 3-4 losse antwoordopties (zonder a/b/c/d ervoor, dat voegt de app toe) en laat de vraagtekst zelf kort en zonder de opties. Als er om open vragen gevraagd is: laat "opties" op null.\n`
    : ""
}
${
  vorigeVraag && vorigAntwoord
    ? `Beoordeel eerst dit antwoord van de leerling:\nVraag: ${vorigeVraag}\nAntwoord van de leerling: ${vorigAntwoord}\nGeef een beoordeling (goed/deels/fout). Bij 'goed' volstaat een korte felicitatie. Bij 'deels' of 'fout': geef GEEN kale foutmelding en niet alleen een hint, maar een echte, behulpzame uitleg (2-4 zinnen) die het onderliggende idee verduidelijkt - zodat de leerling begrijpt WAAROM het niet (helemaal) klopte en hoe het wel zit.\n\n`
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
