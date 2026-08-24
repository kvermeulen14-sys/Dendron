import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { NavShell } from "@/components/nav-shell";

const NAV_ITEMS = [
  { href: "/kind", label: "Overzicht", icon: "dashboard" },
  { href: "/kind/agenda", label: "Mijn agenda", icon: "calendar" },
  { href: "/kind/jaarkalender", label: "Jaarkalender", icon: "calendar" },
  { href: "/kind/toetsweek", label: "Toetsweek plannen", icon: "rocket" },
  { href: "/kind/vakken", label: "Mijn vakken", icon: "chat" },
];

export default async function KindLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, role")
    .eq("id", user.id)
    .single();

  if (!profile || profile.role !== "kind") redirect("/ouder");

  return (
    <NavShell
      navItems={NAV_ITEMS}
      userName={profile.full_name || "Leerling"}
      roleLabel="Mijn omgeving"
      accentClass="bg-violet-600"
      canvasClassName="bg-gradient-to-b from-rose-50 via-rose-50/50 to-slate-50"
      bottomNav={{
        items: [
          { href: "/kind", label: "Vandaag", icon: "sun" },
          { href: "/kind/agenda", label: "Planner", icon: "calendar" },
          { href: "/kind/focus/vrij", label: "Focus", icon: "target" },
          { href: "/kind/vakken", label: "Vakken", icon: "chat" },
        ],
        quickAdd: { href: "/kind/agenda?nieuw=1", label: "Snel iets toevoegen", icon: "plus" },
      }}
    >
      {children}
    </NavShell>
  );
}
