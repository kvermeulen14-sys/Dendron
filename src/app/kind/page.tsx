import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/icon";
import { KindVandaagLijst } from "@/components/kind-vandaag-lijst";
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

  const [{ data: vandaagData }, { data: teLaatData }, { data: voorstellenData }, { data: toetsData }, { data: subjectsData }] =
    await Promise.all([
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
    ]);

  const vandaagItems = (vandaagData ?? []) as PlanningItem[];
  const teLaat = (teLaatData ?? []) as PlanningItem[];
  const voorstellen = (voorstellenData ?? []) as PlanningItem[];
  const subjects = (subjectsData ?? []) as Subject[];
  const eerstvolgendeToets = toetsData as PlanningItem | null;

  const vandaagGedaan = vandaagItems.filter((i) => i.status === "klaar").length;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">
          Hoi {profile?.full_name?.split(" ")[0] || ""}
        </h1>
        <p className="mt-1 text-sm text-slate-500">Dit staat er voor je klaar.</p>
      </div>

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
              {voorstellen.length} voorgestelde leermoment(en) wachten op jouw akkoord
            </p>
          </Card>
        </Link>
      )}

      <Card>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">Vandaag</h2>
          {vandaagItems.length > 0 && (
            <span className="text-xs font-medium text-slate-400">
              {vandaagGedaan} van {vandaagItems.length} gedaan
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
