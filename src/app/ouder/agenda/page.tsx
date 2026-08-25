import { createClient } from "@/lib/supabase/server";
import { AgendaBoard } from "@/components/agenda-board";
import type { DagInstelling } from "@/lib/types";

export default async function OuderAgendaPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("family_id")
    .eq("id", user!.id)
    .single();

  const [
    { data: items },
    { data: subjects },
    { data: testTypes },
    { data: periodes },
    { data: roosterItems },
    { data: uitzonderingen },
    { data: family },
    { data: jaarEvents },
    { data: dagInstellingen },
  ] = await Promise.all([
    supabase
      .from("planning_items")
      .select("*")
      .eq("family_id", profile!.family_id)
      .order("due_date", { ascending: true }),
    supabase.from("subjects").select("*").eq("family_id", profile!.family_id),
    supabase.from("test_types").select("*").eq("family_id", profile!.family_id),
    supabase.from("rooster_periodes").select("*").eq("family_id", profile!.family_id),
    supabase.from("rooster_items").select("*").eq("family_id", profile!.family_id),
    supabase.from("rooster_uitzonderingen").select("*").eq("family_id", profile!.family_id),
    supabase.from("families").select("*").eq("id", profile!.family_id).single(),
    supabase.from("jaar_events").select("*").eq("family_id", profile!.family_id),
    supabase.from("dag_instellingen").select("*").eq("family_id", profile!.family_id),
  ]);

  return (
    <AgendaBoard
      items={items ?? []}
      subjects={subjects ?? []}
      testTypes={testTypes ?? []}
      periodes={periodes ?? []}
      roosterItems={roosterItems ?? []}
      uitzonderingen={uitzonderingen ?? []}
      reistijdMinuten={family?.reistijd_minuten ?? 15}
      dagInstellingen={(dagInstellingen ?? []) as DagInstelling[]}
      jaarEvents={jaarEvents ?? []}
    />
  );
}
