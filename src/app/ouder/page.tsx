import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/icon";
import { PLANNING_TYPE_META } from "@/lib/planning";

export default async function OuderOverzicht() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("family_id")
    .eq("id", user!.id)
    .single();

  const nu = new Date();
  const vandaag = nu.toISOString().slice(0, 10);
  const overWeek = new Date(nu.getTime() + 7 * 86400000).toISOString().slice(0, 10);

  const { data: items } = await supabase
    .from("planning_items")
    .select("*")
    .eq("family_id", profile!.family_id)
    .order("due_date", { ascending: true });

  const alle = items ?? [];
  const open = alle.filter((i) => i.status !== "klaar");
  const teLaat = open.filter((i) => i.due_date < vandaag);
  const komendeWeek = open.filter((i) => i.due_date >= vandaag && i.due_date <= overWeek);
  const toetsen = open.filter((i) => i.type === "toets" && i.due_date >= vandaag);
  const klaarDezeMaand = alle.filter((i) => i.status === "klaar").length;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Overzicht</h1>
        <p className="mt-1 text-sm text-slate-500">
          Zo staat de planning van je kind ervoor.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Te laat" value={teLaat.length} tone="rose" icon="alert-circle" />
        <Stat label="Komende 7 dagen" value={komendeWeek.length} tone="blue" icon="calendar" />
        <Stat label="Toetsen gepland" value={toetsen.length} tone="amber" icon="pencil-line" />
        <Stat label="Afgerond" value={klaarDezeMaand} tone="emerald" icon="check" />
      </div>

      <Card>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">Eerstvolgende toetsen</h2>
          <Link href="/ouder/agenda" className="text-sm font-medium text-blue-600 hover:underline">
            Hele agenda
          </Link>
        </div>
        {toetsen.length === 0 ? (
          <p className="text-sm text-slate-500">Nog geen toetsen gepland.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {toetsen.slice(0, 5).map((t) => (
              <li key={t.id} className="flex items-center gap-3 rounded-xl border border-slate-100 px-3.5 py-2.5">
                <Icon name={PLANNING_TYPE_META.toets.icon} size={18} className="text-rose-600" />
                <span className="flex-1 text-sm font-medium text-slate-800">{t.title}</span>
                <span className="text-xs text-slate-500">
                  {new Date(t.due_date + "T00:00:00").toLocaleDateString("nl-NL", {
                    day: "numeric",
                    month: "short",
                  })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <Link href="/ouder/vakken">
          <Card className="flex h-full items-center gap-3 transition-shadow hover:shadow-md">
            <Icon name="book-open" size={22} className="text-blue-600" />
            <div>
              <p className="text-sm font-semibold text-slate-900">Vakken & lesstof</p>
              <p className="text-xs text-slate-500">Beheer wat de AI-vakdocent weet</p>
            </div>
          </Card>
        </Link>
        <Link href="/ouder/account">
          <Card className="flex h-full items-center gap-3 transition-shadow hover:shadow-md">
            <Icon name="users" size={22} className="text-blue-600" />
            <div>
              <p className="text-sm font-semibold text-slate-900">Kind-account</p>
              <p className="text-xs text-slate-500">Inloggegevens beheren</p>
            </div>
          </Card>
        </Link>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
  icon,
}: {
  label: string;
  value: number;
  tone: "rose" | "blue" | "amber" | "emerald";
  icon: string;
}) {
  const toneClasses: Record<string, string> = {
    rose: "bg-rose-50 text-rose-600",
    blue: "bg-blue-50 text-blue-600",
    amber: "bg-amber-50 text-amber-600",
    emerald: "bg-emerald-50 text-emerald-600",
  };
  return (
    <Card className="flex flex-col gap-2">
      <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${toneClasses[tone]}`}>
        <Icon name={icon} size={18} />
      </span>
      <span className="text-2xl font-semibold text-slate-900">{value}</span>
      <span className="text-xs text-slate-500">{label}</span>
    </Card>
  );
}
