"use client";

import { type ButtonHTMLAttributes, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "md" | "lg";

/**
 * Submit-knop voor formulieren met een `action`-functie. Leest de pending-status
 * automatisch via useFormStatus, dus de knop wordt vanzelf disabled + toont een
 * spinner zolang de actie loopt - zonder dat elk formulier zelf pending-state
 * hoeft bij te houden. Voorkomt zo dubbele indieningen door dubbelklikken.
 */
export function SubmitButton({
  children,
  pendingText,
  variant = "primary",
  size = "md",
  icon,
  className,
  ...props
}: {
  children: ReactNode;
  pendingText?: ReactNode;
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
  className?: string;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type">) {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      variant={variant}
      size={size}
      icon={icon}
      loading={pending}
      className={className}
      {...props}
    >
      {pending ? pendingText ?? "Bezig..." : children}
    </Button>
  );
}
