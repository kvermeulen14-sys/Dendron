import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/icon";
import { vakKleur } from "@/lib/vak-kleur";

export default async function KindVakkenPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("family_id")
    .eq("id", user!.id)
    .single();

  const { data: subjects } = await supabase
    .from("subjects")
    .select("*")
    .eq("family_id", profile!.family_id)
    .order("created_at", { ascending: true });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Mijn vakken</h1>
        <p className="mt-1 text-sm text-slate-500">
          Kies een vak om te chatten met je AI-vakdocent.
        </p>
      </div>

      {(!subjects || subjects.length === 0) && (
        <Card>
          <p className="text-sm text-slate-500">
            Er is nog geen vak toegevoegd. Vraag je ouder om er een aan te maken.
          </p>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {subjects?.map((s) => {
          const kleur = vakKleur(s.id);
          return (
            <Link key={s.id} href={`/kind/vakken/${s.id}`}>
              <Card className="flex h-full items-center gap-3 transition-shadow hover:shadow-md">
                <span className={`flex h-11 w-11 items-center justify-center rounded-xl ${kleur.bg} ${kleur.text}`}>
                  <Icon name={s.icon} size={20} />
                </span>
                <div>
                  <p className="text-sm font-semibold text-slate-900">{s.name}</p>
                  <p className="text-xs text-slate-500">Chat met je vakdocent</p>
                </div>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
