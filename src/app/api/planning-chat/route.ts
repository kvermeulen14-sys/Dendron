import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createGeminiClient, vereistGeminiKey, genereerGestructureerd } from "@/lib/gemini";
import { classificeerWerkdruk, WERKDRUK_META } from "@/lib/planning";

const MAX_GESCHIEDENIS = 16;
const VENSTER_DAGEN = 21;
const DAGNAMEN = ["", "Maandag", "Dinsdag", "Woensdag", "Donderdag", "Vrijdag", "Zaterdag", "Zondag"];
const PLANNING_TYPES = ["huiswerk", "toets", "leermoment", "prive"] as const;
const MAX_VOORSTELLEN = 4;

const VoorstelSchema = z.object({
  actie: z.enum(["aanmaken", "verplaats", "klaar_melden", "heropenen", "verwijderen"]),
  planningItemId: z
    .string()
    .nullable()
    .describe(
      "Verplicht: het EXACTE id (tussen [ ]) uit TAKEN hieronder bij verplaats/klaar_melden/heropenen/verwijderen. Verzin nooit een id. Altijd null bij aanmaken."
    ),
  nieuweDatum: z
    .string()
    .nullable()
    .describe(
      "YYYY-MM-DD. Verplicht bij aanmaken (de datum van het nieuwe item). Bij verplaats: de nieuwe datum, of null om de datum te laten staan en alleen de tijd te wijzigen. Nooit een datum in het verleden."
    ),
  nieuweTijd: z
    .string()
    .nullable()
    .describe("HH:MM (24-uurs). Optioneel bij aanmaken/verplaats - een concreet tijdstip. Null = geen specifiek tijdstip."),
  type: z
    .enum(PLANNING_TYPES)
    .nullable()
    .describe("Verplicht bij aanmaken: huiswerk, toets, leermoment of prive. Anders null."),
  titel: z.string().nullable().describe("Verplicht bij aanmaken: een korte, duidelijke titel. Anders null."),
  vakId: z
    .string()
    .nullable()
    .describe(
      "Bij aanmaken: het EXACTE id (tussen [ ]) van het vak uit VAKKEN hieronder als dit item bij een vak hoort. Null bij prive of als er geen duidelijk vak is."
    ),
  geschatteMinuten: z
    .number()
    .nullable()
    .describe("Bij aanmaken: een realistische inschatting in minuten als je die kunt geven, anders null."),
  toelichting: z
    .string()
    .nullable()
    .describe(
      "Verplicht bij elk voorstel: 1-2 korte zinnen, op het niveau van een 13-jarige, WAAROM je dit zo voorstelt (bv. spreiding, een rustigere dag, energie/timing). Nooit een voorstel zonder toelichting."
    ),
});

