import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { createGeminiClient, vereistGeminiKey, GEMINI_MODEL, GEMINI_VISION_MODEL } from "@/lib/gemini";
import {
  kiesRelevanteMaterialen,
  bouwKennisbankUitOnderdelen,
  type KennisOnderdeelRij,
  type KennisParagraafContextRij,
  type KennisWoordenlijstRij,
} from "@/lib/kennisbank";
import { bouwOefenGeschiedenisBlok, type OefenSessieVoorChat } from "@/lib/oefengeschiedenis";

const MAX_AFBEELDING_BYTES = 8 * 1024 * 1024; // 8MB (ruim voor een foto, zonder de request onnodig groot te maken)
const TOEGESTANE_AFBEELDING_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/heic", "image/heif"];

function extensieVoorMimeType(mimeType: string) {
  const na_slash = mimeType.split("/")[1] || "jpg";
  return na_slash === "jpeg" ? "jpg" : na_slash;
}

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
(voor een grafiek van een FUNCTIE geldt altijd y = a*x^2 + b*x + c; gebruik a=0 voor een rechte lijn; "punten" is optioneel)

Voor een MEETKUNDIGE figuur (driehoek, vierhoek, elke figuur met rechte zijden tussen punten) gebruik je HETZELFDE \`\`\`grafiek\`\`\`-blok, maar dan met "lijnstukken" in plaats van "functies" - "functies" is alleen voor y=ax²+bx+c en kan geen los lijnstuk tussen 2 punten tekenen (dat trekt de lijn door het hele venster). Elk lijnstuk verwijst naar het "label" van 2 punten uit "punten":
\`\`\`grafiek
{"titel": "Rechthoekige driehoek ABC", "xMin": 0, "xMax": 5, "yMin": 0, "yMax": 5, "functies": [], "punten": [{"label": "A", "x": 1, "y": 1}, {"label": "B", "x": 4, "y": 1}, {"label": "C", "x": 4, "y": 4}], "lijnstukken": [{"label": "AB", "van": "A", "naar": "B"}, {"label": "BC", "van": "B", "naar": "C"}, {"label": "CA", "van": "C", "naar": "A"}]}
\`\`\`
(elk "van"/"naar" MOET exact een label uit "punten" zijn, anders wordt het lijnstuk niet getekend)

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

\`\`\`breuk
{"titel": "2/3 keer 4/5", "operator": "×", "breuken": [{"teller": 2, "noemer": 3}, {"teller": 4, "noemer": 5}], "uitkomst": {"teller": 8, "noemer": 15}}
\`\`\`
(gebruik dit ALTIJD i.p.v. platte tekst als "2/3" zodra teller/noemer er echt toe doen - bv. breuken optellen/vermenigvuldigen/vereenvoudigen; "operator" is "×", "+", "-" of "÷"; "uitkomst" is optioneel, laat weg als je die nog niet geeft)

Zet dit blok NIET in plaats van je uitleg, maar erbij - je normale tekst blijft gewoon het antwoord.`;

const OPMAAK_INSTRUCTIE = `Opmaak:
- Je mag markdown gebruiken (**vet**, opsommingen met "-", genummerde stappen) om je antwoord makkelijker leesbaar te maken - gebruik dit om structuur te geven, niet overdreven.
- Gebruik NOOIT LaTeX-notatie (dus geen $...$, \\frac{}{}, \\times, \\cdot e.d.) - een leerling kent die syntax niet en ziet dan alleen rare tekens. Schrijf wiskunde in gewone, leesbare tekst: "x²", "√2", "3 x + 5 = 11".
- Voor een BREUK geldt een uitzondering: schrijf die nooit als platte tekst zoals "2/3" (een leerling ziet dan geen teller/noemer) - gebruik altijd het breuk-blok hierboven, ook als je er zelf naar verwijst in je uitleg (zeg dan bv. "kijk naar de breuk hieronder" i.p.v. de breuk zelf uit te typen).`;

