"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icon";
import { verwijderRoosterItem } from "@/lib/actions/rooster";

export function VerwijderRoosterKnop({ id }: { id: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <button
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await verwijderRoosterItem(id);
          router.refresh();
        })
      }
      className="rounded-xl p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
      aria-label="Verwijderen"
    >
      <Icon name="trash" size={16} />
    </button>
  );
}
