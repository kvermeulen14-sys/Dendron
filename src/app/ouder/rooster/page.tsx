import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import type { RoosterItem, RoosterPeriode, RoosterUitzondering, Subject } from "@/lib/types";
import { ReistijdForm } from "./reistijd-form";
import { RoosterBeheer } from "./rooster-beheer";
import { UitzonderingenBeheer } from "./uitzonderingen-beheer";

export default async function RoosterPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("family_id")
    .eq("id", user!.id)
    .single();

  const [{ data: periodes }, { data: roosterItems }, { data: uitzonderingen }, { data: subjects }, { data: family }] =
    await Promise.all([
      supabase
        .from("rooster_periodes")
        .select("*")
        .eq("family_id", profile!.family_id)
        .order("start_datum", { ascending: true }),
      supabase.from("rooster_items").select("*").eq("family_id", profile!.family_id),
      supabase
        .from("rooster_uitzonderingen")
        .select("*")
        .eq("family_id", profile!.family_id)
        .order("datum", { ascending: true }),
      supabase.from("subjects").select("*").eq("family_id", profile!.family_id),
      supabase.from("families").select("reistijd_minuten").eq("id", profile!.family_id).single(),
    ]);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Rooster</h1>
        <p className="mt-1 text-sm text-slate-500">
          Lesuren per periode. De agenda toont deze als vaste blokken per dag, met
          automatisch berekende fietstijd ervoor en erna.
        </p>
      </div>

      <Card>
        <ReistijdForm huidig={family?.reistijd_minuten ?? 15} />
      </Card>

      <RoosterBeheer
        periodes={(periodes ?? []) as RoosterPeriode[]}
        subjects={(subjects ?? []) as Subject[]}
        roosterItems={(roosterItems ?? []) as RoosterItem[]}
      />

      <UitzonderingenBeheer
        roosterItems={(roosterItems ?? []) as RoosterItem[]}
        uitzonderingen={(uitzonderingen ?? []) as RoosterUitzondering[]}
      />
    </div>
  );
}
