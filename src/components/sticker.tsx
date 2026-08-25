import { type SVGProps } from "react";

/**
 * Losse, handgetekende decoratie-stickertjes voor kind-schermen - sober
 * gebruiken (1-3 per scherm, in de hoeken), niet als patroon herhalen.
 * Puur decoratief, dus altijd aria-hidden.
 */
type StickerProps = SVGProps<SVGSVGElement>;

export function StickerSpark({ ...props }: StickerProps) {
  return (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden="true" {...props}>
      <path d="M16 2 L18.2 13.8 L30 16 L18.2 18.2 L16 30 L13.8 18.2 L2 16 L13.8 13.8 Z" fill="currentColor" />
    </svg>
  );
}

export function StickerStarOutline({ ...props }: StickerProps) {
  return (
    <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M16 3 L19.2 12.4 L29 13 L21.2 19.1 L23.9 28.5 L16 22.9 L8.1 28.5 L10.8 19.1 L3 13 L12.8 12.4 Z" />
    </svg>
  );
}

export function StickerHeart({ ...props }: StickerProps) {
  return (
    <svg viewBox="0 0 32 28" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M16 26 C4 18.5 1 12.5 3.8 7.8 C6.2 3.8 12.4 3.4 16 9.5 C19.6 3.4 25.8 3.8 28.2 7.8 C31 12.5 28 18.5 16 26 Z" />
    </svg>
  );
}

export function StickerSquiggle({ ...props }: StickerProps) {
  return (
    <svg viewBox="0 0 60 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" {...props}>
      <path d="M2 18 C 10 4, 18 4, 22 14 C 26 24, 34 24, 38 12 C 41 4, 47 2, 52 8 L58 4" />
    </svg>
  );
}

export function StickerBurst({ ...props }: StickerProps) {
  return (
    <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true" {...props}>
      <path d="M16 2 V10 M16 22 V30 M2 16 H10 M22 16 H30 M6 6 L11.5 11.5 M20.5 20.5 L26 26 M26 6 L20.5 11.5 M11.5 20.5 L6 26" />
    </svg>
  );
}
