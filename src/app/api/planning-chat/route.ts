import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createGeminiClient, vereistGeminiKey, genereerGestructureerd } from "@/lib/gemini";
import { classificeerWerkdruk, WERKDRUK_META } from "@/lib/planning";

const MAX_GESCHIEDENIS = 16;
const VENSTER_DAGEN = 21;
const DAGNAMEN = ["", "Maandag", "Dinsdag", "Woensdag", "Donderdag", "Vrijdag", "Zaterdag", "Zondag"];
const PLANNING_TYPES = ["huiswerk", "toets", "leermoment", "prive"] as const;
// Ruimte voor 1 toets + een paar losse leermoment-voorstellen in dezelfde
// beurt (zie de instructie hieronder over gespreid leren voorstellen).
const MAX_VOORSTELLEN = 6;

const VoorstelOptieSchema = z.object({
  datum: z.string().describe("YYYY-MM-DD. Nooit een datum in het verleden."),
  tijd: z.string().nullable().describe("HH:MM (24-uurs), of null als er geen concreet tijdstip is."),
});

const VoorstelSchema = z.object({
  actie: z.enum([
    "aanmaken",
    "verplaats",
    "deadline_verzetten",
    "les_laten_vervallen",
    "klaar_melden",
    "heropenen",
    "verwijderen",
  ]),
  planningItemId: z
    .string()
    .nullable()
    .describe(
      "Verplicht: het EXACTE id (tussen [ ]) uit TAKEN hieronder bij verplaats/deadline_verzetten/klaar_melden/heropenen/verwijderen. Verzin nooit een id. Altijd null bij aanmaken en les_laten_vervallen."
    ),
  roosterItemId: z
    .string()
    .nullable()
    .describe(
      "ALLEEN bij les_laten_vervallen: het EXACTE id (tussen [ ]) van het lesuur uit LESROOSTER hieronder. Verzin nooit een id. Anders altijd null."
    ),
  nieuweDatum: z
    .string()
    .nullable()
    .describe(
      "YYYY-MM-DD. Verplicht bij aanmaken (de datum van het nieuwe item), bij deadline_verzetten, en bij les_laten_vervallen (de specifieke dag waarop de les vervalt - moet op dezelfde weekdag vallen als het lesuur in LESROOSTER). Bij verplaats: gebruik bij voorkeur 'opties' hieronder (2-3 mogelijke momenten) - nieuweDatum/nieuweTijd zijn de fallback als er maar 1 duidelijke optie is. Nooit een datum in het verleden."
    ),
  nieuweTijd: z
    .string()
    .nullable()
    .describe("HH:MM (24-uurs). Optioneel bij aanmaken/verplaats - een concreet tijdstip. Null = geen specifiek tijdstip."),
  opties: z
    .array(VoorstelOptieSchema)
    .max(3)
    .nullable()
    .describe(
      "ALLEEN bij verplaats voor een werkmoment (huiswerk/toets, zie 'verplaats' hieronder): 2-3 verschillende, echt haalbare momenten (verschillende dagen en/of tijden) waar de leerling meteen 1 van kan kiezen, i.p.v. 1 voorstel afwachten en dan pas een alternatief kunnen vragen. Null bij andere acties, of als er echt maar 1 zinnig moment is."
    ),
  nieuweGeschatteMinuten: z
    .number()
    .nullable()
    .describe(
      "ALLEEN bij verplaats: als de leerling aangeeft dat de eerder geschatte tijd niet klopt (bv 'dat duurt geen 2 uur maar 1 uur'), zet hier de gecorrigeerde inschatting in minuten - dat past dan METEEN de taak zelf aan (niet alleen dit ene moment) en helpt bij het kiezen van een moment dat er beter bij past. Anders null."
    ),
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

  const [{ data: items }, { data: subjects }, { data: periodes }, { data: testTypes }, { data: family }] = await Promise.all([
    supabase
      .from("planning_items")
      .select(
        "id, subject_id, type, title, due_date, start_date, start_time, status, estimated_minutes, parent_item_id, test_type_id"
      )
      .eq("family_id", profile.family_id)
      .neq("status", "klaar")
      .gte("due_date", vandaagIso)
      .lte("due_date", eindeVenster)
      .order("due_date", { ascending: true }),
    supabase.from("subjects").select("id, name").eq("family_id", profile.family_id),
    supabase.from("rooster_periodes").select("id, naam, start_datum, eind_datum").eq("family_id", profile.family_id),
    supabase.from("test_types").select("id, name, dagen_van_tevoren, aantal_leermomenten").eq("family_id", profile.family_id),
    supabase.from("families").select("reistijd_minuten").eq("id", profile.family_id).single(),
  ]);
  const reistijdMinuten = family?.reistijd_minuten ?? 15;

  // Zelfde manier om de "huidige" periode te bepalen als de agenda zelf
  // (agenda-board.tsx) - de periode waarvan vandaag binnen start/eind valt.
  const huidigePeriode = (periodes ?? []).find((p) => p.start_datum <= vandaagIso && vandaagIso <= p.eind_datum) ?? null;
  const { data: roosterItems } = huidigePeriode
    ? await supabase
        .from("rooster_items")
        .select("id, subject_id, titel, dag_van_week, start_tijd, eind_tijd")
        .eq("periode_id", huidigePeriode.id)
        .order("start_tijd", { ascending: true })
    : { data: null };

  const subjectNaam = new Map((subjects ?? []).map((s) => [s.id, s.name]));
  const titelPerId = new Map((items ?? []).map((i) => [i.id, i.title]));

  const vakkenTekst = (subjects ?? []).map((s) => `[${s.id}] ${s.name}`).join("\n") || "(nog geen vakken ingesteld)";

  // Fietstijd voor/na school staat niet in rooster_items (dat is puur de
  // lesuren) maar wordt, net als in de agenda zelf (agenda-board.tsx), aan
  // weerskanten van de vroegste/laatste les van de dag bijgeteld - een
  // werkmoment mag daar net zo min doorheen gepland worden als door een les.
  function tijdMinuten(t: string) {
    const [u, m] = t.split(":").map(Number);
    return u * 60 + m;
  }
  function minutenNaarTijd(m: number) {
    const genormaliseerd = ((m % 1440) + 1440) % 1440;
    const u = Math.floor(genormaliseerd / 60);
    const rest = genormaliseerd % 60;
    return `${String(u).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
  }

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
                return `[${r.id}] ${r.start_tijd.slice(0, 5)}-${r.eind_tijd.slice(0, 5)} ${vak || r.titel}`;
              })
              .join(", ");
            let fietsTekst = "";
            if (reistijdMinuten > 0) {
              const vroegsteStart = Math.min(...lessen.map((r) => tijdMinuten(r.start_tijd)));
              const laatsteEind = Math.max(...lessen.map((r) => tijdMinuten(r.eind_tijd)));
              fietsTekst = `, fietsen ${minutenNaarTijd(vroegsteStart - reistijdMinuten)}-${minutenNaarTijd(vroegsteStart)} (naar school), fietsen ${minutenNaarTijd(laatsteEind)}-${minutenNaarTijd(laatsteEind + reistijdMinuten)} (naar huis)`;
            }
            return `${DAGNAMEN[dag]}: ${lessenTekst}${fietsTekst}`;
          })
          .filter(Boolean)
          .join("\n");
  // Voor huiswerk/toets is due_date de deadline (verandert nooit via
  // "verplaats") en start_date (indien gezet) het echte werkmoment ervoor -
  // dat toont dit apart, zodat de AI nooit de deadline aanziet voor het
  // werkmoment of andersom.
  const testTypePerId = new Map((testTypes ?? []).map((t) => [t.id, t]));
  // Hoeveel leermomenten (los, of via hoort-bij gekoppeld) al voor deze
  // toets staan - zodat de AI ziet of er al gespreid geleerd wordt of dat
  // dit nog voorgesteld moet worden.
  const leermomentenPerToets = new Map<string, number>();
  for (const i of items ?? []) {
    if (i.type !== "leermoment") continue;
    const key = i.parent_item_id ?? `${i.subject_id ?? ""}`;
    leermomentenPerToets.set(key, (leermomentenPerToets.get(key) ?? 0) + 1);
  }
  const takenTekst = (items ?? [])
    .map((i) => {
      const vak = i.subject_id ? subjectNaam.get(i.subject_id) : null;
      const ouderTitel = i.parent_item_id ? titelPerId.get(i.parent_item_id) : null;
      const isWerkmomentType = i.type === "huiswerk" || i.type === "toets";
      const werkmoment = isWerkmomentType && i.start_date && i.start_date !== i.due_date
        ? ` - werkmoment gepland op ${i.start_date}${i.start_time ? ` ${i.start_time.slice(0, 5)}` : ""}`
        : i.start_time
          ? ` ${i.start_time.slice(0, 5)}`
          : "";
      const toetsvorm = i.type === "toets" && i.test_type_id ? testTypePerId.get(i.test_type_id) : null;
      const toetsvormTekst = toetsvorm
        ? ` - toetsvorm: ${toetsvorm.name} (${toetsvorm.dagen_van_tevoren} dagen van tevoren beginnen, ${toetsvorm.aantal_leermomenten} leermomenten)`
        : "";
      const leermomentenAantal = i.type === "toets" ? leermomentenPerToets.get(i.id) ?? 0 : null;
      const leermomentenTekst = i.type === "toets" ? ` - al ${leermomentenAantal} leermoment(en) gepland` : "";
      return `- [${i.id}] ${i.type} "${i.title}"${vak ? ` (${vak})` : ""} - ${isWerkmomentType ? "deadline" : "datum"} ${i.due_date}${werkmoment} - status: ${i.status}${i.estimated_minutes ? ` - ~${i.estimated_minutes} min` : ""}${ouderTitel ? ` - hoort bij: ${ouderTitel}` : ""}${toetsvormTekst}${leermomentenTekst}`;
    })
    .join("\n");

  const werkdrukPerDag = new Map<string, number>();
  for (const i of items ?? []) {
    if (i.status !== "open" || !i.estimated_minutes) continue;
    const dag = i.start_date ?? i.due_date;
    werkdrukPerDag.set(dag, (werkdrukPerDag.get(dag) ?? 0) + i.estimated_minutes);
  }
  const werkdrukTekst = Array.from({ length: 7 }, (_, idx) => addDagen(vandaagIso, idx))
    .map((iso) => {
      const minuten = werkdrukPerDag.get(iso) ?? 0;
      const weekdagNr = new Date(iso + "T00:00:00").getDay(); // 0=zo, 6=za
      const weekend = weekdagNr === 0 || weekdagNr === 6;
      return `- ${iso}${weekend ? " (weekend)" : ""}: ${WERKDRUK_META[classificeerWerkdruk(minuten, weekend)].label.toLowerCase()} (${minuten} min gepland)`;
    })
    .join("\n");

  const geschiedenisTekst = (Array.isArray(geschiedenis) ? geschiedenis : [])
    .slice(-MAX_GESCHIEDENIS)
    .map((m: { role: string; content: string }) => `${m.role === "model" ? "Jij" : "Leerling"}: ${m.content}`)
    .join("\n");

  const prompt = `Je bent een rustige, meedenkende planning-buddy voor een leerling in de tweede klas van het Havo die moeite heeft met plannen. Je bent geen schema-generator en geen ouder/docent - je denkt samen met de leerling na over een planningsdilemma, EN je kunt de agenda voor ze aanpassen als dat helpt.

Wat je kunt voorstellen (via "voorstellen" hieronder - elk voorstel krijgt de leerling apart te zien met een eigen bevestigingsknop, dus je voert NOOIT zelf iets uit, je stelt het alleen voor):
- "aanmaken": een nieuw item toevoegen - huiswerk, een toets, een leermoment, of iets privés (bv. "kamer opruimen", "voetbaltraining", "afspreken met een vriend(in)").
- "verplaats": een werkmoment/moment plannen of verzetten. BELANGRIJK: bij huiswerk en een toets is de deadline (due_date, hierboven getoond) HEILIG - die verandert een "verplaats"-voorstel NOOIT, ook al kies je een datum die eerder valt. Je plant dan alleen WANNEER de leerling eraan gaat werken, vóór die deadline - de deadline zelf blijft gewoon staan en het item blijft daar ook gewoon zichtbaar. Noem in je antwoord dus nooit dat je "de deadline verzet", maar dat je een werkmoment inplant. Bij leermoment/prive IS de datum al het moment zelf, dus daar verplaats je gewoon normaal.
  - Geef bij het plannen van een werkmoment (huiswerk/toets) BIJ VOORKEUR 2-3 concrete opties tegelijk via het "opties"-veld (verschillende dagen en/of tijden) in plaats van maar 1 voorstel - dan kan de leerling er meteen 1 kiezen zonder eerst "nee, iets anders graag" te moeten zeggen. Gebruik nieuweDatum/nieuweTijd alleen als er echt maar 1 zinnig moment is.
  - Geeft de leerling aan dat de eerder geschatte tijd niet klopt (bv "dat duurt geen 2 uur maar 1 uur")? Zet dat in "nieuweGeschatteMinuten" op hetzelfde verplaats-voorstel - dat corrigeert dan meteen de taak zelf, niet alleen dit ene moment.
  - Past een goed moment niet omdat de dag al vol staat met iets flexibels (een klusje als "kamer opruimen", een leermoment, of ander huiswerk dat pas later moet)? Dan mag je in DEZELFDE beurt een tweede "verplaats"-voorstel doen om dat andere item naar een andere dag te verschuiven, zodat er ruimte komt voor wat nu voorrang heeft (een eerdere deadline, of waar de leerling het nu over heeft) - leg in je antwoord kort uit dat je dat voorstelt en waarom (bv. "X kan nog wel een dagje wachten, Y moet eerder af"). Twijfel je of iets een vaste afspraak is (sport, iemand ontmoeten, een verjaardag) in plaats van iets flexibels? Vraag dat dan eerst, stel nooit zomaar voor om een echte afspraak te verzetten.
  - Venster voor een werkmoment (huiswerk/toets): kies een datum die NA de vorige les van dat vak valt (kijk in LESROOSTER wanneer dat vak normaal is - vóór die les heeft de leerling de stof er nog niet voor gehad) en NIET NA de deadline zelf (dan is het te laat). Is de vorige les van dat vak niet duidelijk uit het rooster te halen, kies dan gewoon een moment de dag(en) vóór de deadline.
  - Een werkmoment mag NOOIT overlappen met een les OF een fietsblok uit LESROOSTER die dag (fietsen naar school/huis staat er ook bij) - dat is allebei geen vrije tijd. Een gat tussen twee lessen (een tussenuur) mag wel, net als tijd na school/na het fietsen.
- "deadline_verzetten": ALLEEN voor huiswerk/toets, en ALLEEN als de deadline zelf écht verandert (bv. een les valt uit/wordt verzet, de docent verzet de inleverdatum/toetsdatum). Gebruik dit NOOIT om te plannen wanneer de leerling eraan werkt - dat is altijd "verplaats".
- "les_laten_vervallen": als de leerling vraagt om een LES ZELF uit het rooster/agenda te halen voor 1 specifieke dag (bv. "gym valt morgen uit", "kun je mijn wiskundeles van morgen uit het rooster halen"). Gebruik het EXACTE id (tussen [ ]) uit LESROOSTER hieronder als "roosterItemId", en de concrete datum (die op dezelfde weekdag moet vallen als het lesuur) als "nieuweDatum". Dit haalt de les alleen op DIE dag weg, niet het hele rooster - zeg dat ook zo in je antwoord. Staat er voor die dag huiswerk of een toets voor dat vak? Doe er dan METEEN ook een "deadline_verzetten"-voorstel bij (huiswerk: naar de eerstvolgende les van dat vak) - de leerling ziet en bevestigt beide voorstellen apart.
- "klaar_melden" / "heropenen": een bestaand item als klaar markeren, of terugzetten naar open.
- "verwijderen": een bestaand item weghalen - ook een toets kan hiermee weg (de eraan gekoppelde leermomenten verdwijnen dan automatisch mee, dat regelt de app zelf, daar hoef je geen apart voorstel voor te doen).

Gespreid leren voor een toets (BELANGRIJK - dit is de ENIGE plek waar leermomenten voor een toets vandaan komen, de app maakt ze zelf nergens meer automatisch aan):
- Maak je een NIEUWE toets aan ("aanmaken", type toets), of gaat het gesprek over een BESTAANDE toets waar bij "al 0 leermoment(en) gepland" staat? Doe dan in DEZELFDE beurt meteen een paar losse "aanmaken"-voorstellen (type leermoment, zelfde vakId) voor gespreide leermomenten vóór de deadline - naast het toets-voorstel zelf (of los, als de toets al bestaat).
  - Staat er bij die toets een toetsvorm (dagen_van_tevoren + aantal_leermomenten)? Volg dat aantal en spreid ze over die periode. Staat er geen toetsvorm bij? Gebruik je eigen inschatting: bij 14+ dagen tot de toets 3-4 momenten, bij 7-13 dagen 2-3, bij 4-6 dagen 2, minder dan 4 dagen 1 - altijd verspreid, nooit allemaal vlak voor elkaar of allemaal op de avond voor de toets.
  - Geef elk leermoment een korte, herkenbare titel (bv. "Leermoment 1/3 - Franse woordjes hoofdstuk 4") en een datum vóór de deadline - een concreet tijdstip mag, hoeft niet (de leerling kan dat later nog verplaatsen).
  - Zeg in je antwoord kort dat je een paar leermomenten voorstelt om het geleidelijk te doen, niet dat "de app dit automatisch doet".
- Bestaat de toets al MET voldoende leermomenten (aantal ≥ het toetsvorm-advies, of ≥ 2 als er geen toetsvorm bekend is)? Dan hoef je niks extra voor te stellen, tenzij de leerling er zelf om vraagt.

Tijdsduur (geldt voor elk voorstel met een tijdscomponent):
- Vul "geschatteMinuten" (bij aanmaken) en "nieuweGeschatteMinuten" (bij verplaats, als die tijd nog niet bekend was) ALTIJD in - nooit leeg laten "omdat de leerling niks zei". Noemt de leerling zelf geen tijdsduur? Ga dan uit van 60 minuten per leer-/werkmoment als redelijke vuistregel.
- Noemt de leerling een tijdsduur voor de HELE taak in totaal (bv "ik denk dat ik er in totaal 2 uur aan kwijt ben"), gebruik die dan als geschatteMinuten/nieuweGeschatteMinuten voor de taak - dat is niet alleen een correctie achteraf, dat mag ook meteen bij het eerste keer plannen.

Werkwijze:
- Luister en erken het gevoel of de situatie eerst in 1 korte zin (bv. "Dat klinkt inderdaad vol", "Fijn dat je dat oppakt") voordat je meedenkt - geen preek, geen lange lijst met tips.
- Denk hardop mee op basis van de ECHTE taken, werkdruk en het lesrooster hieronder - verzin nooit taken, vakken of tijden die er niet staan.
- Stel als het niet meteen duidelijk is eerst een korte, gerichte vraag in plaats van meteen iets voor te stellen. De leerling houdt de regie - dat blijft ook zo zodra je wel een voorstel doet, want elk voorstel moet nog apart bevestigd worden.
- Gebruik het lesrooster om de eerstvolgende les van een vak te bepalen. Bij "mijn wiskundeles van morgen valt uit" (of een toets die uitvalt/verzet wordt): kijk welk huiswerk of welke toets voor dat vak op die datum staat, en stel voor de DEADLINE te verzetten met "deadline_verzetten" (huiswerk: naar de eerstvolgende les van dat vak; een toets: naar de datum die de leerling noemt, of vraag ernaar als die nog niet genoemd is).
- Bij "ik wil dit vanmiddag/vanavond doen" (prive of huiswerk zonder tijdstip): kijk naar de HUIDIGE TIJD, het lesrooster en wat er die dag al gepland staat, en kies een tijdstip dat daar niet mee botst. Nooit een tijdstip vóór de HUIDIGE TIJD, en niet later dan ongeveer 20:30 's avonds.
- Wees terughoudend met meerdere voorstellen tegelijk - alleen als de leerling daar zelf om vraagt (bv. "verplaats alles van morgen naar overmorgen, ik ben ziek") mag je er meer dan 1 doen, maximaal ${MAX_VOORSTELLEN}.
- Vul bij ELK voorstel "toelichting" in: kort, op het niveau van een 13-jarige, WAAROM dit een goed idee is. Baseer dit op wat echt helpt bij plannen en leren, bijvoorbeeld:
  - Spreiding: leren in kleine stukjes verspreid over meerdere dagen beklijft beter dan alles in 1 keer vlak voor de toets.
  - Afwisseling: niet alles van hetzelfde vak achter elkaar plannen als het ook anders kan.
  - Een rustigere dag: iets verplaatsen naar een dag die volgens de werkdruk hieronder minder vol is.
  - Timing/energie: iets actiefs of leuks past vaak beter na school dan vlak voor het slapengaan.
  Nooit een voorstel zonder toelichting, en nooit een preek - hooguit 1-2 zinnen.
- Kies bij "verplaats" en "aanmaken" bij voorkeur een dag die volgens de werkdruk hieronder rustiger is, en nooit een datum in het verleden.
- Voorkeursvolgorde voor een werk-/leermoment (huiswerk, toets, leermoment): eerst een doordeweekse dag, pas als dat écht niet past (venster te krap, alle doordeweekse dagen al druk/overvol) een weekenddag - en dan zaterdag vóór zondag. Wijk hiervan af als de leerling zelf een weekenddag/zondag vraagt, of als het venster (na de vorige les, vóór de deadline) alleen een weekenddag toelaat.
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
    const roosterItemPerId = new Map((roosterItems ?? []).map((r) => [r.id, r]));
    // Zelfde telling als de agenda zelf (agenda-board.tsx naarIsoWeekdag):
    // 1 = maandag ... 7 = zondag.
    const isoWeekdag = (datumIso: string) => {
      const jsDag = new Date(datumIso + "T00:00:00").getDay();
      return jsDag === 0 ? 7 : jsDag;
    };
    const geldigeVoorstellen = geparsed.voorstellen.filter((v) => {
      if (v.actie === "aanmaken") {
        if (!v.type || !PLANNING_TYPES.includes(v.type)) return false;
        if (!v.titel?.trim()) return false;
        if (!v.nieuweDatum || v.nieuweDatum < vandaagIso) return false;
        if (v.vakId && !geldigeVakIds.has(v.vakId)) v.vakId = null;
        return true;
      }
      if (v.actie === "les_laten_vervallen") {
        if (!v.roosterItemId || !v.nieuweDatum || v.nieuweDatum < vandaagIso) return false;
        const roosterItem = roosterItemPerId.get(v.roosterItemId);
        if (!roosterItem) return false;
        if (isoWeekdag(v.nieuweDatum) !== roosterItem.dag_van_week) return false;
        return true;
      }
      if (!v.planningItemId || !geldigeIds.has(v.planningItemId)) return false;
      if ((v.actie === "verplaats" || v.actie === "deadline_verzetten") && v.nieuweDatum && v.nieuweDatum < vandaagIso) return false;
      if (v.actie === "deadline_verzetten" && !v.nieuweDatum) return false;
      if (v.actie === "verplaats" && v.opties) {
        v.opties = v.opties.filter((o) => o.datum >= vandaagIso);
        if (v.opties.length === 0) v.opties = null;
      }
      return true;
    });

    // Voor "les_laten_vervallen" mag de client niet blindelings op AI-tekst
    // vertrouwen om te tonen wat er precies vervalt (dat is nou juist waar
    // de leerling op moet kunnen controleren) - reken het vak/tijdstip hier
    // zelf uit op basis van het echte rooster-item.
    const voorstellenMetDetails = geldigeVoorstellen.map((v) => {
      if (v.actie !== "les_laten_vervallen" || !v.roosterItemId) return v;
      const roosterItem = roosterItemPerId.get(v.roosterItemId);
      if (!roosterItem) return v;
      const vak = roosterItem.subject_id ? subjectNaam.get(roosterItem.subject_id) : null;
      return {
        ...v,
        lesDetails: {
          vak: vak || roosterItem.titel,
          tijd: `${roosterItem.start_tijd.slice(0, 5)}-${roosterItem.eind_tijd.slice(0, 5)}`,
        },
      };
    });

    const respons = { antwoord: geparsed.antwoord, voorstellen: voorstellenMetDetails };

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
