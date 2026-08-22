import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createGeminiClient, vereistGeminiKey, GEMINI_MODEL } from "@/lib/gemini";
import { kiesRelevanteMaterialen } from "@/lib/kennisbank";

const MAX_GESCHIEDENIS = 20;
const MAX_KENNISBANK_TEKENS = 14000;
const MAX_AFBEELDINGEN = 3;

// Deterministische visuals (grafiek/getallenlijn/tabel/diagram) die de AI in
// zijn antwoord kan zetten als een los code-blok - zie lib/visuals.ts voor
// de parser/validatie en components/visuals voor het renderen als SVG.
const VISUAL_INSTRUCTIE = `Als een grafiek, getallenlijn, tabel of diagram de uitleg echt duidelijker maakt, voeg die toe als EEN los code-blok, in exact dit formaat (reken de waarden altijd eerst zelf uit, verzin niets, gebruik dit alleen als het echt helpt en maximaal 1 per antwoord):

\`\`\`grafiek
{"titel": "y = x^2 - 2", "xMin": -5, "xMax": 5, "yMin": -4, "yMax": 8, "functies": [{"label": "y = x^2 - 2", "a": 1, "b": 0, "c": -2}], "punten": [{"label": "top", "x": 0, "y": -2}]}
\`\`\`
(voor grafieken geldt altijd y = a*x^2 + b*x + c; gebruik a=0 voor een rechte lijn; "punten" is optioneel)

\`\`\`getallenlijn
{"titel": "wortel van 2 op de getallenlijn", "min": -3, "max": 3, "punten": [{"label": "√2", "waarde": 1.41}]}
\`\`\`

\`\`\`tabel
{"titel": "waardetabel", "xLabel": "x", "yLabel": "y", "rijen": [{"x": -2, "y": 4}, {"x": 0, "y": 0}, {"x": 2, "y": 4}]}
\`\`\`

\`\`\`diagram
{"titel": "cijfers per vak", "soort": "staaf", "categorieen": [{"label": "wiskunde", "waarde": 8}, {"label": "engels", "waarde": 6}]}
\`\`\`
("soort" is "staaf" of "cirkel")

Zet dit blok NIET in plaats van je uitleg, maar erbij - je normale tekst blijft gewoon het antwoord.`;

function bouwSysteemPrompt(
  subjectName: string,
  aiInstructions: string,
  kennisbank: string,
  modus: "alles" | "selectie" | "index"
) {
  const routeringsinstructie =
    modus === "index"
      ? "Hieronder staat alleen een INHOUDSOPGAVE (geen volledige lesstof) omdat er geen duidelijke match was met een specifiek hoofdstuk/paragraaf. Vraag de leerling eerst kort naar het hoofdstuk, de paragraaf of de bladzijde (of een foto van de opgave/bladzijde), en ga pas daarna inhoudelijk in op de vraag. Gok nooit welk onderwerp bedoeld wordt."
      : modus === "selectie"
        ? "Hieronder staat een SELECTIE van de meest relevante lesstof (niet de hele methode) op basis van het bericht van de leerling. Als deze selectie niet goed aansluit bij de vraag, zeg dat eerlijk en vraag om het hoofdstuk/de paragraaf of een foto in plaats van te improviseren."
        : "Hieronder staat de volledige beschikbare lesstof voor dit vak.";

  return `Je bent een persoonlijke, geduldige vakdocent/coach voor het vak "${subjectName}", voor een leerling in de tweede klas van het Havo.

Jouw belangrijkste doel is de leerling te helpen ZELF te leren en begrijpen - niet om meteen het kant-en-klare antwoord te geven. Werk zo:
- Stel eerst een korte, gerichte vraag terug of geef een hint, zodat de leerling zelf een stap kan zetten.
- Bouw in kleine stapjes op, controleer of iets begrepen is voordat je verdergaat.
- Geef pas een volledig antwoord of de uitleg in een keer als de leerling er na een paar hints echt niet uitkomt, of als er expliciet om gevraagd wordt ("geef me gewoon het antwoord").
- Wees kort, vriendelijk en bemoedigend. Dit is een chatgesprek, geen collegetekst.

Blijf inhoudelijk dicht bij de lesstof van dit vak hieronder - dat is wat er op school behandeld wordt. Ga niet breeduit op andere onderwerpen in, tenzij de leerling daar zelf expliciet naar vraagt.

Belangrijke regels over de lesstof hieronder:
- Verzin nooit de letterlijke tekst van een boekopgave. Als de leerling een concrete opgave noemt (bv. "opgave 38") en de exacte opgavetekst staat niet in de lesstof, vraag dan om een foto of om de opgave over te typen.
- Als een los opgave-/bladzijdenummer wordt genoemd zonder hoofdstuk of paragraaf en er zijn meerdere kandidaten mogelijk, kies nooit stilzwijgend - stel een korte vraag (welk hoofdstuk/welke paragraaf/welk boekdeel, of een foto).
- Stukjes tussen "[INTERN ..." en het einde van dat blok zijn alleen voor jou (bewijsniveau, bladzijde-status, foto-adviezen) - noem dit nooit letterlijk of impliciet tegen de leerling. Gebruik het wel om in te schatten hoe zeker je mag klinken; vraag desnoods zelf om een foto van de theorie voordat je een exacte formule/definitie stellig presenteert.
${routeringsinstructie}
${aiInstructions ? `\nExtra instructies van de ouder/docent: ${aiInstructions}\n` : ""}
${VISUAL_INSTRUCTIE}

Antwoord altijd in het Nederlands.

LESSTOF:
${kennisbank || "(nog geen lesstof toegevoegd - vertel de leerling dat je nog geen specifieke lesstof hebt en help voorlopig algemeen, maar vraag of ze het onderwerp kunnen noemen.)"}`;
}

