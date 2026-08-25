import { type ReactNode } from "react";
import clsx from "clsx";

export function Card({
  children,
  className,
  onClick,
}: {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={clsx(
        "rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_2px_14px_-4px_rgba(15,23,42,0.08)]",
        className
      )}
    >
      {children}
    </div>
  );
}
