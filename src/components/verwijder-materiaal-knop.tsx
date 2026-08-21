"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icon";
import { verwijderLesstof } from "@/lib/actions/materials";

export function VerwijderMateriaalKnop({
  materialId,
  subjectId,
}: {
  materialId: string;
  subjectId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <button
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await verwijderLesstof(materialId, subjectId);
          router.refresh();
        })
      }
      className="rounded-xl p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
      aria-label="Verwijderen"
    >
      <Icon name={pending ? "loader" : "trash"} size={16} className={pending ? "animate-spin" : undefined} />
    </button>
  );
}
