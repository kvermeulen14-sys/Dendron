import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/icon";
import { KindForm } from "./kind-form";

export default async function KindAccountPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: me } = await supabase
    .from("profiles")
    .select("family_id")
    .eq("id", user!.id)
    .single();

  const { data: kinderen } = await supabase
    .from("profiles")
    .select("id, full_name, created_at")
    .eq("family_id", me!.family_id)
    .eq("role", "kind")
    .order("created_at", { ascending: true });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Kind-account</h1>
        <p className="mt-1 text-sm text-slate-500">
          Beheer hier het account waarmee je kind inlogt.
        </p>
      </div>

      {kinderen && kinderen.length > 0 && (
        <Card>
          <h2 className="text-base font-semibold text-slate-900">Bestaande accounts</h2>
          <ul className="mt-3 flex flex-col gap-2">
            {kinderen.map((k) => (
              <li
                key={k.id}
                className="flex items-center gap-3 rounded-xl border border-slate-100 px-3.5 py-3"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                  <Icon name="users" size={18} />
                </div>
                <span className="text-sm font-medium text-slate-800">{k.full_name}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <KindForm />
    </div>
  );
}
