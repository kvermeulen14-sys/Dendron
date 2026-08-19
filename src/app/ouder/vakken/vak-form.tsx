"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/icon";
import { SUBJECT_ICON_OPTIONS } from "@/components/icon";
import { maakVak } from "@/lib/actions/subjects";

export function VakForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [icon, setIcon] = useState("book-open");
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <Button icon={<Icon name="plus" size={18} />} onClick={() => setOpen(true)}>
        Nieuw vak
      </Button>
    );
  }

  return (
    <Card>
      <form
        action={async (formData) => {
          setError(null);
          const res = await maakVak(formData);
          if (res?.error) {
            setError(res.error);
            return;
          }
          setOpen(false);
          router.refresh();
        }}
        className="flex flex-col gap-4"
      >
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">Vaknaam</label>
          <input
            name="name"
            required
            placeholder="bijv. Wiskunde"
            className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">Icoon</label>
          <div className="flex flex-wrap gap-2">
            {SUBJECT_ICON_OPTIONS.map((opt) => (
              <button
                type="button"
                key={opt}
                onClick={() => setIcon(opt)}
                className={clsx(
                  "flex h-10 w-10 items-center justify-center rounded-xl border",
                  icon === opt
                    ? "border-blue-600 bg-blue-50 text-blue-600"
                    : "border-slate-200 text-slate-500 hover:bg-slate-50"
                )}
              >
                <Icon name={opt} size={18} />
              </button>
            ))}
          </div>
          <input type="hidden" name="icon" value={icon} />
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">
            Instructies voor de AI-vakdocent (optioneel)
          </label>
          <textarea
            name="aiInstructions"
            rows={3}
            placeholder="bijv. Blijf dicht bij de examenstof van niveau Havo 2. Geef nooit meteen het antwoord, stel eerst een tegenvraag."
            className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
          />
        </div>

        {error && <p className="text-sm text-rose-600">{error}</p>}

        <div className="flex gap-2">
          <Button type="submit">Vak aanmaken</Button>
          <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
            Annuleren
          </Button>
        </div>
      </form>
    </Card>
  );
}
