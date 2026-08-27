"use client";

import { useState } from "react";
import clsx from "clsx";

export const DUUR_OPTIES = [15, 30, 45, 60, 90, 120];

export function formatMinuten(minuten: number) {
  const uren = Math.floor(minuten / 60);
  const rest = minuten % 60;
  if (uren === 0) return `${rest} min`;
  if (rest === 0) return `${uren} u`;
  return `${uren}u ${rest}m`;
}

/**
 * Duur kiezen via voorgestelde tijden (tot 2u) + een "Anders"-optie met
 * losse uren/minuten-invoer voor als geen van de vaste opties past. Overal
 * waar een tijdsinschatting gevraagd wordt dezelfde chips, zodat het gedrag
 * (en de opties) door de hele tool consistent is.
 */
export function DuurKiezer({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (minuten: number | null) => void;
}) {
  const isPreset = value !== null && DUUR_OPTIES.includes(value);
  const [andersOpen, setAndersOpen] = useState(value !== null && !isPreset);

  function kiesPreset(minuten: number) {
    setAndersOpen(false);
    onChange(value === minuten && !andersOpen ? null : minuten);
  }

  function schakelAnders() {
    setAndersOpen((open) => !open);
    if (andersOpen) onChange(null);
  }

  function pasAnders(urenTekst: string, minutenTekst: string) {
    const uren = Number(urenTekst) || 0;
    const minuten = Number(minutenTekst) || 0;
    const totaal = uren * 60 + minuten;
    onChange(totaal > 0 ? totaal : null);
  }

  const andersUren = andersOpen && value !== null ? Math.floor(value / 60) : 0;
  const andersMinuten = andersOpen && value !== null ? value % 60 : 0;

  return (
    <div className="flex flex-wrap gap-1.5">
      {DUUR_OPTIES.map((minuten) => (
        <button
          type="button"
          key={minuten}
          onClick={() => kiesPreset(minuten)}
          className={clsx(
            "rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors",
            value === minuten && !andersOpen
              ? "border-slate-900 bg-slate-900 text-white"
              : "border-slate-200 text-slate-600 hover:bg-slate-50"
          )}
        >
          {formatMinuten(minuten)}
        </button>
      ))}
      <button
        type="button"
        onClick={schakelAnders}
        className={clsx(
          "rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors",
          andersOpen
            ? "border-slate-900 bg-slate-900 text-white"
            : "border-slate-200 text-slate-600 hover:bg-slate-50"
        )}
      >
        Anders
      </button>
      {andersOpen && (
        <div className="mt-0.5 flex w-full items-center gap-1.5">
          <input
            type="number"
            min={0}
            defaultValue={andersUren || ""}
            placeholder="0"
            onChange={(e) => pasAnders(e.target.value, String(andersMinuten))}
            className="w-14 rounded-lg border border-slate-200 px-2 py-1.5 text-xs focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-100"
          />
          <span className="text-xs text-slate-500">u</span>
          <input
            type="number"
            min={0}
            max={59}
            defaultValue={andersMinuten || ""}
            placeholder="0"
            onChange={(e) => pasAnders(String(andersUren), e.target.value)}
            className="w-14 rounded-lg border border-slate-200 px-2 py-1.5 text-xs focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-100"
          />
          <span className="text-xs text-slate-500">min</span>
        </div>
      )}
    </div>
  );
}
