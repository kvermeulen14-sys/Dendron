import clsx from "clsx";

/**
 * Het beeldmerk: een vertakkende tak/boom - past bij "Dendron" (Grieks voor
 * boom, en de wortel van "dendriet", de vertakkende uitlopers van een
 * hersencel die signalen opvangen). Zowel groei als vertakkende kennis/
 * verbindingen, precies wat een leerapp wil oproepen. Puur lijnwerk zodat
 * het ook klein (navigatiebalk, favicon) leesbaar blijft.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" fill="none" className={className} aria-hidden="true">
      <path
        d="M24 42 L24 28 M24 28 L12 14 M24 28 L36 14 M24 28 L24 10"
        stroke="currentColor"
        strokeWidth="3.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="14" r="3.2" fill="currentColor" />
      <circle cx="36" cy="14" r="3.2" fill="currentColor" />
      <circle cx="24" cy="10" r="3.6" fill="currentColor" />
    </svg>
  );
}

const MARK_SIZE: Record<"sm" | "md" | "lg", string> = {
  sm: "h-8 w-8 p-1.5",
  md: "h-10 w-10 p-2",
  lg: "h-16 w-16 p-3.5",
};

const WORDMARK_SIZE: Record<"sm" | "md" | "lg", string> = {
  sm: "text-sm",
  md: "text-base",
  lg: "text-2xl",
};

/** Volledig beeldmerk (verlopende badge) + wordmerk "Dendron" in de titelletter. */
export function Logo({
  size = "md",
  withWordmark = true,
  className,
}: {
  size?: "sm" | "md" | "lg";
  withWordmark?: boolean;
  className?: string;
}) {
  return (
    <div className={clsx("flex items-center gap-2.5", className)}>
      <span
        className={clsx(
          MARK_SIZE[size],
          "flex shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 via-violet-600 to-fuchsia-600 text-white shadow-sm"
        )}
      >
        <LogoMark className="h-full w-full" />
      </span>
      {withWordmark && (
        <span className={clsx("font-heading font-bold leading-none text-slate-900", WORDMARK_SIZE[size])}>
          Dendron
        </span>
      )}
    </div>
  );
}
