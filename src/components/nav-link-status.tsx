"use client";

import { useLinkStatus } from "next/link";
import { Icon } from "@/components/icon";

/** Toont een spinner in plaats van het vak-icoon zolang deze navigatie-link nog aan het laden is. */
export function NavLinkStatus({ icon, size = 20 }: { icon: string; size?: number }) {
  const { pending } = useLinkStatus();
  return pending ? (
    <Icon name="loader" size={size} className="animate-spin" />
  ) : (
    <Icon name={icon} size={size} />
  );
}
