import { createClient } from "@/lib/supabase/server";
import type { TestType } from "@/lib/types";
import { ToetsvormenBeheer } from "./toetsvormen-beheer";

export default async function ToetsvormenPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("family_id")
    .eq("id", user!.id)
    .single();

  const { data: toetsvormen } = await supabase
    .from("test_types")
    .select("*")
    .eq("family_id", profile!.family_id)
    .order("created_at", { ascending: true });

  return <ToetsvormenBeheer toetsvormen={(toetsvormen ?? []) as TestType[]} />;
}
