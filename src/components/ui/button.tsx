import { type ButtonHTMLAttributes, type ReactNode } from "react";
import Link from "next/link";
import clsx from "clsx";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "md" | "lg";

const variantClasses: Record<Variant, string> = {
  primary:
    "bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800 shadow-sm shadow-blue-600/20",
  secondary:
    "bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 active:bg-slate-100",
  ghost: "bg-transparent text-slate-600 hover:bg-slate-100",
  danger: "bg-rose-600 text-white hover:bg-rose-700 active:bg-rose-800",
};

const sizeClasses: Record<Size, string> = {
  md: "px-4 py-2.5 text-sm gap-2",
  lg: "px-6 py-4 text-base gap-3",
};

const base =
  "inline-flex items-center justify-center rounded-2xl font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600";

interface CommonProps {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function Button({
  variant = "primary",
  size = "md",
  icon,
  children,
  className,
  ...props
}: CommonProps & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={clsx(base, variantClasses[variant], sizeClasses[size], className)}
      {...props}
    >
      {icon}
      {children}
    </button>
  );
}

export function LinkButton({
  variant = "primary",
  size = "md",
  icon,
  children,
  className,
  href,
}: CommonProps & { href: string }) {
  return (
    <Link
      href={href}
      className={clsx(base, variantClasses[variant], sizeClasses[size], className)}
    >
      {icon}
      {children}
    </Link>
  );
}
