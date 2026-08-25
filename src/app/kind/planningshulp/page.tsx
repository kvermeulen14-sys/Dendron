import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Icon } from "@/components/icon";
import { PlanningHulpChat } from "@/components/planning-hulp-chat";
import type { PlanningItem, Subject } from "@/lib/types";

export default async function PlanningshulpPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase.from("profiles").select("family_id").eq("id", user!.id).single();

  const [{ data: items }, { data: subjects }] = await Promise.all([
    supabase
      .from("planning_items")
      .select("*")
      .eq("family_id", profile!.family_id)
      .neq("status", "klaar")
      .order("due_date", { ascending: true }),
    supabase.from("subjects").select("*").eq("family_id", profile!.family_id),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Link href="/kind/agenda" className="flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-700">
          <Icon name="chevron-left" size={16} />
          Terug naar agenda
        </Link>
        <h1 className="mt-2 text-xl font-semibold text-slate-900">Planningshulp</h1>
        <p className="mt-1 text-sm text-slate-500">
          Voel je een dag te vol, of twijfel je wat eerst? Leg het hier voor - we denken samen mee.
        </p>
      </div>

      <PlanningHulpChat items={(items ?? []) as PlanningItem[]} subjects={(subjects ?? []) as Subject[]} />
    </div>
  );
}
