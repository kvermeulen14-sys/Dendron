import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/icon";
import { ChatgeschiedenisOpschonenKnop } from "@/components/chatgeschiedenis-opschonen-knop";
import { KindForm } from "./kind-form";
import { KindBewerkKnop } from "./kind-bewerk-knop";

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

  // E-mailadres staat niet in profiles (dat kent alleen auth.users) - alleen
  // nodig om het bewerk-formulier voor te vullen, dus via de admin-client.
  const emailPerKind = new Map<string, string>();
  if (kinderen && kinderen.length > 0) {
    const admin = createAdminClient();
    const resultaten = await Promise.all(kinderen.map((k) => admin.auth.admin.getUserById(k.id)));
    resultaten.forEach((res, i) => {
      if (res.data.user?.email) emailPerKind.set(kinderen[i].id, res.data.user.email);
    });
  }

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
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-800">{k.full_name}</p>
                  {emailPerKind.get(k.id) && (
                    <p className="truncate text-xs text-slate-500">{emailPerKind.get(k.id)}</p>
                  )}
                </div>
                <KindBewerkKnop kindId={k.id} huidigeNaam={k.full_name} huidigeEmail={emailPerKind.get(k.id) ?? ""} />
              </li>
            ))}
          </ul>
        </Card>
      )}

      <KindForm />

      <Card className="flex flex-col gap-2">
        <h2 className="text-base font-semibold text-slate-900">Chatgeschiedenis</h2>
        <p className="text-sm text-slate-500">
          De inhoud van alle chats (vakdocent, opdracht maken, planningshulp en overhoor-gesprekken) blijft bewaard
          zolang de huidige roosterperiode loopt. Is een periode voorbij, dan mag je die geschiedenis opschonen.
        </p>
        <div className="mt-1">
          <ChatgeschiedenisOpschonenKnop />
        </div>
      </Card>
    </div>
  );
}
