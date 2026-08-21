import type { SelectHTMLAttributes } from "react";

function genereerTijden(startUur: number, eindUur: number) {
  const tijden: string[] = [];
  for (let uur = startUur; uur <= eindUur; uur++) {
    for (let minuut = 0; minuut < 60; minuut += 5) {
      tijden.push(`${String(uur).padStart(2, "0")}:${String(minuut).padStart(2, "0")}`);
    }
  }
  return tijden;
}

/**
 * Tijd-invoer in stappen van 5 minuten. Een gewone <input type="time"
 * step="300"> laat op sommige browsers (o.a. Safari) alsnog elke minuut
 * kiezen in de picker - deze <select> garandeert overal exact 5-minuten-
 * stappen.
 */
export function TijdSelect({
  placeholder,
  startUur = 0,
  eindUur = 23,
  className,
  ...props
}: {
  placeholder?: string;
  startUur?: number;
  eindUur?: number;
} & SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={
        className ??
        "w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-100"
      }
    >
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {genereerTijden(startUur, eindUur).map((t) => (
        <option key={t} value={t}>
          {t}
        </option>
      ))}
    </select>
  );
}
