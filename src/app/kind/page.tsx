import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/icon";
import { StickerHeart, StickerSpark, StickerStarOutline } from "@/components/sticker";
import { KindVandaagLijst } from "@/components/kind-vandaag-lijst";
import { WeekTerugblikVraag } from "@/components/week-terugblik-vraag";
import { TweeMinutenOefenen } from "@/components/twee-minuten-oefenen";
import { WerkdrukWeek } from "@/components/werkdruk-week";
import { PlanningshulpKnop } from "@/components/planningshulp-knop";
import { huidigeWeekMaandag } from "@/lib/week";
import { bepaalLaatsteOnderwerpPerVak } from "@/lib/onderwerp";
import { bepaalOefenAdvies, type OefenSessieSamenvatting } from "@/lib/oefen-advies";
import type { PlanningItem, Subject } from "@/lib/types";

export default async function KindOverzicht() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("family_id, full_name")
    .eq("id", user!.id)
    .single();

  const vandaag = new Date().toISOString().slice(0, 10);
  const weekMaandag = huidigeWeekMaandag();
  const weekMaandagDatum = new Date(weekMaandag + "T00:00:00");
  const weekZondagDatum = new Date(weekMaandagDatum);
  weekZondagDatum.setDate(weekZondagDatum.getDate() + 6);
  const weekZondag = `${weekZondagDatum.getFullYear()}-${String(weekZondagDatum.getMonth() + 1).padStart(2, "0")}-${String(weekZondagDatum.getDate()).padStart(2, "0")}`;

  const [
    { data: vandaagData },
    { data: teLaatData },
    { data: voorstellenData },
    { data: toetsData },
    { data: subjectsData },
    { data: terugblikData },
    { data: materialsData },
    { data: weekData },
    { data: openItemsData },
    { data: overhoorSessiesData },
  ] = await Promise.all([
    supabase
      .from("planning_items")
      .select("*")
      .eq("family_id", profile!.family_id)
      .eq("due_date", vandaag)
      .neq("status", "voorstel"),
    supabase
      .from("planning_items")
      .select("*")
      .eq("family_id", profile!.family_id)
      .lt("due_date", vandaag)
      .eq("status", "open"),
    supabase
      .from("planning_items")
      .select("*")
      .eq("family_id", profile!.family_id)
      .eq("status", "voorstel"),
    supabase
      .from("planning_items")
      .select("*")
      .eq("family_id", profile!.family_id)
      .eq("type", "toets")
      .gte("due_date", vandaag)
      .order("due_date", { ascending: true })
      .limit(1)
      .maybeSingle(),
    supabase.from("subjects").select("*").eq("family_id", profile!.family_id),
    supabase
      .from("week_terugblikken")
      .select("id")
      .eq("user_id", user!.id)
      .eq("week_start", weekMaandag)
      .maybeSingle(),
    supabase.from("materials").select("subject_id, hoofdstuk, created_at").eq("family_id", profile!.family_id),
    supabase
      .from("planning_items")
      .select("*")
      .eq("family_id", profile!.family_id)
      .gte("due_date", weekMaandag)
      .lte("due_date", weekZondag),
    supabase.from("planning_items").select("*").eq("family_id", profile!.family_id).neq("status", "klaar"),
    supabase
      .from("overhoor_sessies")
      .select("subject_id, hoofdstuk, created_at")
      .eq("user_id", user!.id)
      .not("hoofdstuk", "is", null)
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  // Voor "2 minuten oefenen": welk vak heeft nu de meeste aandacht nodig
  // (lang niet geoefend en/of recent nog moeilijk), en welk vak heeft
  // binnenkort een toets (stuurt het leerfase-advies bij het starten).
  const [{ data: oefenScoresData }, { data: aankomendeToetsenData }] = await Promise.all([
    supabase
      .from("overhoor_sessies")
      .select("subject_id, created_at, aantal_goed, aantal_deels, aantal_fout")
      .eq("user_id", user!.id)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("planning_items")
      .select("subject_id, due_date")
      .eq("family_id", profile!.family_id)
      .eq("type", "toets")
      .gte("due_date", vandaag)
      .order("due_date", { ascending: true }),
  ]);
  const dagenTotToetsPerVak = new Map<string, number>();
  for (const t of aankomendeToetsenData ?? []) {
    if (!t.subject_id || dagenTotToetsPerVak.has(t.subject_id)) continue;
    const dagen = Math.round(
      (new Date(t.due_date + "T00:00:00").getTime() - new Date(vandaag + "T00:00:00").getTime()) / 86400000
    );
    dagenTotToetsPerVak.set(t.subject_id, dagen);
  }

  const vandaagItems = (vandaagData ?? []) as PlanningItem[];
  const teLaat = (teLaatData ?? []) as PlanningItem[];
  const voorstellen = (voorstellenData ?? []) as PlanningItem[];
  const subjects = (subjectsData ?? []) as Subject[];
  const eerstvolgendeToets = toetsData as PlanningItem | null;
  const heeftTerugblikDezeWeek = Boolean(terugblikData);

  const subjectIdsMetLesstof = new Set((materialsData ?? []).map((m) => m.subject_id));
  const subjectsMetLesstof = subjects.filter((s) => subjectIdsMetLesstof.has(s.id));
  const laatsteOnderwerpPerVak = bepaalLaatsteOnderwerpPerVak(materialsData ?? [], overhoorSessiesData ?? []);
  const oefenAdvies = bepaalOefenAdvies(
    subjectsMetLesstof.map((s) => s.id),
    (oefenScoresData ?? []) as OefenSessieSamenvatting[],
    laatsteOnderwerpPerVak
  );
  const weekItems = (weekData ?? []) as PlanningItem[];
  const openItems = (openItemsData ?? []) as PlanningItem[];

  // Prive bezet wel tijd maar is geen afvinkbare taak - telt niet mee in
  // "X van Y gedaan" (zie ook capaciteit.ts en de agenda-samenvatting).
  const vandaagTaken = vandaagItems.filter((i) => i.type !== "prive");
  const vandaagGedaan = vandaagTaken.filter((i) => i.status === "klaar").length;

  return (
    <div className="flex flex-col gap-6">
      <div className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-violet-500 via-violet-500 to-fuchsia-500 px-5 py-6 text-white shadow-[0_12px_30px_-12px_rgba(124,58,237,0.55)]">
        <StickerStarOutline className="pointer-events-none absolute -right-1 top-3 h-9 w-9 text-white/35" />
        <StickerSpark className="pointer-events-none absolute right-16 top-9 h-4 w-4 text-white/70" />
        <StickerHeart className="pointer-events-none absolute -bottom-1 right-7 h-7 w-7 -rotate-6 text-white/25" />
        <p className="font-heading text-2xl font-bold">
          Hoi {profile?.full_name?.split(" ")[0] || ""}!
        </p>
        <p className="mt-1 text-sm text-white/85">Dit staat er voor je klaar vandaag.</p>
      </div>

      {!heeftTerugblikDezeWeek && <WeekTerugblikVraag />}

      {eerstvolgendeToets && (
        <Card className="border-rose-100 bg-rose-50/60">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-rose-100 text-rose-600">
              <Icon name="target" size={20} />
            </span>
            <div>
              <p className="text-sm text-rose-700">Eerstvolgende toets</p>
              <p className="text-base font-semibold text-slate-900">
                {eerstvolgendeToets.title} -{" "}
                {new Date(eerstvolgendeToets.due_date + "T00:00:00").toLocaleDateString("nl-NL", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                })}
              </p>
            </div>
          </div>
        </Card>
      )}

      {voorstellen.length > 0 && (
        <Link href="/kind/agenda">
          <Card className="flex items-center gap-3 border-amber-100 bg-amber-50/60 transition-shadow hover:shadow-md">
            <Icon name="brain" size={20} className="text-amber-600" />
            <p className="text-sm font-medium text-amber-800">
              {voorstellen.length} voorgestelde leermoment(en) - bevestig ze even
            </p>
          </Card>
        </Link>
      )}

      <Card>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">Vandaag</h2>
          {vandaagTaken.length > 0 && (
            <span className="text-xs font-medium text-slate-400">
              {vandaagGedaan} van {vandaagTaken.length} gedaan
            </span>
          )}
        </div>
        {vandaagItems.length === 0 ? (
          <p className="text-sm text-slate-500">Niks gepland voor vandaag. Mooi rustig.</p>
        ) : (
          <KindVandaagLijst items={vandaagItems} subjects={subjects} />
        )}
      </Card>

      {teLaat.length > 0 && (
        <Card>
          <h2 className="mb-3 text-base font-semibold text-slate-900">Nog niet afgerond</h2>
          <KindVandaagLijst items={teLaat} subjects={subjects} variant="verlopen" />
        </Card>
      )}

      <Card>
        <h2 className="mb-3 text-base font-semibold text-slate-900">Deze week</h2>
        <WerkdrukWeek items={weekItems} weekMaandagIso={weekMaandag} vandaagIso={vandaag} />
      </Card>

      <TweeMinutenOefenen
        subjects={subjectsMetLesstof}
        laatsteOnderwerpPerVak={laatsteOnderwerpPerVak}
        oefenAdvies={oefenAdvies}
        dagenTotToetsPerVak={dagenTotToetsPerVak}
      />

      <PlanningshulpKnop items={openItems} subjects={subjects} />

      <Link href="/kind/vakken">
        <Card className="flex items-center gap-3 transition-shadow hover:shadow-md">
          <Icon name="chat" size={22} className="text-emerald-600" />
          <div>
            <p className="text-sm font-semibold text-slate-900">Vraag hulp aan je vakdocent</p>
            <p className="text-xs text-slate-500">Chat per vak met je persoonlijke AI-coach</p>
          </div>
        </Card>
      </Link>
    </div>
  );
}
