import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/icon";
import { PLANNING_TYPE_META } from "@/lib/planning";
import type { PlanningItem } from "@/lib/types";

export default async function KindOverzicht() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("family_id, full_name")
    .eq("id", user!.id)
    .single();

  const vandaag = new Date().toISOString().slice(0, 10);

  const { data: items } = await supabase
    .from("planning_items")
    .select("*")
    .eq("family_id", profile!.family_id)
    .neq("status", "klaar")
    .order("due_date", { ascending: true });

  const alle: PlanningItem[] = items ?? [];
  const vandaagItems = alle.filter((i) => i.due_date === vandaag && i.status !== "voorstel");
  const teLaat = alle.filter((i) => i.due_date < vandaag && i.status !== "voorstel");
  const eerstvolgendeToets = alle.find((i) => i.type === "toets" && i.due_date >= vandaag);
  const voorstellen = alle.filter((i) => i.status === "voorstel");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">
          Hoi {profile?.full_name?.split(" ")[0] || ""}
        </h1>
        <p className="mt-1 text-sm text-slate-500">Dit staat er voor je klaar.</p>
      </div>

      {eerstvolgendeToets && (
        <Card className="border-rose-100 bg-rose-50/60">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-rose-100 text-rose-600">
              <Icon name="alert-circle" size={20} />
            </span>
            <div>
              <p className="text-sm text-rose-700">Eerstvolgende toets</p>
              <p className="text-base font-semibold text-slate-900">
                {eerstvolgendeToets.title} -{" "}
                {new Date(eerstvolgendeToets.due_date + "T00:00:00").toLocaleDateString("nl-NL", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                })}
              </p>
            </div>
          </div>
        </Card>
      )}

      {voorstellen.length > 0 && (
        <Link href="/kind/agenda">
          <Card className="flex items-center gap-3 border-amber-100 bg-amber-50/60 transition-shadow hover:shadow-md">
            <Icon name="brain" size={20} className="text-amber-600" />
            <p className="text-sm font-medium text-amber-800">
              {voorstellen.length} voorgestelde leermoment(en) wachten op jouw akkoord
            </p>
          </Card>
        </Link>
      )}

      <Card>
        <h2 className="mb-3 text-base font-semibold text-slate-900">Vandaag</h2>
        {vandaagItems.length === 0 ? (
          <p className="text-sm text-slate-500">Niks gepland voor vandaag. Mooi rustig.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {vandaagItems.map((i) => {
              const meta = PLANNING_TYPE_META[i.type];
              return (
                <li key={i.id} className="flex items-center gap-3 rounded-xl border border-slate-100 px-3.5 py-2.5">
                  <Icon name={meta.icon} size={16} className="text-slate-500" />
                  <span className="text-sm font-medium text-slate-800">{i.title}</span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {teLaat.length > 0 && (
        <Card>
          <h2 className="mb-3 text-base font-semibold text-slate-900">Nog niet afgerond</h2>
          <ul className="flex flex-col gap-2">
            {teLaat.map((i) => (
              <li key={i.id} className="flex items-center gap-3 rounded-xl border border-rose-100 bg-rose-50/40 px-3.5 py-2.5">
                <Icon name="alert-circle" size={16} className="text-rose-500" />
                <span className="text-sm font-medium text-slate-800">{i.title}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Link href="/kind/vakken">
        <Card className="flex items-center gap-3 transition-shadow hover:shadow-md">
          <Icon name="chat" size={22} className="text-emerald-600" />
          <div>
            <p className="text-sm font-semibold text-slate-900">Vraag hulp aan je vakdocent</p>
            <p className="text-xs text-slate-500">Chat per vak met je persoonlijke AI-coach</p>
          </div>
        </Card>
      </Link>
    </div>
  );
}
