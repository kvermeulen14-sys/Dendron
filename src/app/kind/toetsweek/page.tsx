import { createClient } from "@/lib/supabase/server";
import { ToetsweekPlanner } from "@/components/toetsweek-planner";
import type { JaarEvent, PlanningItem, Subject } from "@/lib/types";

export default async function KindToetsweekPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("family_id")
    .eq("id", user!.id)
    .single();

  const vandaag = new Date().toISOString().slice(0, 10);

  const [{ data: toetsweken }, { data: toetsen }, { data: subjects }] = await Promise.all([
    supabase
      .from("jaar_events")
      .select("*")
      .eq("family_id", profile!.family_id)
      .eq("type", "toetsweek")
      .gte("eind_datum", vandaag)
      .order("start_datum", { ascending: true }),
    supabase.from("planning_items").select("*").eq("family_id", profile!.family_id).eq("type", "toets"),
    supabase.from("subjects").select("*").eq("family_id", profile!.family_id),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Toetsweek plannen</h1>
        <p className="mt-1 text-sm text-slate-500">
          Plan in 1 keer leermomenten voor alle toetsen in een toetsweek, verdeeld naar hoeveel werk
          het per vak is.
        </p>
      </div>

      <ToetsweekPlanner
        toetsweken={(toetsweken ?? []) as JaarEvent[]}
        toetsen={(toetsen ?? []) as PlanningItem[]}
        subjects={(subjects ?? []) as Subject[]}
      />
    </div>
  );
}
