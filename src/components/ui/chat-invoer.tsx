"use client";

import { useEffect, useRef } from "react";
import clsx from "clsx";

const MAX_HOOGTE_PX = 120;

/**
 * Meegroeiend invoerveld voor chats: begint als 1 regel maar groeit mee met
 * langere, doordachte berichten (tot een maximum, daarna scrollt het) -
 * fijner dan een vast 1-regelig invoerveld voor een bericht met meerdere
 * zinnen. Enter verstuurt, Shift+Enter maakt een nieuwe regel.
 */
export function ChatInvoer({
  value,
  onChange,
  onVerstuur,
  placeholder,
  disabled,
  focusClassName = "focus:border-accent-500 focus:ring-accent-100",
}: {
  value: string;
  onChange: (waarde: string) => void;
  onVerstuur: () => void;
  placeholder?: string;
  disabled?: boolean;
  focusClassName?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_HOOGTE_PX)}px`;
  }, [value]);

  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          onVerstuur();
        }
      }}
      placeholder={placeholder}
      disabled={disabled}
      className={clsx(
        "max-h-[120px] flex-1 resize-none rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm leading-relaxed focus:outline-none focus:ring-2",
        focusClassName
      )}
    />
  );
}
