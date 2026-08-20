import { createClient } from "@/lib/supabase/server";
import { JaarOverzicht } from "@/components/jaar-overzicht";
import type { JaarEvent } from "@/lib/types";

export default async function KindJaarkalenderPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("family_id")
    .eq("id", user!.id)
    .single();

  const { data: events } = await supabase
    .from("jaar_events")
    .select("*")
    .eq("family_id", profile!.family_id)
    .order("start_datum", { ascending: true });

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Jaarkalender</h1>
        <p className="mt-1 text-sm text-slate-500">
          Vakanties, toetsweken en andere belangrijke periodes - het hele jaar in 1 keer.
        </p>
      </div>

      <JaarOverzicht events={(events ?? []) as JaarEvent[]} />
    </div>
  );
}
