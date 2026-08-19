"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/icon";

export default function RegistrerenPage() {
  const [fullName, setFullName] = useState("");
  const [familyName, setFamilyName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          role: "ouder",
          full_name: fullName,
          family_name: familyName || `Familie ${fullName}`,
        },
      },
    });

    setLoading(false);

    if (error) {
      setError(error.message);
      return;
    }

    setDone(true);
  }

  if (done) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-6 py-16">
        <Card className="max-w-sm text-center">
          <h1 className="text-lg font-semibold text-slate-900">Bijna klaar</h1>
          <p className="mt-2 text-sm text-slate-600">
            Check je e-mail om je account te bevestigen. Daarna kun je inloggen en in het
            ouder-dashboard een account voor je kind aanmaken.
          </p>
          <Link href="/login" className="mt-4 inline-block text-sm font-medium text-blue-600 hover:underline">
            Naar inloggen
          </Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-6 py-16">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-600 text-white">
            <Icon name="users" size={26} />
          </div>
          <h1 className="text-xl font-semibold text-slate-900">Ouder-account aanmaken</h1>
          <p className="mt-1 text-sm text-slate-500">
            Hiermee maak je jullie gezinsomgeving aan. Een account voor je kind maak je
            straks vanuit je dashboard.
          </p>
        </div>

        <Card>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Je naam</label>
              <input
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                Gezinsnaam (optioneel)
              </label>
              <input
                value={familyName}
                onChange={(e) => setFamilyName(e.target.value)}
                placeholder="bijv. Familie Vermeulen"
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                E-mailadres
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                Wachtwoord
              </label>
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
              />
            </div>

            {error && <p className="text-sm text-rose-600">{error}</p>}

            <Button type="submit" size="lg" disabled={loading} className="mt-2 w-full">
              {loading ? "Bezig..." : "Account aanmaken"}
            </Button>
          </form>
        </Card>

        <p className="mt-6 text-center text-sm text-slate-500">
          Al een account?{" "}
          <Link href="/login" className="font-medium text-blue-600 hover:underline">
            Inloggen
          </Link>
        </p>
      </div>
    </div>
  );
}
