import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { NavShell } from "@/components/nav-shell";

const NAV_ITEMS = [
  { href: "/kind", label: "Overzicht", icon: "dashboard" },
  { href: "/kind/agenda", label: "Mijn agenda", icon: "calendar" },
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
      accentClass="bg-emerald-600"
    >
      {children}
    </NavShell>
  );
}