const AFBEELDING_INSTRUCTIE = `Bij de foto die is bijgevoegd: lees eerst zorgvuldig en LETTERLIJK wat erop staat (de exacte opgavetekst, cijfers, letters/variabelen, labels in een figuur) voordat je erop reageert. Vertrouw alleen wat je op de foto kunt onderscheiden - verzin of vul nooit een woord, cijfer of teken aan dat je niet goed kunt lezen, en verwar bijvoorbeeld nooit rechthoek/figuur I met II of een a met een b. Vat de opgave zo dicht mogelijk bij de letterlijke tekst op de foto samen. Is de foto onscherp, schuin gefotografeerd of gedeeltelijk onleesbaar, of twijfel je over een cijfer/teken? Zeg dat dan expliciet en vraag om een scherpere/rechtere foto of om het stukje over te typen, in plaats van te gokken.

Zet HELEMAAL aan het eind van je antwoord, op een eigen laatste regel, exact een van deze 2 labels (dit wordt automatisch verwerkt en nooit aan de leerling getoond, dus leg dit niet uit en noem het niet in je tekst):
[FOTO_TYPE:THEORIE] - als de foto lesstof/theorie toont (een uitlegpagina, samenvatting, regel, definitie, tabel e.d. - geen specifieke opgave met een eigen antwoord).
[FOTO_TYPE:OPGAVE] - als de foto een specifieke opgave/vraag/som toont die de leerling probeert te maken.
Twijfel je? Kies OPGAVE (dat is de veiligste keuze).`;

const FOTO_TYPE_REGEX = /\n?\[FOTO_TYPE:(THEORIE|OPGAVE)\]\s*$/;

function haalFotoTypeEnStripAntwoord(antwoord: string): { antwoord: string; fotoType: "theorie" | "opgave" | null } {
  const match = antwoord.match(FOTO_TYPE_REGEX);
  if (!match) return { antwoord, fotoType: null };
  return {
    antwoord: antwoord.slice(0, match.index).trimEnd(),
    fotoType: match[1] === "THEORIE" ? "theorie" : "opgave",
  };
}

interface KennisContextVoorChat {
  paragraaf_id: string;
  titel: string;
  leerdoelen?: string | null;
  voorkennis?: string | null;
  kernbegrippen?: string | null;
  coachaanpak: string | null;
  videos: { titel: string; url: string; aanbiedenBij: string | null }[];
}

interface OefenvraagVoorChat {
  paragraaf_id: string;
  vraag: string;
  antwoord: string;
  uitwerking: string | null;
}

/**
 * Bouwt losse interne blokken uit de gepubliceerde paragraafcontext + de
 * geverifieerde oefenbank: coachaanpak en oefenvragen-antwoorden blijven
 * intern (nooit letterlijk citeren, alleen gebruiken om beter te coachen/te
 * controleren), de uitlegvideo's mag de AI juist wel actief als link met de
 * leerling delen - dat is precies waar ze voor bedoeld zijn.
 */
function bouwCoachingBlok(contexten: KennisContextVoorChat[], oefenvragen: OefenvraagVoorChat[] = []): string {
  const coachDelen = contexten
    .filter((c) => c.coachaanpak)
    .map((c) => `### ${c.paragraaf_id} - ${c.titel}\n${c.coachaanpak}`);
  const videoDelen = contexten
    .filter((c) => c.videos.length > 0)
    .map(
      (c) =>
        `### ${c.paragraaf_id} - ${c.titel}\n` +
        c.videos.map((v) => `- [${v.titel}](${v.url})${v.aanbiedenBij ? ` (aanbieden bij: ${v.aanbiedenBij})` : ""}`).join("\n")
    );

  let blok = "";
  if (coachDelen.length > 0) {
    blok += `\n\n[INTERN - COACHINGSAANPAK PER PARAGRAAF, alleen voor jou: hoe je het beste kunt coachen bij deze paragrafen (veelgemaakte fouten, diagnostische hints). Nooit letterlijk citeren of het bestaan hiervan noemen.]\n${coachDelen.join("\n\n")}`;
  }
  if (videoDelen.length > 0) {
    blok += `\n\n[BESCHIKBARE UITLEGVIDEO'S - je MAG een video hieruit als markdown-link met de leerling delen wanneer dat past bij de vraag (bv. na een paar mislukte uitlegpogingen, of als expliciet om een video gevraagd wordt). Bied nooit een video aan die hier niet staat.]\n${videoDelen.join("\n\n")}`;
  }
  if (oefenvragen.length > 0) {
    const oefenDelen = oefenvragen.map(
      (v) => `- Vraag: ${v.vraag}\n  Geverifieerd antwoord: ${v.antwoord}${v.uitwerking ? `\n  Uitwerking: ${v.uitwerking}` : ""}`
    );
    blok += `\n\n[INTERN - GEVERIFIEERDE OEFENVRAGEN MET ANTWOORD, alleen voor jou: als de leerling een opgave noemt/typt die (nagenoeg) overeenkomt met een vraag hieronder, gebruik dat geverifieerde antwoord om exact en zonder zelf te hoeven (her)rekenen te kunnen hinten/controleren. Nooit het antwoord meteen weggeven - dezelfde hint-opbouw als altijd blijft gelden. Noem dit nooit letterlijk of het bestaan hiervan tegen de leerling.]\n${oefenDelen.join("\n")}`;
  }
  return blok;
}