const ResponsSchema = z.object({
  antwoord: z.string().describe("je reactie aan de leerling: meedenkend, geruststellend, kort (dit is een chat, geen preek)"),
  voorstellen: z
    .array(VoorstelSchema)
    .max(MAX_VOORSTELLEN)
    .describe("0 tot 4 concrete voorstellen. Leeg zolang er nog niets concreets is af te spreken - dan blijft dit een lege lijst."),
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
  const huidigeTijd = `${String(nu.getHours()).padStart(2, "0")}:${String(nu.getMinutes()).padStart(2, "0")}`;
  const eindeVenster = addDagen(vandaagIso, VENSTER_DAGEN);

  const [{ data: items }, { data: subjects }, { data: periodes }] = await Promise.all([
    supabase
      .from("planning_items")
      .select("id, subject_id, type, title, due_date, start_time, status, estimated_minutes, parent_item_id")
      .eq("family_id", profile.family_id)
      .neq("status", "klaar")
      .gte("due_date", vandaagIso)
      .lte("due_date", eindeVenster)
      .order("due_date", { ascending: true }),
    supabase.from("subjects").select("id, name").eq("family_id", profile.family_id),
    supabase.from("rooster_periodes").select("id, naam, start_datum, eind_datum").eq("family_id", profile.family_id),
  ]);

  // Zelfde manier om de "huidige" periode te bepalen als de agenda zelf
  // (agenda-board.tsx) - de periode waarvan vandaag binnen start/eind valt.
  const huidigePeriode = (periodes ?? []).find((p) => p.start_datum <= vandaagIso && vandaagIso <= p.eind_datum) ?? null;
  const { data: roosterItems } = huidigePeriode
    ? await supabase
        .from("rooster_items")
        .select("subject_id, titel, dag_van_week, start_tijd, eind_tijd")
        .eq("periode_id", huidigePeriode.id)
        .order("start_tijd", { ascending: true })
    : { data: null };

  const subjectNaam = new Map((subjects ?? []).map((s) => [s.id, s.name]));
  const titelPerId = new Map((items ?? []).map((i) => [i.id, i.title]));

  const vakkenTekst = (subjects ?? []).map((s) => `[${s.id}] ${s.name}`).join("\n") || "(nog geen vakken ingesteld)";

  const roosterTekst = !huidigePeriode
    ? "(geen actieve roosterperiode ingesteld)"
    : !roosterItems || roosterItems.length === 0
      ? "(nog geen lesuren ingevoerd voor de huidige periode)"
      : Array.from({ length: 7 }, (_, i) => i + 1)
          .map((dag) => {
            const lessen = roosterItems.filter((r) => r.dag_van_week === dag);
            if (lessen.length === 0) return null;
            const lessenTekst = lessen
              .map((r) => {
                const vak = r.subject_id ? subjectNaam.get(r.subject_id) : null;
                return `${r.start_tijd.slice(0, 5)}-${r.eind_tijd.slice(0, 5)} ${vak || r.titel}`;
              })
              .join(", ");
            return `${DAGNAMEN[dag]}: ${lessenTekst}`;
          })
          .filter(Boolean)
          .join("\n");
  const takenTekst = (items ?? [])
    .map((i) => {
      const vak = i.subject_id ? subjectNaam.get(i.subject_id) : null;
      const ouderTitel = i.parent_item_id ? titelPerId.get(i.parent_item_id) : null;
      return `- [${i.id}] ${i.type} "${i.title}"${vak ? ` (${vak})` : ""} - ${i.due_date}${i.start_time ? ` ${i.start_time.slice(0, 5)}` : ""} - status: ${i.status}${i.estimated_minutes ? ` - ~${i.estimated_minutes} min` : ""}${ouderTitel ? ` - hoort bij: ${ouderTitel}` : ""}`;
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

  const prompt = `Je bent een rustige, meedenkende planning-buddy voor een leerling in de tweede klas van het Havo die moeite heeft met plannen. Je bent geen schema-generator en geen ouder/docent - je denkt samen met de leerling na over een planningsdilemma, EN je kunt de agenda voor ze aanpassen als dat helpt.

Wat je kunt voorstellen (via "voorstellen" hieronder - elk voorstel krijgt de leerling apart te zien met een eigen "Ja doe dit"/"Nee laat maar"-knop, dus je voert NOOIT zelf iets uit, je stelt het alleen voor):
- "aanmaken": een nieuw item toevoegen - huiswerk, een toets, een leermoment, of iets privés (bv. "kamer opruimen", "voetbaltraining", "afspreken met een vriend(in)").
- "verplaats": een bestaand item (huiswerk, toets, leermoment of prive) naar een andere datum en/of tijd verzetten.
- "klaar_melden" / "heropenen": een bestaand item als klaar markeren, of terugzetten naar open.
- "verwijderen": een bestaand item weghalen - ook een toets kan hiermee weg (de eraan gekoppelde leermomenten verdwijnen dan automatisch mee, dat regelt de app zelf, daar hoef je geen apart voorstel voor te doen).

Werkwijze:
- Luister en erken het gevoel of de situatie eerst in 1 korte zin (bv. "Dat klinkt inderdaad vol", "Fijn dat je dat oppakt") voordat je meedenkt - geen preek, geen lange lijst met tips.
- Denk hardop mee op basis van de ECHTE taken, werkdruk en het lesrooster hieronder - verzin nooit taken, vakken of tijden die er niet staan.
- Stel als het niet meteen duidelijk is eerst een korte, gerichte vraag in plaats van meteen iets voor te stellen. De leerling houdt de regie - dat blijft ook zo zodra je wel een voorstel doet, want elk voorstel moet nog apart bevestigd worden.
- Gebruik het lesrooster om de eerstvolgende les van een vak te bepalen. Bij "mijn wiskundeles van morgen valt uit" (of een toets die uitvalt/verzet wordt): kijk welk huiswerk of welke toets voor dat vak op die datum staat, en stel voor dat te verplaatsen (huiswerk: naar de eerstvolgende les van dat vak; een toets: naar de datum die de leerling noemt, of vraag ernaar als die nog niet genoemd is).
- Bij "ik wil dit vanmiddag/vanavond doen" (prive of huiswerk zonder tijdstip): kijk naar de HUIDIGE TIJD, het lesrooster en wat er die dag al gepland staat, en kies een tijdstip dat daar niet mee botst. Nooit een tijdstip vóór de HUIDIGE TIJD, en niet later dan ongeveer 20:30 's avonds.
- Wees terughoudend met meerdere voorstellen tegelijk - alleen als de leerling daar zelf om vraagt (bv. "verplaats alles van morgen naar overmorgen, ik ben ziek") mag je er meer dan 1 doen, maximaal ${MAX_VOORSTELLEN}.
- Vul bij ELK voorstel "toelichting" in: kort, op het niveau van een 13-jarige, WAAROM dit een goed idee is. Baseer dit op wat echt helpt bij plannen en leren, bijvoorbeeld:
  - Spreiding: leren in kleine stukjes verspreid over meerdere dagen beklijft beter dan alles in 1 keer vlak voor de toets.
  - Afwisseling: niet alles van hetzelfde vak achter elkaar plannen als het ook anders kan.
  - Een rustigere dag: iets verplaatsen naar een dag die volgens de werkdruk hieronder minder vol is.
  - Timing/energie: iets actiefs of leuks past vaak beter na school dan vlak voor het slapengaan.
  Nooit een voorstel zonder toelichting, en nooit een preek - hooguit 1-2 zinnen.
- Kies bij "verplaats" en "aanmaken" bij voorkeur een dag die volgens de werkdruk hieronder rustiger is, en nooit een datum in het verleden.
- Stel je een toets voor ("aanmaken", type toets): zeg er in je antwoord bij dat er meteen een paar gespreide leermomenten bij komen zodra de leerling dit bevestigt (dat regelt de app zelf).
- Gebruik voor "vakId" en "planningItemId" ALTIJD het exacte id tussen [ ] uit VAKKEN/TAKEN hieronder - verzin nooit een id.
- Wees kort. Dit is een chatgesprek met een tiener, geen collegetekst.
- Noem bij ELKE datum die je noemt ook de dag van de week (bv. "vrijdag 28 augustus", niet alleen "28 augustus").

Antwoord altijd in het Nederlands.

Vandaag is ${vandaagIso}, huidige tijd ${huidigeTijd}.

VAKKEN ([id] naam):
${vakkenTekst}

LESROOSTER (huidige periode, per dag start-eind vak):
${roosterTekst}

TAKEN (komende ${VENSTER_DAGEN} dagen, [id] type "titel" (vak) - datum starttijd - status - hoort bij (indien leermoment van een toets)):
${takenTekst || "(geen taken gevonden in dit venster)"}

WERKDRUK PER DAG (komende week):
${werkdrukTekst}

${geschiedenisTekst ? `GESPREK TOT NU TOE:\n${geschiedenisTekst}\n` : ""}
Nieuw bericht van de leerling: ${message}`;

  try {
    const client = createGeminiClient();
    const geparsed = await genereerGestructureerd(client, ResponsSchema, [{ role: "user", parts: [{ text: prompt }] }], 2560);

    // Extra veiligheidscheck: elk voorstel moet naar echte, toegankelijke
    // ids verwijzen en logisch consistent zijn - zo kan de AI nooit een
    // uitvoerbaar voorstel doen over een verzonnen/niet-toegankelijk item,
    // vak, of een datum in het verleden.
    const geldigeIds = new Set((items ?? []).map((i) => i.id));
    const geldigeVakIds = new Set((subjects ?? []).map((s) => s.id));
    const geldigeVoorstellen = geparsed.voorstellen.filter((v) => {
      if (v.actie === "aanmaken") {
        if (!v.type || !PLANNING_TYPES.includes(v.type)) return false;
        if (!v.titel?.trim()) return false;
        if (!v.nieuweDatum || v.nieuweDatum < vandaagIso) return false;
        if (v.vakId && !geldigeVakIds.has(v.vakId)) v.vakId = null;
        return true;
      }
      if (!v.planningItemId || !geldigeIds.has(v.planningItemId)) return false;
      if (v.actie === "verplaats" && v.nieuweDatum && v.nieuweDatum < vandaagIso) return false;
      return true;
    });

    const respons = { antwoord: geparsed.antwoord, voorstellen: geldigeVoorstellen };

    await supabase.from("planningshulp_berichten").insert([
      { family_id: profile.family_id, user_id: user.id, role: "user", content: message },
      { family_id: profile.family_id, user_id: user.id, role: "model", content: geparsed.antwoord },
    ]);

    return NextResponse.json(respons);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? `AI-verwerking mislukt: ${e.message}` : "AI-verwerking mislukt." },
      { status: 502 }
    );
  }
}
