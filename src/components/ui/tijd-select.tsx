"use client";

import { useState } from "react";

const MINUTEN = ["00", "05", "10", "15", "20", "25", "30", "35", "40", "45", "50", "55"];
const STANDAARD_SELECT_CLASS =
  "rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-100";

function splits(tijd: string) {
  const [uur, minuut] = tijd.split(":");
  return { uur: uur ?? "", minuut: minuut ?? "00" };
}

/**
 * Tijd-invoer als twee losse dropdowns (uur + minuten, stappen van 5) in
 * plaats van een <input type="time"> - die laat op sommige browsers
 * (o.a. Safari) alsnog elke minuut kiezen in de native picker.
 */
export function TijdSelect({
  placeholder = "Kies een tijd",
  startUur = 0,
  eindUur = 23,
  name,
  required,
  value,
  defaultValue,
  onChange,
  className,
}: {
  placeholder?: string;
  startUur?: number;
  eindUur?: number;
  name?: string;
  required?: boolean;
  value?: string;
  defaultValue?: string;
  onChange?: (e: { target: { value: string } }) => void;
  className?: string;
}) {
  const isControlled = value !== undefined;
  const [intern, setIntern] = useState(defaultValue ?? "");
  const huidig = isControlled ? (value ?? "") : intern;
  const { uur, minuut } = splits(huidig);

  function stel(nieuweUur: string, nieuweMinuut: string) {
    const combinatie = nieuweUur ? `${nieuweUur}:${nieuweMinuut}` : "";
    if (!isControlled) setIntern(combinatie);
    onChange?.({ target: { value: combinatie } });
  }

  const uren: string[] = [];
  for (let u = startUur; u <= eindUur; u++) uren.push(String(u).padStart(2, "0"));

  const selectClass = className ?? STANDAARD_SELECT_CLASS;

  return (
    <div className="flex items-center gap-1.5">
      <select
        required={required}
        value={uur}
        onChange={(e) => stel(e.target.value, minuut)}
        className={selectClass}
        aria-label="Uur"
      >
        <option value="">{placeholder}</option>
        {uren.map((u) => (
          <option key={u} value={u}>
            {u}
          </option>
        ))}
      </select>
      <span className="text-slate-400">:</span>
      <select
        value={minuut}
        disabled={!uur}
        onChange={(e) => stel(uur, e.target.value)}
        className={selectClass}
        aria-label="Minuten"
      >
        {MINUTEN.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>
      {name && <input type="hidden" name={name} value={huidig} />}
    </div>
  );
}