function bouwSysteemPrompt(
  subjectName: string,
  aiInstructions: string,
  kennisbank: string,
  modus: "alles" | "selectie" | "index",
  heeftAfbeelding: boolean
) {
  const routeringsinstructie =
    modus === "index"
      ? "Hieronder staat alleen een INHOUDSOPGAVE (geen volledige lesstof) omdat er geen duidelijke match was met een specifiek hoofdstuk/paragraaf. Vraag de leerling eerst kort naar het hoofdstuk, de paragraaf of de bladzijde (of een foto van de opgave/bladzijde), en ga pas daarna inhoudelijk in op de vraag. Gok nooit welk onderwerp bedoeld wordt."
      : modus === "selectie"
        ? "Hieronder staat een SELECTIE van de meest relevante lesstof (niet de hele methode) op basis van het bericht van de leerling. Als deze selectie niet goed aansluit bij de vraag, zeg dat eerlijk en vraag om het hoofdstuk/de paragraaf of een foto in plaats van te improviseren."
        : "Hieronder staat de volledige beschikbare lesstof voor dit vak.";

  return `Je bent een persoonlijke, geduldige vakdocent/coach voor het vak "${subjectName}", voor een leerling in de tweede klas van het Havo.

Jouw belangrijkste doel is de leerling te helpen ZELF te leren en begrijpen - niet om meteen het kant-en-klare antwoord te geven. Volg deze hint-opbouw, stap voor stap (sla een stap over zodra die overduidelijk al gelukt is, en start bij een NIEUWE vraag/opgave weer bij stap 1):
1. Vraag eerst wat de leerling zelf al probeerde of denkt, of noem in 1 zin welke regel/aanpak hier van toepassing is - laat de leerling zelf de eerste concrete stap zetten.
2. Kwam er geen (goede) poging, of loopt die vast? Geef een concrete hint die naar de eerstvolgende stap wijst (welke regel, welk kengetal, wat eerst moet gebeuren) - dit is nog GEEN (deel van de) uitwerking.
3. Nog steeds vast na die hint? Werk zelf 1 kleine tussenstap voor (bv. "vul dit erin, en reken dan uit...") en laat de rest weer aan de leerling over.
4. Pas als het na deze stappen nog niet lukt, of als er expliciet om het antwoord gevraagd wordt ("geef me gewoon het antwoord"): geef de volledige, rustig opgebouwde uitleg of uitwerking in 1 keer.
Bevestig een juiste stap altijd kort en concreet (in 1 zin WAAROM hij klopt), voordat je verdergaat - dat maakt ook een gokje dat toevallig goed was leerzaam. Wees kort, vriendelijk en bemoedigend. Dit is een chatgesprek, geen collegetekst.

Blijf inhoudelijk dicht bij de lesstof van dit vak hieronder - dat is wat er op school behandeld wordt. Ga niet breeduit op andere onderwerpen in, tenzij de leerling daar zelf expliciet naar vraagt.

Belangrijke regels over de lesstof hieronder:
- Verzin nooit de letterlijke tekst van een boekopgave. Als de leerling een concrete opgave noemt (bv. "opgave 38") en de exacte opgavetekst staat niet in de lesstof, vraag dan om een foto of om de opgave over te typen.
- Als een los opgave-/bladzijdenummer wordt genoemd zonder hoofdstuk of paragraaf en er zijn meerdere kandidaten mogelijk, kies nooit stilzwijgend - stel een korte vraag (welk hoofdstuk/welke paragraaf/welk boekdeel, of een foto).
- Stukjes tussen "[INTERN ..." en het einde van dat blok zijn alleen voor jou (bewijsniveau, bladzijde-status, foto-adviezen) - noem dit nooit letterlijk of impliciet tegen de leerling. Gebruik het wel om in te schatten hoe zeker je mag klinken; vraag desnoods zelf om een foto van de theorie voordat je een exacte formule/definitie stellig presenteert.
${routeringsinstructie}
${aiInstructions ? `\nExtra instructies van de ouder/docent: ${aiInstructions}\n` : ""}
${heeftAfbeelding ? `\n${AFBEELDING_INSTRUCTIE}\n` : ""}
${VISUAL_INSTRUCTIE}
${OPMAAK_INSTRUCTIE}

Antwoord altijd in het Nederlands.

LESSTOF:
${kennisbank || "(nog geen lesstof toegevoegd - vertel de leerling dat je nog geen specifieke lesstof hebt en help voorlopig algemeen, maar vraag of ze het onderwerp kunnen noemen.)"}`;
}

