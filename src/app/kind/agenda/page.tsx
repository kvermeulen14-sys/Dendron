import { createClient } from "@/lib/supabase/server";
import { AgendaBoard } from "@/components/agenda-board";

export default async function KindAgendaPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("family_id")
    .eq("id", user!.id)
    .single();

  const [{ data: items }, { data: subjects }] = await Promise.all([
    supabase
      .from("planning_items")
      .select("*")
      .eq("family_id", profile!.family_id)
      .order("due_date", { ascending: true }),
    supabase.from("subjects").select("*").eq("family_id", profile!.family_id),
  ]);

  return <AgendaBoard items={items ?? []} subjects={subjects ?? []} />;
}