function bouwOpdrachtSysteemPrompt(
  subjectName: string,
  aiInstructions: string,
  kennisbank: string,
  modus: "alles" | "selectie" | "index"
) {
  const routeringsinstructie =
    modus === "index"
      ? "Hieronder staat alleen een INHOUDSOPGAVE (geen volledige lesstof) omdat er geen duidelijke match was met een specifiek hoofdstuk/paragraaf. Vraag naar het hoofdstuk/de paragraaf/bladzijde (of een foto) voordat je verdergaat."
      : modus === "selectie"
        ? "Hieronder staat een SELECTIE van de meest relevante lesstof op basis van wat de leerling tot nu toe heeft gezegd."
        : "Hieronder staat de volledige beschikbare lesstof voor dit vak.";

  return `Je helpt een leerling in de tweede klas van het Havo met het maken van een SPECIFIEKE huiswerkopgave voor het vak "${subjectName}" - dit is geen algemeen uitlegkanaal, maar gericht op 1 opgave tegelijk.

Werkwijze:
1. Als nog niet duidelijk is welke opgave het is, vraag dat EERST: welk hoofdstuk/paragraaf/bladzijde en opgavenummer, of vraag om een foto/overgetypte opgave. Ga pas inhoudelijk verder zodra dit duidelijk is.
2. Help daarna stap voor stap: geef eerst een korte hint of een controlevraag, laat de leerling zelf de eerstvolgende stap zetten, en controleer die stap voordat je verdergaat.
3. Geef nooit in een keer de volledige uitwerking - alleen als de leerling er na een paar hints echt niet uitkomt, of expliciet om de uitwerking vraagt.
4. Let op notatie, tekens, eenheden en afronding; benoem hooguit een fout tegelijk, vriendelijk.
5. Wees kort. Dit is een chatgesprek, geen collegetekst.

Belangrijke regels over de lesstof hieronder:
- Verzin nooit de letterlijke tekst van een boekopgave - de exacte opgavetekst staat niet in de lesstof, dus vraag altijd om een foto of om de opgave over te typen als je die nodig hebt.
- Stukjes tussen "[INTERN ..." en het einde van dat blok zijn alleen voor jou (bewijsniveau, bladzijde-status, foto-adviezen) - noem dit nooit tegen de leerling. Vraag desnoods zelf om een foto van de theorie voordat je een exacte formule/definitie stellig gebruikt.
${routeringsinstructie}
${aiInstructions ? `\nExtra instructies van de ouder/docent: ${aiInstructions}\n` : ""}
${VISUAL_INSTRUCTIE}

Antwoord altijd in het Nederlands.

LESSTOF:
${kennisbank || "(nog geen lesstof toegevoegd - vraag de leerling om de opgave over te typen of te fotograferen, en help op basis daarvan zo goed mogelijk.)"}`;
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

  const { subjectId, message, gespreksmodus, opdrachtGeschiedenis } = await request.json();
  if (!subjectId || !message || typeof message !== "string") {
    return NextResponse.json({ error: "subjectId en message zijn verplicht." }, { status: 400 });
  }
  const isOpdrachtModus = gespreksmodus === "opdracht";

  const { data: subject } = await supabase
    .from("subjects")
    .select("id, name, ai_instructions, family_id")
    .eq("id", subjectId)
    .single();
  if (!subject) return NextResponse.json({ error: "Vak niet gevonden." }, { status: 404 });

  const { data: materials } = await supabase
    .from("materials")
    .select("id, title, content, hoofdstuk, image_path")
    .eq("subject_id", subjectId);

  // Opdrachten-maken-modus is net als overhoren niet-persistent (aparte
  // sessie per keer openen); de client stuurt zijn eigen berichtgeschiedenis
  // mee (oudste eerst) in plaats van dat de server chat_messages leest/schrijft.
  let geschiedenisChronologisch: { role: string; content: string }[];
  if (isOpdrachtModus) {
    geschiedenisChronologisch = (Array.isArray(opdrachtGeschiedenis) ? opdrachtGeschiedenis : []).slice(
      -MAX_GESCHIEDENIS
    );
  } else {
    const { data: dbGeschiedenis } = await supabase
      .from("chat_messages")
      .select("role, content, created_at")
      .eq("subject_id", subjectId)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(MAX_GESCHIEDENIS);
    geschiedenisChronologisch = (dbGeschiedenis ?? []).slice().reverse();
  }

  // Recente eigen berichten meenemen in de zoektekst, zodat "opgave 38" nog
  // steeds matcht op een paragraaf die een paar berichten eerder al genoemd is.
  const recenteVragen = geschiedenisChronologisch
    .filter((m) => m.role !== "model")
    .slice(-4)
    .map((m) => m.content)
    .join(" ");
  const { modus, gekozen } = kiesRelevanteMaterialen(materials ?? [], `${message} ${recenteVragen}`);

  let kennisbank: string;
  if (modus === "index") {
    kennisbank = (materials ?? [])
      .map((m) => `- ${m.title}${m.hoofdstuk ? ` (${m.hoofdstuk})` : ""}`)
      .join("\n");
  } else {
    kennisbank = gekozen.map((m) => `## ${m.title}\n${m.content}`).join("\n\n");
    if (kennisbank.length > MAX_KENNISBANK_TEKENS) {
      kennisbank = kennisbank.slice(0, MAX_KENNISBANK_TEKENS) + "\n[...ingekort...]";
    }
  }

  // Afbeeldingen die bij de gekozen lesstof horen, zodat de leerling ze
  // opnieuw kan zien bij de uitleg.
  const afbeeldingen: { url: string; title: string }[] = [];
  const materialsMetAfbeelding = gekozen.filter((m) => m.image_path);
  for (const m of materialsMetAfbeelding.slice(0, MAX_AFBEELDINGEN)) {
    if (!m.image_path) continue;
    const { data: signed } = await supabase.storage.from("lesstof").createSignedUrl(m.image_path, 3600);
    if (signed?.signedUrl) afbeeldingen.push({ url: signed.signedUrl, title: m.title });
  }

  const historyVoorGemini = geschiedenisChronologisch.map((m) => ({
    role: (m.role === "model" ? "model" : "user") as "user" | "model",
    parts: [{ text: m.content }],
  }));

  const client = createGeminiClient();
  const systeemPrompt = isOpdrachtModus
    ? bouwOpdrachtSysteemPrompt(subject.name, subject.ai_instructions ?? "", kennisbank, modus)
    : bouwSysteemPrompt(subject.name, subject.ai_instructions ?? "", kennisbank, modus);

  let antwoord: string;
  try {
    const response = await client.models.generateContent({
      model: GEMINI_MODEL,
      contents: [...historyVoorGemini, { role: "user", parts: [{ text: message }] }],
      config: {
        systemInstruction: systeemPrompt,
        maxOutputTokens: 2048,
      },
    });
    antwoord = response.text ?? "";
  } catch {
    return NextResponse.json(
      { error: "De AI-vakdocent reageert nu niet. Probeer het straks nog eens." },
      { status: 502 }
    );
  }

  if (!isOpdrachtModus) {
    await supabase.from("chat_messages").insert([
      { family_id: subject.family_id, subject_id: subjectId, user_id: user.id, role: "user", content: message },
      { family_id: subject.family_id, subject_id: subjectId, user_id: user.id, role: "model", content: antwoord },
    ]);
  }

  return NextResponse.json({ reply: antwoord, images: afbeeldingen });
}
