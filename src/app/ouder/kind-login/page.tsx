import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/icon";
import { LogInAlsKindKnop } from "@/components/log-in-als-kind-knop";

export default async function KindLoginPage() {
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
    .select("id, full_name")
    .eq("family_id", me!.family_id)
    .eq("role", "kind")
    .order("created_at", { ascending: true });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Inloggen als kind</h1>
        <p className="mt-1 text-sm text-slate-500">
          Snel meekijken in de omgeving van je kind, zonder het wachtwoord op te hoeven
          zoeken. Je eigen sessie wordt hierbij vervangen - log daarna gewoon weer in met
          je eigen gegevens om terug te gaan naar het ouder-dashboard.
        </p>
      </div>

      {(!kinderen || kinderen.length === 0) && (
        <Card>
          <p className="text-sm text-slate-500">
            Nog geen kind-account.{" "}
            <Link href="/ouder/account" className="font-medium text-accent-600 hover:underline">
              Maak er eerst een aan
            </Link>
            .
          </p>
        </Card>
      )}

      <div className="flex flex-col gap-3">
        {kinderen?.map((k) => (
          <Card key={k.id} className="flex flex-col items-stretch gap-4 sm:flex-row sm:items-center">
            <div className="flex items-center gap-4 sm:flex-1">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                <Icon name="users" size={20} />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900">{k.full_name}</p>
                <p className="text-xs text-slate-500">Kind-account</p>
              </div>
            </div>
            <div className="sm:w-48">
              <LogInAlsKindKnop kindId={k.id} naam={k.full_name} />
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
