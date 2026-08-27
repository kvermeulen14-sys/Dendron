import type { Metadata } from "next";
import { Baloo_2, Geist, Geist_Mono } from "next/font/google";
import { createClient } from "@/lib/supabase/server";
import { themeKleurenCssVars } from "@/lib/theme-kleuren";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Rondere, vriendelijkere titelletter - alleen voor koppen (h1/h2/h3), zodat
// de tool minder als een zakelijke SaaS-tool oogt en meer als iets dat voor
// een kind gemaakt is, zonder de leesbaarheid van lopende tekst te raken.
const balooHeading = Baloo_2({
  variable: "--font-heading",
  subsets: ["latin"],
  weight: ["600", "700", "800"],
});

export const metadata: Metadata = {
  title: "Dendron - samen plannen en leren",
  description:
    "Agenda, planning en vak-coaches voor middelbare scholieren - samen met je ouder opgezet.",
};

async function haalKleurenCssVars() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return {};

    const { data: profile } = await supabase.from("profiles").select("family_id").eq("id", user.id).single();
    if (!profile) return {};

    const { data: family } = await supabase.from("families").select("theme_kleuren").eq("id", profile.family_id).single();
    return themeKleurenCssVars(family?.theme_kleuren ?? null);
  } catch {
    // Geen ingelogde gebruiker of nog geen profiel (bv. op /login): gewoon
    // de standaardkleuren uit theme.css laten gelden.
    return {};
  }
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const kleurenCssVars = await haalKleurenCssVars();

  return (
    <html
      lang="nl"
      className={`${geistSans.variable} ${geistMono.variable} ${balooHeading.variable} h-full antialiased`}
      style={kleurenCssVars}
    >
      <body className="min-h-full flex flex-col bg-slate-50 text-slate-900">
        {children}
      </body>
    </html>
  );
}
