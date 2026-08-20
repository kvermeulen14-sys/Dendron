import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/icon";
import { VerwijderRoosterKnop } from "@/components/verwijder-rooster-knop";
import type { RoosterItem } from "@/lib/types";
import { RoosterForm } from "./rooster-form";
import { ReistijdForm } from "./reistijd-form";

const DAGNAMEN = ["", "Maandag", "Dinsdag", "Woensdag", "Donderdag", "Vrijdag", "Zaterdag", "Zondag"];

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

  const [{ data: roosterItems }, { data: family }] = await Promise.all([
    supabase
      .from("rooster_items")
      .select("*")
      .eq("family_id", profile!.family_id)
      .order("dag_van_week", { ascending: true })
      .order("start_tijd", { ascending: true }),
    supabase.from("families").select("reistijd_minuten").eq("id", profile!.family_id).single(),
  ]);

  const perDag = new Map<number, RoosterItem[]>();
  for (const item of (roosterItems ?? []) as RoosterItem[]) {
    const lijst = perDag.get(item.dag_van_week) ?? [];
    lijst.push(item);
    perDag.set(item.dag_van_week, lijst);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Rooster</h1>
          <p className="mt-1 text-sm text-slate-500">
            Vaste blokken (bijv. schooltijden) die in de agenda worden getoond. Fietstijd
            ervoor en erna wordt automatisch berekend.
          </p>
        </div>
        <RoosterForm />
      </div>

      <Card>
        <ReistijdForm huidig={family?.reistijd_minuten ?? 15} />
      </Card>

      {(!roosterItems || roosterItems.length === 0) && (
        <Card>
          <p className="text-sm text-slate-500">Nog geen rooster ingevoerd.</p>
        </Card>
      )}

      <div className="flex flex-col gap-4">
        {[1, 2, 3, 4, 5, 6, 7].map((dag) => {
          const items = perDag.get(dag);
          if (!items || items.length === 0) return null;
          return (
            <div key={dag}>
              <p className="mb-2 text-sm font-medium text-slate-500">{DAGNAMEN[dag]}</p>
              <div className="flex flex-col gap-2">
                {items.map((item) => (
                  <Card key={item.id} className="flex items-center gap-3 py-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600">
                      <Icon name="school" size={16} />
                    </span>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-slate-800">{item.titel}</p>
                      <p className="text-xs text-slate-500">
                        {item.start_tijd.slice(0, 5)} - {item.eind_tijd.slice(0, 5)}
                      </p>
                    </div>
                    <VerwijderRoosterKnop id={item.id} />
                  </Card>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
