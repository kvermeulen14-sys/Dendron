import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/icon";
import { VakForm } from "./vak-form";

export default async function VakkenPage() {
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
    .select("*, materials(count)")
    .eq("family_id", profile!.family_id)
    .order("created_at", { ascending: true });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Vakken & lesstof</h1>
          <p className="mt-1 text-sm text-slate-500">
            Upload hier de lesstof die de AI-vakdocent van je kind mag gebruiken.
          </p>
        </div>
        <VakForm />
      </div>

      {(!subjects || subjects.length === 0) && (
        <Card>
          <p className="text-sm text-slate-500">
            Nog geen vakken. Begin met 1 proefvak en breid later uit.
          </p>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {subjects?.map((s) => (
          <Link key={s.id} href={`/ouder/vakken/${s.id}`}>
            <Card className="flex h-full items-center gap-3 transition-shadow hover:shadow-md">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                <Icon name={s.icon} size={20} />
              </span>
              <div>
                <p className="text-sm font-semibold text-slate-900">{s.name}</p>
                <p className="text-xs text-slate-500">
                  {(s.materials as unknown as { count: number }[])?.[0]?.count ?? 0} stuk(s) lesstof
                </p>
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
