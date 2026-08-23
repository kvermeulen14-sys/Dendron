import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createGeminiClient, vereistGeminiKey, genereerGestructureerd } from "@/lib/gemini";
import { classificeerWerkdruk, WERKDRUK_META } from "@/lib/planning";

const MAX_GESCHIEDENIS = 16;
const VENSTER_DAGEN = 21;

const VoorstelSchema = z.object({
  actie: z
    .enum(["verplaats", "klaar_melden", "geen"])
    .describe("'geen' zolang er nog geen concreet, door de leerling nog te bevestigen voorstel is"),
  planningItemId: z
    .string()
    .nullable()
    .describe("het exacte id van het item uit TAKEN hieronder waar het voorstel over gaat, of null bij actie 'geen'"),
  nieuweDatum: z
    .string()
    .nullable()
    .describe("nieuwe datum als YYYY-MM-DD, verplicht bij actie 'verplaats', anders null"),
});

const ResponsSchema = z.object({
  antwoord: z.string().describe("je reactie aan de leerling: meedenkend, geruststellend, kort (dit is een chat, geen preek)"),
  voorstel: VoorstelSchema,
});

function addDagen(iso: string, dagen: number) {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + dagen);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
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

  const { message, geschiedenis } = await request.json();
  if (!message || typeof message !== "string") {
    return NextResponse.json({ error: "message is verplicht." }, { status: 400 });
  }

  const { data: profile } = await supabase.from("profiles").select("family_id").eq("id", user.id).single();
  if (!profile) return NextResponse.json({ error: "Profiel niet gevonden." }, { status: 404 });

  const nu = new Date();
  const vandaagIso = `${nu.getFullYear()}-${String(nu.getMonth() + 1).padStart(2, "0")}-${String(nu.getDate()).padStart(2, "0")}`;
  const eindeVenster = addDagen(vandaagIso, VENSTER_DAGEN);

  const [{ data: items }, { data: subjects }] = await Promise.all([
    supabase
      .from("planning_items")
      .select("id, subject_id, type, title, due_date, start_time, status, estimated_minutes")
      .eq("family_id", profile.family_id)
      .neq("status", "klaar")
      .gte("due_date", vandaagIso)
      .lte("due_date", eindeVenster)
      .order("due_date", { ascending: true }),
    supabase.from("subjects").select("id, name").eq("family_id", profile.family_id),
  ]);

  const subjectNaam = new Map((subjects ?? []).map((s) => [s.id, s.name]));
  const takenTekst = (items ?? [])
    .map((i) => {
      const vak = i.subject_id ? subjectNaam.get(i.subject_id) : null;
      return `- [${i.id}] ${i.type} "${i.title}"${vak ? ` (${vak})` : ""} - ${i.due_date}${i.start_time ? ` ${i.start_time.slice(0, 5)}` : ""} - status: ${i.status}${i.estimated_minutes ? ` - ~${i.estimated_minutes} min` : ""}`;
    })
    .join("\n");

  const werkdrukPerDag = new Map<string, number>();
  for (const i of items ?? []) {
    if (i.status !== "open" || !i.estimated_minutes) continue;
    werkdrukPerDag.set(i.due_date, (werkdrukPerDag.get(i.due_date) ?? 0) + i.estimated_minutes);
  }
  const werkdrukTekst = Array.from({ length: 7 }, (_, idx) => addDagen(vandaagIso, idx))
    .map((iso) => {
      const minuten = werkdrukPerDag.get(iso) ?? 0;
      return `- ${iso}: ${WERKDRUK_META[classificeerWerkdruk(minuten)].label.toLowerCase()} (${minuten} min gepland)`;
    })
    .join("\n");

  const geschiedenisTekst = (Array.isArray(geschiedenis) ? geschiedenis : [])
    .slice(-MAX_GESCHIEDENIS)
    .map((m: { role: string; content: string }) => `${m.role === "model" ? "Jij" : "Leerling"}: ${m.content}`)
    .join("\n");

  const prompt = `Je bent een rustige, meedenkende planning-buddy voor een leerling in de tweede klas van het Havo die moeite heeft met plannen. Je bent geen schema-generator en geen ouder/docent - je bent er om samen met de leerling na te denken over een planningsdilemma ("ik heb morgen te veel te doen", "kan dit anders?", "ik heb hier geen zin in").

Werkwijze:
- Luister en erken het gevoel eerst in 1 korte zin (bv. "Dat klinkt inderdaad vol") voordat je meedenkt - geen preek, geen lange lijst met tips.
- Denk hardop mee op basis van de ECHTE taken en werkdruk hieronder - verzin nooit taken of data die er niet staan.
- Stel als het niet meteen duidelijk is eerst een korte, gerichte vraag (bv. "wil je 'm verplaatsen, of samen kijken wat echt vandaag moet?") in plaats van meteen een oplossing te pushen. De leerling houdt de regie.
- Pas als er een concreet, klein voorstel is waar de leerling baat bij heeft (1 taak verplaatsen naar een rustigere dag, of een taak die eigenlijk al gedaan is als klaar markeren) zet je dat in het "voorstel"-veld. Je voert dit voorstel NOOIT zelf uit - de leerling krijgt een knop om het wel of niet te bevestigen, dus laat in je "antwoord"-tekst ook merken dat het een voorstel is dat ze zelf kunnen bevestigen. Tot die tijd blijft "actie" op "geen".
- Maximaal 1 concreet voorstel tegelijk, en gebruik dan het EXACTE id (het stuk tussen [ ]) uit de takenlijst hieronder - verzin nooit een id en gebruik nooit een id dat niet letterlijk hieronder staat.
- Bij "verplaats": kies bij voorkeur een dag die volgens de werkdruk hieronder rustiger is, en nooit een dag in het verleden.
- Wees kort. Dit is een chatgesprek met een tiener, geen collegetekst.

Antwoord altijd in het Nederlands.

Vandaag is ${vandaagIso}.

TAKEN (komende ${VENSTER_DAGEN} dagen, [id] type "titel" (vak) - datum starttijd - status):
${takenTekst || "(geen taken gevonden in dit venster)"}

WERKDRUK PER DAG (komende week):
${werkdrukTekst}

${geschiedenisTekst ? `GESPREK TOT NU TOE:\n${geschiedenisTekst}\n` : ""}
Nieuw bericht van de leerling: ${message}`;

  try {
    const client = createGeminiClient();
    const geparsed = await genereerGestructureerd(client, ResponsSchema, [{ role: "user", parts: [{ text: prompt }] }], 2048);

    // Extra veiligheidscheck: alleen een voorstel doorlaten dat naar een echt,
    // in de takenlijst aanwezig item verwijst - zo kan de AI nooit een
    // uitvoerbaar voorstel doen over een verzonnen of niet-toegankelijk item.
    const geldigeIds = new Set((items ?? []).map((i) => i.id));
    if (geparsed.voorstel.actie !== "geen" && !geldigeIds.has(geparsed.voorstel.planningItemId ?? "")) {
      geparsed.voorstel = { actie: "geen", planningItemId: null, nieuweDatum: null };
    }

    return NextResponse.json(geparsed);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? `AI-verwerking mislukt: ${e.message}` : "AI-verwerking mislukt." },
      { status: 502 }
    );
  }
}
