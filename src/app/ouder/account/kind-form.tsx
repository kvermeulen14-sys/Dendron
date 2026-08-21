"use client";

import { useActionState } from "react";
import { maakKindAccount } from "./actions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type State = { error?: string; success?: boolean };

export function KindForm() {
  const [state, formAction, pending] = useActionState<State, FormData>(
    async (_prev, formData) => (await maakKindAccount(formData)) as State,
    {}
  );

  return (
    <Card>
      <h2 className="text-base font-semibold text-slate-900">Kind-account aanmaken</h2>
      <p className="mt-1 text-sm text-slate-500">
        Bedenk samen met je kind een e-mailadres en wachtwoord. Je kind logt hiermee
        rechtstreeks in - een aparte bevestigingsmail is niet nodig.
      </p>

      <form action={formAction} className="mt-4 flex flex-col gap-4">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">
            Naam van je kind
          </label>
          <input
            name="fullName"
            required
            className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-100"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">
            E-mailadres
          </label>
          <input
            type="email"
            name="email"
            required
            className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-100"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">
            Wachtwoord
          </label>
          <input
            type="password"
            name="password"
            required
            minLength={6}
            className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-100"
          />
        </div>

        {state.error && <p className="text-sm text-rose-600">{state.error}</p>}
        {state.success && (
          <p className="text-sm text-emerald-600">Account aangemaakt. Je kind kan nu inloggen.</p>
        )}

        <Button type="submit" loading={pending} className="mt-1">
          {pending ? "Bezig..." : "Account aanmaken"}
        </Button>
      </form>
    </Card>
  );
}
