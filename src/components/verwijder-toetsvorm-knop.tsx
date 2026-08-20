"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icon";
import { verwijderToetsvorm } from "@/lib/actions/test-types";

export function VerwijderToetsvormKnop({ id }: { id: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <button
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await verwijderToetsvorm(id);
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
