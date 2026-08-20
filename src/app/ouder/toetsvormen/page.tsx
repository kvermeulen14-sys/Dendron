import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/icon";
import { VerwijderToetsvormKnop } from "@/components/verwijder-toetsvorm-knop";
import { ToetsvormForm } from "./toetsvorm-form";

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

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Toetsvormen</h1>
          <p className="mt-1 text-sm text-slate-500">
            Elke toetsvorm heeft een eigen leeradvies. Bij het inplannen van een toets kies
            je de vorm en worden de leermomenten daarop afgestemd.
          </p>
        </div>
        <ToetsvormForm />
      </div>

      {(!toetsvormen || toetsvormen.length === 0) && (
        <Card>
          <p className="text-sm text-slate-500">
            Nog geen toetsvormen. Zonder toetsvorm gebruikt de agenda een standaard vuistregel.
          </p>
        </Card>
      )}

      <div className="flex flex-col gap-3">
        {toetsvormen?.map((t) => (
          <Card key={t.id} className="flex items-center gap-4">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-rose-50 text-rose-600">
              <Icon name="alert-circle" size={20} />
            </span>
            <div className="flex-1">
              <p className="text-sm font-semibold text-slate-900">{t.name}</p>
              <p className="text-xs text-slate-500">
                {t.dagen_van_tevoren} dagen van tevoren beginnen - {t.aantal_leermomenten}{" "}
                leermomenten
              </p>
            </div>
            <VerwijderToetsvormKnop id={t.id} />
          </Card>
        ))}
      </div>
    </div>
  );
}
