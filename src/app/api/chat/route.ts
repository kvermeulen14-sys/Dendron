import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createGeminiClient, embedTekst, vereistGeminiKey } from "@/lib/gemini";

const MAX_GESCHIEDENIS = 20;
const MAX_CHUNKS = 6;
const MAX_KENNISBANK_TEKENS_FALLBACK = 14000;
const MAX_AFBEELDINGEN = 3;

function bouwSysteemPrompt(subjectName: string, aiInstructions: string, kennisbank: string) {
  return `Je bent een persoonlijke, geduldige vakdocent/coach voor het vak "${subjectName}", voor een leerling in de tweede klas van het Havo.

Jouw belangrijkste doel is de leerling te helpen ZELF te leren en begrijpen - niet om meteen het kant-en-klare antwoord te geven. Werk zo:
- Stel eerst een korte, gerichte vraag terug of geef een hint, zodat de leerling zelf een stap kan zetten.
- Bouw in kleine stapjes op, controleer of iets begrepen is voordat je verdergaat.
- Geef pas een volledig antwoord of de uitleg in een keer als de leerling er na een paar hints echt niet uitkomt, of als er expliciet om gevraagd wordt ("geef me gewoon het antwoord").
- Wees kort, vriendelijk en bemoedigend. Dit is een chatgesprek, geen collegetekst.

Blijf inhoudelijk dicht bij de lesstof van dit vak hieronder - dat is wat er op school behandeld wordt. Ga niet breeduit op andere onderwerpen in, tenzij de leerling daar zelf expliciet naar vraagt.
${aiInstructions ? `\nExtra instructies van de ouder/docent: ${aiInstructions}\n` : ""}
Antwoord altijd in het Nederlands.

RELEVANTE LESSTOF VOOR DEZE VRAAG:
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

  // RAG: zoek alleen de stukjes lesstof die relevant zijn voor deze vraag,
  // in plaats van alle lesstof van het vak mee te sturen. Zo blijft dit
  // behapbaar en betaalbaar ook als er veel materiaal per vak bijkomt.
  let kennisbank = "";
  let relevanteMaterialIds: string[] = [];
  try {
    const vraagEmbedding = await embedTekst(message);
    const { data: chunks } = await supabase.rpc("match_material_chunks", {
      query_embedding: vraagEmbedding,
      match_subject_id: subjectId,
      match_count: MAX_CHUNKS,
    });
    if (chunks && chunks.length > 0) {
      kennisbank = chunks.map((c: { content: string }) => c.content).join("\n\n---\n\n");
      relevanteMaterialIds = Array.from(
        new Set(chunks.map((c: { material_id: string }) => c.material_id))
      );
    }
  } catch {
    // Zoekfunctie kan (nog) niet beschikbaar zijn - val terug op alle lesstof.
  }

  if (!kennisbank) {
    const { data: materials } = await supabase
      .from("materials")
      .select("id, title, content")
      .eq("subject_id", subjectId);
    kennisbank = (materials ?? []).map((m) => `## ${m.title}\n${m.content}`).join("\n\n");
    if (kennisbank.length > MAX_KENNISBANK_TEKENS_FALLBACK) {
      kennisbank = kennisbank.slice(0, MAX_KENNISBANK_TEKENS_FALLBACK) + "\n[...ingekort...]";
    }
    relevanteMaterialIds = (materials ?? []).map((m) => m.id);
  }

  // Afbeeldingen die bij de gebruikte lesstof horen, zodat de leerling ze
  // opnieuw kan zien bij de uitleg.
  const afbeeldingen: { url: string; title: string }[] = [];
  if (relevanteMaterialIds.length > 0) {
    const { data: materialsMetAfbeelding } = await supabase
      .from("materials")
      .select("id, title, image_path")
      .in("id", relevanteMaterialIds)
      .not("image_path", "is", null);

    for (const m of (materialsMetAfbeelding ?? []).slice(0, MAX_AFBEELDINGEN)) {
      if (!m.image_path) continue;
      const { data: signed } = await supabase.storage.from("lesstof").createSignedUrl(m.image_path, 3600);
      if (signed?.signedUrl) afbeeldingen.push({ url: signed.signedUrl, title: m.title });
    }
  }

  const { data: geschiedenis } = await supabase
    .from("chat_messages")
    .select("role, content, created_at")
    .eq("subject_id", subjectId)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(MAX_GESCHIEDENIS);

  const historyVoorGemini = (geschiedenis ?? [])
    .slice()
    .reverse()
    .map((m) => ({ role: m.role, parts: [{ text: m.content }] }));

  const genAI = createGeminiClient();
  const model = genAI.getGenerativeModel({
    model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
    systemInstruction: bouwSysteemPrompt(subject.name, subject.ai_instructions ?? "", kennisbank),
  });

  let antwoord: string;
  try {
    const chat = model.startChat({ history: historyVoorGemini });
    const result = await chat.sendMessage(message);
    antwoord = result.response.text();
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
