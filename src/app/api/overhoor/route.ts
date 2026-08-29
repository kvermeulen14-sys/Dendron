import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createGeminiClient, vereistGeminiKey, genereerGestructureerd } from "@/lib/gemini";
import {
  bouwKennisbankUitOnderdelen,
  type KennisOnderdeelRij,
  type KennisParagraafContextRij,
  type KennisWoordenlijstRij,
} from "@/lib/kennisbank";
import { bouwOefenGeschiedenisBlok, type OefenSessieVoorChat } from "@/lib/oefengeschiedenis";
import { saneerLatexNotatie } from "@/lib/tekst";

const MAX_KENNISBANK_TEKENS = 14000;

const ResponsSchema = z.object({
  feedback: z
    .string()
    .describe(
      "Korte, vriendelijke feedback specifiek op DEZE poging van de leerling (wat ging goed/fout in wat hij deed), of leeg als er nog geen antwoord was. Dit is geen theorie-uitleg (zie 'theorieHint' daarvoor) - dit gaat over de poging zelf."
    ),
  beoordeling: z
    .enum(["goed", "deels", "fout", "geen"])
    .describe(
      "Beoordeling van het vorige antwoord, of 'geen' als er nog geen antwoord was. BELANGRIJK bij een meerkeuzevraag (herkenbaar aan 'Opties van de vorige vraag' hieronder): dan is dit ALTIJD 'goed' of 'fout', NOOIT 'deels' - 1 aangeklikte optie is exact goed of exact fout, 'een beetje goed' bestaat niet bij meerkeuze. 'deels' is alleen mogelijk bij een open (getypte) vraag, voor een antwoord dat inhoudelijk deels klopt."
    ),
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
      "Verplicht (nooit null) als de ZOJUIST beoordeelde vraag een meerkeuzevraag was (zie 'Opties van de vorige vraag') en de beoordeling niet 'goed' is: de EXACTE, woord-voor-woord identieke tekst van de juiste optie uit die lijst - de app vergelijkt dit als platte tekst om 'm groen te markeren, dus GEEN parafrase. Null als er nog geen antwoord was, bij een open vraag, of als de beoordeling 'goed' is."
    ),
  theorieHint: z
    .string()
    .nullable()
    .describe(
      "Alleen bij beoordeling 'deels' of 'fout': een korte (2-3 zinnen), zelfstandige herformulering van de onderliggende regel/theorie die bij dit onderdeel hoort - je EIGEN interpretatie in gewone taal, GEEN letterlijke aanhaling van de lesstof-tekst hieronder. Dit is de EERSTE, korte hint die de leerling meteen te zien krijgt (in plaats van de leerling zelf de ruwe lesstof te laten lezen) - dus wél de kern van de regel, maar los van de specifieke fout in deze poging (dat hoort in 'feedback'). Pas als de leerling daarna nog om extra uitleg vraagt, volgt een uitgebreidere versie. Null bij 'goed' of 'geen'."
    ),
  juisteAntwoord: z
    .string()
    .nullable()
    .describe(
      "Het EXACTE juiste antwoord op de ZOJUIST BEOORDEELDE vraag (niet de nieuwe vraag hierboven) - kort en concreet (het getal/de term/de formule), geen uitleg. Verplicht bij beoordeling 'deels' of 'fout' op een open vraag. Null bij 'goed' of 'geen', en bij een meerkeuzevraag (die heeft al 'juisteOptie')."
    ),
  zelfCheck: z
    .boolean()
    .describe(
      "True als de NIEUWE vraag hierboven een open vraag is waarvan het juiste antwoord lastig exact te typen is (bv. machten, breuken, wortels, of een meerstaps herleiding) - de leerling werkt het dan op papier uit en controleert zelf i.p.v. intypen. Bij een meerkeuzevraag of een vraag met een kort simpel antwoord: altijd false."
    ),
  zelfCheckAntwoord: z
    .string()
    .nullable()
    .describe(
      "Alleen als zelfCheck true is: het volledige juiste antwoord/uitwerking van de NIEUWE vraag hierboven, in dezelfde notatiestijl als de rest (² i.p.v. ^2, breuk-blok voor breuken). Null als zelfCheck false is."
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
- Gebruik ECHT NOOIT LaTeX-notatie, ook niet voor iets kleins tussendoor. Dit is dus FOUT: "$6 \\times 7$", "\\frac{2}{3}", "$x^2$" - schrijf ALTIJD gewone, leesbare tekst met echte Unicode-tekens.
- Gebruik ook NOOIT een caret (^) voor machten of een underscore (_) voor een index/subscript - dat zijn programmeertekens, geen wiskundenotatie, en een leerling leest dat niet als een macht. Gebruik ALTIJD de echte Unicode-tekens: ² ³ ⁴ ⁵ ⁶ ⁷ ⁸ ⁹ (dus "x²" en "(2x²)³", nooit "x^2" of "(2x^2)^3"). Voor een index/subscript: schrijf het in woorden i.p.v. een underscore (bv. "V nieuw" i.p.v. "V_nieuw").
- Schrijf een breuk NOOIT als platte tekst zoals "2/3" (een leerling ziet dan geen teller/noemer) - gebruik in plaats daarvan dit blok, EEN per breuk-uitdrukking:

\`\`\`breuk
{"titel": "2/3 keer 4/5", "operator": "×", "breuken": [{"teller": 2, "noemer": 3}, {"teller": 4, "noemer": 5}], "uitkomst": {"teller": 8, "noemer": 15}}
\`\`\`
("operator" is "×", "+", "-" of "÷"; "uitkomst" is optioneel, laat weg als je die nog niet geeft; zet dit blok in de vraag- of feedbacktekst zelf op de plek waar de breuk zou staan)`;

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

  const { subjectId, spellingStrict, leerfase, gesteldeVragen, vorigeVraag, vorigAntwoord, vorigeOpties, scopeInstructie, modus, eerdereUitleg } =
    await request.json();
  const vorigeWasMeerkeuze = Array.isArray(vorigeOpties) && vorigeOpties.length > 0;
  if (!subjectId) return NextResponse.json({ error: "subjectId is verplicht." }, { status: 400 });

  const { data: subject } = await supabase.from("subjects").select("id, name").eq("id", subjectId).single();
  if (!subject) return NextResponse.json({ error: "Vak niet gevonden." }, { status: 404 });

  const { data: kennisOnderdelen } = await supabase
    .from("kennis_onderdelen")
    .select("paragraaf_id, naam, regel, voorbeelden, gecombineerd_voorbeeld, tip, uitzondering, fout_voorbeeld")
    .eq("subject_id", subjectId)
    .eq("status", "gepubliceerd");
  const { data: kennisContexten } = await supabase
    .from("kennis_paragraaf_context")
    .select("paragraaf_id, titel, leerdoelen, voorkennis, kernbegrippen")
    .eq("subject_id", subjectId)
    .eq("status", "gepubliceerd");
  const { data: kennisWoordenlijsten } = await supabase
    .from("kennis_woordenlijsten")
    .select("paragraaf_id, titel, woorden")
    .eq("subject_id", subjectId)
    .eq("status", "gepubliceerd");

  // Eerdere sessies waarin de leerling iets nog niet (helemaal) goed had -
  // zodat de quiz zelf af en toe kan teruggrijpen op recent gemiste stof
  // i.p.v. dat alleen de vakdocent-chat dat weet (zie oefengeschiedenis.ts).
  const { data: recenteOefenSessies } = await supabase
    .from("overhoor_sessies")
    .select("hoofdstuk, transcript")
    .eq("subject_id", subjectId)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(3);

  const heeftKennisOnderdelen = (kennisOnderdelen?.length ?? 0) > 0 || (kennisWoordenlijsten?.length ?? 0) > 0;

  if (!heeftKennisOnderdelen) {
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

    let kennisbankUitleg: string = bouwKennisbankUitOnderdelen(
      (kennisOnderdelen ?? []) as KennisOnderdeelRij[],
      (kennisContexten ?? []) as KennisParagraafContextRij[],
      (kennisWoordenlijsten ?? []) as KennisWoordenlijstRij[]
    );
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
      return NextResponse.json({ ...geparsed, uitleg: saneerLatexNotatie(geparsed.uitleg) });
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? `AI-verwerking mislukt: ${e.message}` : "AI-verwerking mislukt." },
        { status: 502 }
      );
    }
  }

  let kennisbank: string = bouwKennisbankUitOnderdelen(
    (kennisOnderdelen ?? []) as KennisOnderdeelRij[],
    (kennisContexten ?? []) as KennisParagraafContextRij[],
    (kennisWoordenlijsten ?? []) as KennisWoordenlijstRij[]
  );
  if (kennisbank.length > MAX_KENNISBANK_TEKENS) {
    kennisbank = kennisbank.slice(0, MAX_KENNISBANK_TEKENS) + "\n[...ingekort...]";
  }
  const oefenGeschiedenisBlok = bouwOefenGeschiedenisBlok((recenteOefenSessies ?? []) as OefenSessieVoorChat[]);
  kennisbank += oefenGeschiedenisBlok;

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
    ? vorigAntwoord.startsWith("(zelf gecontroleerd:")
      ? `De leerling heeft de vorige vraag op papier uitgewerkt en zelf tegen het juiste antwoord gecontroleerd, met dit resultaat: ${vorigAntwoord}\nVraag: ${vorigeVraag}\nVertrouw dit zelf-gerapporteerde resultaat direct - beoordeel niet zelf opnieuw. Zet "beoordeling" op 'goed' bij "had ik goed", of 'fout' bij "nog niet helemaal goed". Geef bij 'goed' een korte felicitatie. Geef bij 'fout' een korte, bemoedigende "feedback" (2-3 zinnen) over deze poging EN vul "theorieHint" in. Laat "juisteAntwoord" op null (de leerling heeft het antwoord al gezien).\n\n`
      : vorigeWasMeerkeuze
        ? `Dit was een MEERKEUZEVRAAG met deze opties:\n${(vorigeOpties as string[]).map((o) => `- ${o}`).join("\n")}\nDe leerling koos: "${vorigAntwoord}"\nBepaal of dit EXACT de juiste optie was. Zet "beoordeling" ALTIJD op 'goed' (de juiste optie gekozen) of 'fout' (een andere optie gekozen) - NOOIT 'deels', want 1 aangeklikte optie is exact goed of exact fout, "een beetje goed" bestaat niet bij meerkeuze. Geef bij 'goed' een korte felicitatie MET in 1 zin WAAROM het klopt. Geef bij 'fout' een korte, vriendelijke "feedback" (waarom deze optie niet klopt) EN vul "juisteOptie" VERPLICHT in met de EXACTE tekst van de juiste optie uit de lijst hierboven (woord-voor-woord identiek, want de app vergelijkt dit als platte tekst) EN vul "theorieHint" in. Laat "juisteAntwoord" op null (die is alleen voor open vragen).\n\n`
        : `Beoordeel eerst dit antwoord van de leerling:\nVraag: ${vorigeVraag}\nAntwoord van de leerling: ${vorigAntwoord}\nGeef een beoordeling (goed/deels/fout). Bij 'goed': korte felicitatie MET in 1 zin WAAROM het klopt (zo blijft ook een gokje dat toevallig goed was leerzaam, en wordt goed gokken niet beloond met niets). Bij 'deels' of 'fout': geef in "feedback" een korte, concrete reactie (2-3 zinnen) op WAT er in DEZE poging misging - niet de theorie in het algemeen, dat hoort in "theorieHint" - EN vul "juisteAntwoord" in met het exacte juiste antwoord (kort, geen uitleg) EN vul "theorieHint" in. BELANGRIJK: een antwoord dat geen echte inhoudelijke poging is (bijvoorbeeld enkel "?", "weet niet", "geen idee", of duidelijk willekeurige tekst) is ALTIJD 'fout' - beoordeel zo'n antwoord nooit als 'goed' of 'deels', ook al lijkt het toevallig ergens op te passen.\n\n`
    : "Er is nog geen vorig antwoord - laat feedback leeg en beoordeling op 'geen'.\n\n"
}${
  oefenGeschiedenisBlok
    ? `Weef er, als dat past bij het gekozen onderwerp, af en toe (niet elke vraag, en niet als allereerste) een NIEUWE vraag tussendoor die aansluit bij het RECENTE OEFENGESCHIEDENIS-blok hieronder - herhaald ophalen van iets wat nog niet helemaal beklijfde is precies waar oefenen het meest oplevert. Maak er geen sleur van, en nooit verwijtend ("dit had je fout") - gewoon een frisse nieuwe vraag over hetzelfde onderwerp.\n`
    : ""
}Stel daarna een NIEUWE vraag over de lesstof hieronder. Deze vragen zijn deze sessie al gesteld, stel geen vraag die daar erg op lijkt: ${
    Array.isArray(gesteldeVragen) && gesteldeVragen.length > 0 ? gesteldeVragen.join(" | ") : "(nog geen)"
  }
