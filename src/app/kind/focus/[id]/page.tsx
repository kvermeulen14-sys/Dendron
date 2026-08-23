import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { FocusModus } from "@/components/focus-modus";
import type { PlanningItem, Subject } from "@/lib/types";

export default async function KindFocusPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase.from("profiles").select("family_id").eq("id", user!.id).single();

  const { data: item } = await supabase
    .from("planning_items")
    .select("*")
    .eq("id", id)
    .eq("family_id", profile!.family_id)
    .single();
  if (!item) notFound();

  let subject: Subject | null = null;
  if (item.subject_id) {
    const { data: subjectData } = await supabase.from("subjects").select("*").eq("id", item.subject_id).single();
    subject = subjectData;
  }

  return <FocusModus item={item as PlanningItem} subject={subject} />;
}
