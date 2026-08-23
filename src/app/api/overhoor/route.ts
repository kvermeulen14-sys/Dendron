import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createGeminiClient, vereistGeminiKey, genereerGestructureerd } from "@/lib/gemini";
import { GROTE_KENNISBANK_DREMPEL, kiesBesteMateriaal, kiesWillekeurigeSelectie } from "@/lib/kennisbank";

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
  juisteOptie: z
    .string()
    .nullable()
    .describe(
      "Alleen bij een meerkeuzevraag: de letterlijke tekst van de juiste optie uit de 'opties' van de NET beoordeelde vraag (dus niet de nieuwe vraag hierboven) - hiermee kan de app die groen markeren. Null als er nog geen antwoord was, bij een open vraag, of als de vorige vraag geen meerkeuzevraag was."
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
- Gebruik NOOIT LaTeX-notatie (dus geen $...$, \\frac{}{}, \\times, \\cdot e.d.).
- Gebruik ook NOOIT een caret (^) voor machten of een underscore (_) voor een index/subscript - dat zijn programmeertekens, geen wiskundenotatie, en een leerling leest dat niet als een macht. Gebruik ALTIJD de echte Unicode-tekens: ² ³ ⁴ ⁵ ⁶ ⁷ ⁸ ⁹ (dus "x²" en "(2x²)³", nooit "x^2" of "(2x^2)^3"). Voor een index/subscript: schrijf het in woorden i.p.v. een underscore (bv. "V nieuw" i.p.v. "V_nieuw").
- Schrijf een breuk NOOIT als platte tekst zoals "2/3" (een leerling ziet dan geen teller/noemer) - gebruik in plaats daarvan dit blok, EEN per breuk-uitdrukking:

\`\`\`breuk
{"titel": "2/3 keer 4/5", "operator": "×", "breuken": [{"teller": 2, "noemer": 3}, {"teller": 4, "noemer": 5}], "uitkomst": {"teller": 8, "noemer": 15}}
\`\`\`
("operator" is "×", "+", "-" of "÷"; "uitkomst" is optioneel, laat weg als je die nog niet geeft; zet dit blok in de vraag- of feedbacktekst zelf op de plek waar de breuk zou staan)`;

const MAX_FRAGMENT_TEKENS = 500;

// Toont een kort, LETTERLIJK stukje uit de eigen lesstof bij de feedback
// (i.p.v. dat de AI de theorie parafraseert, wat kan hallucineren) - de
// leerling kan zo de echte uitleg uit het boek erbij lezen. Puur
// deterministisch (geen AI-call), hergebruikt dezelfde matching als de
// vakdocent-chat.
function kiesLesstofFragment(
  materials: { id: string; title: string; content: string; hoofdstuk: string | null }[],
  zoekTekst: string
) {
  const beste = kiesBesteMateriaal(materials, zoekTekst);
  if (!beste || !beste.content.trim()) return null;

  let fragment = beste.content.trim();
  if (fragment.length > MAX_FRAGMENT_TEKENS) {
    const afgekapt = fragment.slice(0, MAX_FRAGMENT_TEKENS);
    const laatstePunt = Math.max(afgekapt.lastIndexOf(". "), afgekapt.lastIndexOf(".\n"));
    fragment = (laatstePunt > 100 ? afgekapt.slice(0, laatstePunt + 1) : afgekapt) + "...";
  }
  return { titel: beste.title, tekst: fragment };
}

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
    .select("id, title, content, hoofdstuk")
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
    ? `Beoordeel eerst dit antwoord van de leerling:\nVraag: ${vorigeVraag}\nAntwoord van de leerling: ${vorigAntwoord}\nGeef een beoordeling (goed/deels/fout). Bij 'goed': korte felicitatie MET in 1 zin WAAROM het klopt (zo blijft ook een gokje dat toevallig goed was leerzaam, en wordt goed gokken niet beloond met niets). Bij 'deels' of 'fout': geef GEEN kale foutmelding en niet alleen een hint, maar een echte, behulpzame uitleg (2-4 zinnen) die het onderliggende idee verduidelijkt - zodat de leerling begrijpt WAAROM het niet (helemaal) klopte en hoe het wel zit. BELANGRIJK: een antwoord dat geen echte inhoudelijke poging is (bijvoorbeeld enkel "?", "weet niet", "geen idee", of duidelijk willekeurige tekst) is ALTIJD 'fout' - beoordeel zo'n antwoord nooit als 'goed' of 'deels', ook al lijkt het toevallig ergens op te passen.\n\n`
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
      3072
    );

    // Bij een niet-volledig-goed antwoord: het echte lesstof-fragment erbij
    // zoeken (deterministisch, geen AI-parafrase) zodat de leerling de
    // theorie zelf kan naslaan terwijl het nog vers is.
    let lesstofFragment: { titel: string; tekst: string } | null = null;
    if (vorigeVraag && vorigAntwoord && (geparsed.beoordeling === "deels" || geparsed.beoordeling === "fout")) {
      lesstofFragment = kiesLesstofFragment(materials, `${vorigeVraag} ${vorigAntwoord}`);
    }

    return NextResponse.json({ ...geparsed, lesstofFragment });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? `AI-verwerking mislukt: ${e.message}` : "AI-verwerking mislukt." },
      { status: 502 }
    );
  }
}
