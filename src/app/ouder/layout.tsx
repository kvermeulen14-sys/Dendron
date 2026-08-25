import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { NavShell } from "@/components/nav-shell";

const NAV_ITEMS = [
  { href: "/ouder", label: "Overzicht", icon: "dashboard" },
  { href: "/ouder/agenda", label: "Agenda", icon: "calendar" },
  { href: "/ouder/vakken", label: "Vakken & lesstof", icon: "book-open" },
  { href: "/ouder/toetsvormen", label: "Toetsvormen", icon: "target" },
  { href: "/ouder/rooster", label: "Rooster", icon: "calendar" },
  { href: "/ouder/jaarkalender", label: "Jaarkalender", icon: "calendar" },
  { href: "/ouder/toetsweek", label: "Toetsweek plannen", icon: "rocket" },
  { href: "/ouder/account", label: "Kind-account", icon: "users" },
  { href: "/ouder/kind-login", label: "Inloggen als kind", icon: "log-in" },
];

export default async function OuderLayout({ children }: { children: React.ReactNode }) {
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

  if (!profile || profile.role !== "ouder") redirect("/kind");

  return (
    <NavShell
      navItems={NAV_ITEMS}
      userName={profile.full_name || "Ouder"}
      roleLabel="Ouder-dashboard"
    >
      {children}
    </NavShell>
  );
}
