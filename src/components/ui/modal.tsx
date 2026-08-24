"use client";

import { useEffect } from "react";
import { Icon } from "@/components/icon";

export function Modal({
  open,
  onClose,
  title,
  children,
  maxWidthClass = "max-w-lg",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  maxWidthClass?: string;
}) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    const eerdereOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = eerdereOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/40" onClick={onClose} />
      <div
        className={`relative flex max-h-[85vh] w-full ${maxWidthClass} flex-col overflow-hidden rounded-[28px] bg-white shadow-xl`}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <p className="font-heading text-lg font-bold text-slate-900">{title}</p>
          <button
            onClick={onClose}
            className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label="Sluiten"
          >
            <Icon name="close" size={18} />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  );
}