Bepaal voor deze NIEUWE vraag ook "zelfCheck": true als het juiste antwoord lastig exact te typen is (machten, breuken, wortels, een meerstaps herleiding) - vul dan ook "zelfCheckAntwoord" met het volledige juiste antwoord. Bij een meerkeuzevraag of een vraag met een kort, simpel antwoord (een getal, woord, jaartal): "zelfCheck" false en "zelfCheckAntwoord" null.

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

    return NextResponse.json({
      ...geparsed,
      feedback: saneerLatexNotatie(geparsed.feedback),
      vraag: saneerLatexNotatie(geparsed.vraag),
      opties: geparsed.opties ? geparsed.opties.map((o) => saneerLatexNotatie(o)) : geparsed.opties,
      juisteOptie: geparsed.juisteOptie ? saneerLatexNotatie(geparsed.juisteOptie) : geparsed.juisteOptie,
      juisteAntwoord: geparsed.juisteAntwoord ? saneerLatexNotatie(geparsed.juisteAntwoord) : geparsed.juisteAntwoord,
      zelfCheckAntwoord: geparsed.zelfCheckAntwoord ? saneerLatexNotatie(geparsed.zelfCheckAntwoord) : geparsed.zelfCheckAntwoord,
      theorieHint: geparsed.theorieHint ? saneerLatexNotatie(geparsed.theorieHint) : geparsed.theorieHint,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? `AI-verwerking mislukt: ${e.message}` : "AI-verwerking mislukt." },
      { status: 502 }
    );
  }
}
