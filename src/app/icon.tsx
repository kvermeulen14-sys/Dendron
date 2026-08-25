import { ImageResponse } from "next/og";

export const size = { width: 64, height: 64 };
export const contentType = "image/png";

// Zelfde beeldmerk als components/logo.tsx (LogoMark), hier los getekend
// omdat next/og (Satori) geen Tailwind-classes leest - alleen inline styles
// en een beperkte subset SVG-elementen.
export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 16,
          background: "linear-gradient(135deg, #8b5cf6 0%, #7c3aed 55%, #c026d3 100%)",
        }}
      >
        <svg width="44" height="44" viewBox="0 0 48 48" fill="none">
          <path
            d="M24 42 L24 28 M24 28 L12 14 M24 28 L36 14 M24 28 L24 10"
            stroke="white"
            strokeWidth="3.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="12" cy="14" r="3.4" fill="white" />
          <circle cx="36" cy="14" r="3.4" fill="white" />
          <circle cx="24" cy="10" r="3.8" fill="white" />
        </svg>
      </div>
    ),
    { ...size }
  );
}