function bouwOpdrachtSysteemPrompt(
  subjectName: string,
  aiInstructions: string,
  kennisbank: string,
  modus: "alles" | "selectie" | "index",
  heeftAfbeelding: boolean
) {
  const routeringsinstructie =
    modus === "index"
      ? "Hieronder staat alleen een INHOUDSOPGAVE (geen volledige lesstof) omdat er geen duidelijke match was met een specifiek hoofdstuk/paragraaf. Vraag naar het hoofdstuk/de paragraaf/bladzijde (of een foto) voordat je verdergaat."
      : modus === "selectie"
        ? "Hieronder staat een SELECTIE van de meest relevante lesstof op basis van wat de leerling tot nu toe heeft gezegd."
        : "Hieronder staat de volledige beschikbare lesstof voor dit vak.";

  return `Je helpt een leerling in de tweede klas van het Havo met het maken van een SPECIFIEKE huiswerkopgave voor het vak "${subjectName}" - dit is geen algemeen uitlegkanaal, maar gericht op 1 opgave tegelijk.

Werkwijze:
1. Als nog niet duidelijk is welke opgave het is, vraag dat EERST: welk hoofdstuk/paragraaf/bladzijde en opgavenummer, of vraag om een foto/overgetypte opgave. Ga pas inhoudelijk verder zodra dit duidelijk is (tenzij de leerling de opgave al letterlijk heeft getypt of gefotografeerd).
2. Volg daarna deze hint-opbouw, stap voor stap (sla een stap over zodra die overduidelijk al gelukt is):
   a. Vraag wat de leerling zelf al probeerde, of noem in 1 zin welke regel/aanpak hier van toepassing is - laat de leerling zelf de eerste concrete stap zetten.
   b. Geen (goede) poging, of loopt die vast? Geef een concrete hint die naar de eerstvolgende stap wijst - nog geen (deel van de) uitwerking.
   c. Nog steeds vast? Werk zelf 1 kleine tussenstap voor, laat de rest weer aan de leerling.
   d. Pas als het na deze stappen nog niet lukt, of expliciet om de uitwerking gevraagd wordt: geef de volledige uitwerking in 1 keer.
3. Bevestig een juiste stap altijd kort en concreet (waarom hij klopt) voordat je verdergaat.
4. Let op notatie, tekens, eenheden en afronding; benoem hooguit een fout tegelijk, vriendelijk.
5. Wees kort. Dit is een chatgesprek, geen collegetekst.

Belangrijke regels over de lesstof hieronder:
- Verzin nooit de letterlijke tekst van een boekopgave die je zelf niet hebt - als de leerling die niet zelf getypt/gefotografeerd heeft EN die ook niet letterlijk in de lesstof of in een intern blok hieronder staat, vraag dan om een foto of om de opgave over te typen.
- Stukjes tussen "[INTERN ..." en het einde van dat blok zijn alleen voor jou (bewijsniveau, bladzijde-status, foto-adviezen) - noem dit nooit tegen de leerling. Vraag desnoods zelf om een foto van de theorie voordat je een exacte formule/definitie stellig gebruikt.
${routeringsinstructie}
${aiInstructions ? `\nExtra instructies van de ouder/docent: ${aiInstructions}\n` : ""}
${heeftAfbeelding ? `\n${AFBEELDING_INSTRUCTIE}\n` : ""}
${VISUAL_INSTRUCTIE}
${OPMAAK_INSTRUCTIE}

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

  const { subjectId, message, gespreksmodus, image } = await request.json();
  if (!subjectId || !message || typeof message !== "string") {
    return NextResponse.json({ error: "subjectId en message zijn verplicht." }, { status: 400 });
  }
  const isOpdrachtModus = gespreksmodus === "opdracht";
  const berichtenTabel = isOpdrachtModus ? "opdracht_berichten" : "chat_messages";

  let afbeeldingInvoer: { mimeType: string; data: string } | null = null;
  if (image && typeof image === "object" && typeof image.mimeType === "string" && typeof image.data === "string") {
    if (!TOEGESTANE_AFBEELDING_TYPES.includes(image.mimeType)) {
      return NextResponse.json({ error: "Alleen JPEG/PNG/WebP/HEIC-foto's worden ondersteund." }, { status: 400 });
    }
    if (image.data.length > MAX_AFBEELDING_BYTES * 1.4) {
      // base64 is ~33% groter dan de brondata; ruime marge om vroeg te weigeren.
      return NextResponse.json({ error: "De foto is te groot (max 8MB)." }, { status: 400 });
    }
    afbeeldingInvoer = { mimeType: image.mimeType, data: image.data };
  }

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

  const { data: kennisContexten } = await supabase
    .from("kennis_paragraaf_context")
    .select("paragraaf_id, titel, leerdoelen, voorkennis, kernbegrippen, coachaanpak, videos")
    .eq("subject_id", subjectId)
    .eq("status", "gepubliceerd");

  const { data: kennisOnderdelen } = await supabase
    .from("kennis_onderdelen")
    .select("paragraaf_id, naam, regel, voorbeelden, gecombineerd_voorbeeld, tip, uitzondering, fout_voorbeeld")
    .eq("subject_id", subjectId)
    .eq("status", "gepubliceerd");

  const { data: kennisWoordenlijsten } = await supabase
    .from("kennis_woordenlijsten")
    .select("paragraaf_id, titel, woorden")
    .eq("subject_id", subjectId)
    .eq("status", "gepubliceerd");

  // Geverifieerde oefenvragen (met al gecontroleerd antwoord) - gebruikt om
  // de tutor een bekende opgave exact te laten herkennen en controleren
  // i.p.v. zelf te moeten (her)rekenen, wat foute feedback kan opleveren.
  const { data: kennisOefenvragen } = await supabase
    .from("kennis_oefenvragen")
    .select("paragraaf_id, vraag, antwoord, uitwerking")
    .eq("subject_id", subjectId)
    .eq("status", "gepubliceerd");

  // Recente Oefenen-sessies van deze leerling voor dit vak - zodat de tutor
  // kan aanhaken op wat er net nog niet goed ging i.p.v. dat chat en Oefenen
  // 2 losse, van elkaar onwetende kanalen blijven.
  const { data: recenteOefenSessies } = await supabase
    .from("overhoor_sessies")
    .select("hoofdstuk, transcript")
    .eq("subject_id", subjectId)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(3);

  // Zodra er voor dit vak gepubliceerde kennisonderdelen of woordenlijsten
  // bestaan, is dat de enige bron van waarheid voor de lesstof - niet meer
  // teruggrijpen op de oudere, losstaande materials-tekst (die zonder
  // handmatige actie stil uit sync kan raken met wat hier is bijgewerkt).
  const heeftKennisOnderdelen = (kennisOnderdelen?.length ?? 0) > 0 || (kennisWoordenlijsten?.length ?? 0) > 0;

  // Opdrachten-maken-modus wordt, net als de gewone chat, blijvend bewaard
  // per vak (opdracht_berichten i.p.v. chat_messages) - zelfde leespatroon.
  const { data: dbGeschiedenis } = await supabase
    .from(berichtenTabel)
    .select("role, content, created_at")
    .eq("subject_id", subjectId)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(MAX_GESCHIEDENIS);
  const geschiedenisChronologisch: { role: string; content: string }[] = (dbGeschiedenis ?? []).slice().reverse();

  // Recente eigen berichten meenemen in de zoektekst, zodat "opgave 38" nog
  // steeds matcht op een paragraaf die een paar berichten eerder al genoemd is.
  const recenteVragen = geschiedenisChronologisch
    .filter((m) => m.role !== "model")
    .slice(-4)
    .map((m) => m.content)
    .join(" ");
  let modus: "alles" | "selectie" | "index";
  let kennisbank: string;
  const afbeeldingen: { url: string; title: string }[] = [];

  if (heeftKennisOnderdelen) {
    // 1 bron van waarheid zodra dit vak naar kennisonderdelen gemigreerd is
    // - de oudere materials-tekst wordt dan niet meer gebruikt, zodat een
    // update in de kennisonderdelen niet stil uit sync kan raken met wat de
    // tutor nog als lesstof gebruikt. Geen materials -> ook geen bijhorende
    // foto's om te tonen.
    modus = "alles";
    kennisbank = bouwKennisbankUitOnderdelen(
      (kennisOnderdelen ?? []) as KennisOnderdeelRij[],
      (kennisContexten ?? []) as KennisParagraafContextRij[],
      (kennisWoordenlijsten ?? []) as KennisWoordenlijstRij[]
    );
    if (kennisbank.length > MAX_KENNISBANK_TEKENS) {
      kennisbank = kennisbank.slice(0, MAX_KENNISBANK_TEKENS) + "\n[...ingekort...]";
    }
    kennisbank += bouwCoachingBlok(
      (kennisContexten ?? []) as KennisContextVoorChat[],
      (kennisOefenvragen ?? []) as OefenvraagVoorChat[]
    );
  } else {
    const { modus: gekozenModus, gekozen } = kiesRelevanteMaterialen(materials ?? [], `${message} ${recenteVragen}`);
    modus = gekozenModus;
    if (modus === "index") {
      kennisbank = (materials ?? [])
        .map((m) => `- ${m.title}${m.hoofdstuk ? ` (${m.hoofdstuk})` : ""}`)
        .join("\n");
    } else {
      kennisbank = gekozen.map((m) => `## ${m.title}\n${m.content}`).join("\n\n");
      if (kennisbank.length > MAX_KENNISBANK_TEKENS) {
        kennisbank = kennisbank.slice(0, MAX_KENNISBANK_TEKENS) + "\n[...ingekort...]";
      }
      kennisbank += bouwCoachingBlok((kennisContexten ?? []) as KennisContextVoorChat[]);
    }

    // Afbeeldingen die bij de gekozen lesstof horen, zodat de leerling ze
    // opnieuw kan zien bij de uitleg.
    const materialsMetAfbeelding = gekozen.filter((m) => m.image_path);
    for (const m of materialsMetAfbeelding.slice(0, MAX_AFBEELDINGEN)) {
      if (!m.image_path) continue;
      const { data: signed } = await supabase.storage.from("lesstof").createSignedUrl(m.image_path, 3600);
      if (signed?.signedUrl) afbeeldingen.push({ url: signed.signedUrl, title: m.title });
    }
  }

  // Alleen zinvol als er al inhoudelijk lesstof getoond wordt - bij een
  // kale inhoudsopgave weet de tutor nog niet welk onderwerp het is, dan
  // zou dit alleen ruis toevoegen.
  if (modus !== "index") {
    kennisbank += bouwOefenGeschiedenisBlok((recenteOefenSessies ?? []) as OefenSessieVoorChat[]);
  }

  const historyVoorGemini = geschiedenisChronologisch.map((m) => ({
    role: (m.role === "model" ? "model" : "user") as "user" | "model",
    parts: [{ text: m.content }],
  }));

  const client = createGeminiClient();
  const systeemPrompt = isOpdrachtModus
    ? bouwOpdrachtSysteemPrompt(subject.name, subject.ai_instructions ?? "", kennisbank, modus, Boolean(afbeeldingInvoer))
    : bouwSysteemPrompt(subject.name, subject.ai_instructions ?? "", kennisbank, modus, Boolean(afbeeldingInvoer));

  const huidigeBeurtParts: ({ text: string } | { inlineData: { mimeType: string; data: string } })[] = [{ text: message }];
  if (afbeeldingInvoer) {
    huidigeBeurtParts.push({ inlineData: { mimeType: afbeeldingInvoer.mimeType, data: afbeeldingInvoer.data } });
  }

  const contentsVoorGemini = [...historyVoorGemini, { role: "user" as const, parts: huidigeBeurtParts }];

  let antwoord: string;
  let fotoType: "theorie" | "opgave" | null = null;
  try {
    let response;
    try {
      // De vakdocent-chat gebruikt altijd het zwaardere model (niet alleen
      // bij een foto) - nauwkeuriger volgen van de hint-opbouw en scherpere
      // uitleg wegen hier zwaarder dan de snelheid/kosten van het lichtere
      // model, dat elders in de app (rooster/huiswerk/jaarkalender-import,
      // Oefenen, Planningshulp) wel volstaat.
      response = await client.models.generateContent({
        model: GEMINI_VISION_MODEL,
        contents: contentsVoorGemini,
        config: {
          systemInstruction: systeemPrompt,
          // Ruimer dan het lichtere model elders: dit model denkt
          // uitgebreider na voordat het antwoord komt, en die interne
          // redenering telt mee in maxOutputTokens - te krap hier betekent
          // een leeg/afgekapt antwoord.
          maxOutputTokens: 4096,
        },
      });
    } catch (zwaarModelFout) {
      // Val terug op het lichtere model als het zwaardere model om wat voor
      // reden dan ook faalt (quotum, tijdelijk niet beschikbaar) - beter een
      // minder scherp antwoord dan helemaal geen reactie.
      console.error("Chat: hoofdmodel faalde, val terug op lichter model.", zwaarModelFout);
      response = await client.models.generateContent({
        model: GEMINI_MODEL,
        contents: contentsVoorGemini,
        config: { systemInstruction: systeemPrompt, maxOutputTokens: 2048 },
      });
    }
    const ruweAntwoord = response.text ?? "";
    if (!ruweAntwoord.trim()) throw new Error(`Leeg antwoord van de AI (finishReason: ${response.candidates?.[0]?.finishReason})`);
    const gestript = haalFotoTypeEnStripAntwoord(ruweAntwoord);
    antwoord = gestript.antwoord;
    if (afbeeldingInvoer) fotoType = gestript.fotoType;
  } catch (e) {
    console.error("Chat: AI-verwerking mislukt.", e);
    return NextResponse.json(
      { error: "De AI-vakdocent reageert nu niet. Probeer het straks nog eens." },
      { status: 502 }
    );
  }

  // De foto wordt altijd bij dit ene chatbericht opgeslagen (zodat het
  // gesprek bij een refresh klopt), maar gaat NIET automatisch naar
  // materials/de kennisbank van het vak - dat is een losse vraag, geen
  // permanente lesstof. Bij een foto van THEORIE (zie fotoType) kan de
  // ouder/leerling 'm zelf alsnog bewaren als lesstof, zie
  // bewaarChatFotoAlsLesstof in lib/actions/materials.ts.
  let afbeeldingPad: string | null = null;
  if (afbeeldingInvoer) {
    const pad = `${subject.family_id}/chat/${subjectId}/${randomUUID()}.${extensieVoorMimeType(afbeeldingInvoer.mimeType)}`;
    const { error: uploadError } = await supabase.storage
      .from("lesstof")
      .upload(pad, Buffer.from(afbeeldingInvoer.data, "base64"), { contentType: afbeeldingInvoer.mimeType, upsert: false });
    if (!uploadError) afbeeldingPad = pad;
  }

  await supabase.from(berichtenTabel).insert([
    {
      family_id: subject.family_id,
      subject_id: subjectId,
      user_id: user.id,
      role: "user",
      content: message,
      image_path: afbeeldingPad,
    },
    { family_id: subject.family_id, subject_id: subjectId, user_id: user.id, role: "model", content: antwoord },
  ]);

  return NextResponse.json({ reply: antwoord, images: afbeeldingen, imagePath: afbeeldingPad, fotoType });
}
