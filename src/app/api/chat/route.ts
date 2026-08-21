import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createGeminiClient, vereistGeminiKey, GEMINI_MODEL } from "@/lib/gemini";
import { kiesRelevanteMaterialen } from "@/lib/kennisbank";

const MAX_GESCHIEDENIS = 20;
const MAX_KENNISBANK_TEKENS = 14000;
const MAX_AFBEELDINGEN = 3;

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
Antwoord altijd in het Nederlands.

LESSTOF:
${kennisbank || "(nog geen lesstof toegevoegd - vertel de leerling dat je nog geen specifieke lesstof hebt en help voorlopig algemeen, maar vraag of ze het onderwerp kunnen noemen.)"}`;
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

  const { subjectId, message } = await request.json();
  if (!subjectId || !message || typeof message !== "string") {
    return NextResponse.json({ error: "subjectId en message zijn verplicht." }, { status: 400 });
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

  const { data: geschiedenis } = await supabase
    .from("chat_messages")
    .select("role, content, created_at")
    .eq("subject_id", subjectId)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(MAX_GESCHIEDENIS);

  // Recente eigen berichten meenemen in de zoektekst, zodat "opgave 38" nog
  // steeds matcht op een paragraaf die een paar berichten eerder al genoemd is.
  const recenteVragen = (geschiedenis ?? [])
    .filter((m) => m.role !== "model")
    .slice(0, 4)
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

  const historyVoorGemini = (geschiedenis ?? [])
    .slice()
    .reverse()
    .map((m) => ({
      role: (m.role === "model" ? "model" : "user") as "user" | "model",
      parts: [{ text: m.content }],
    }));

  const client = createGeminiClient();

  let antwoord: string;
  try {
    const response = await client.models.generateContent({
      model: GEMINI_MODEL,
      contents: [...historyVoorGemini, { role: "user", parts: [{ text: message }] }],
      config: {
        systemInstruction: bouwSysteemPrompt(subject.name, subject.ai_instructions ?? "", kennisbank, modus),
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

  await supabase.from("chat_messages").insert([
    { family_id: subject.family_id, subject_id: subjectId, user_id: user.id, role: "user", content: message },
    { family_id: subject.family_id, subject_id: subjectId, user_id: user.id, role: "model", content: antwoord },
  ]);

  return NextResponse.json({ reply: antwoord, images: afbeeldingen });
}
