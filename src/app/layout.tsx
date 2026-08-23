import type { Metadata } from "next";
import { Baloo_2, Geist, Geist_Mono } from "next/font/google";
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

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="nl"
      className={`${geistSans.variable} ${geistMono.variable} ${balooHeading.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-slate-50 text-slate-900">
        {children}
      </body>
    </html>
  );
}
