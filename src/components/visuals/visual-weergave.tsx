import type { ReactNode } from "react";
import type {
  BreukSpec,
  BreukTerm,
  DiagramSpec,
  GetallenlijnSpec,
  GrafiekPunt,
  GrafiekSpec,
  TabelSpec,
  VisualSpec,
} from "@/lib/visuals";

const STROOK_KLEUREN = ["stroke-accent-600", "stroke-emerald-600", "stroke-amber-600"];
const TEKST_KLEUREN = ["text-accent-600", "text-emerald-600", "text-amber-600"];

function fmt(n: number) {
  const afgerond = Math.round(n * 100) / 100;
  return afgerond.toString();
}

function Kaart({ titel, children }: { titel: string; children: ReactNode }) {
  return (
    <div className="mt-2 max-w-full overflow-x-auto rounded-xl border border-slate-200 bg-white p-3">
      <p className="mb-1.5 text-xs font-semibold text-slate-600">{titel}</p>
      {children}
    </div>
  );
}

function GrafiekWeergave({ spec }: { spec: GrafiekSpec }) {
  const width = 300;
  const height = 210;
  const padding = 26;
  const schaalX = (width - 2 * padding) / (spec.xMax - spec.xMin);
  const schaalY = (height - 2 * padding) / (spec.yMax - spec.yMin);
  const px = (x: number) => padding + (x - spec.xMin) * schaalX;
  const py = (y: number) => height - padding - (y - spec.yMin) * schaalY;
  const clamp = (y: number) => Math.max(spec.yMin, Math.min(spec.yMax, y));

  const paden = spec.functies.map((f) => {
    const stappen = 60;
    const punten: string[] = [];
    for (let i = 0; i <= stappen; i++) {
      const x = spec.xMin + ((spec.xMax - spec.xMin) * i) / stappen;
      const y = clamp(f.a * x * x + f.b * x + f.c);
      punten.push(`${px(x).toFixed(1)},${py(y).toFixed(1)}`);
    }
    return punten.join(" ");
  });

  const xAsZichtbaar = spec.yMin <= 0 && spec.yMax >= 0;
  const yAsZichtbaar = spec.xMin <= 0 && spec.xMax >= 0;

  const puntPerLabel = new Map<string, GrafiekPunt>(spec.punten.map((p) => [p.label, p]));
  // Een lijnstuk tekent letterlijk de rechte tussen de 2 opgezochte punten -
  // dat kan nooit "mis" gaan zoals een a/b/c-formule die de hele lijn door
  // het venster trekt, want dit stopt precies bij de 2 echte punten.
  const lijnstukken = spec.lijnstukken
    .map((l) => ({ ...l, van: puntPerLabel.get(l.van), naar: puntPerLabel.get(l.naar) }))
    .filter((l): l is typeof l & { van: GrafiekPunt; naar: GrafiekPunt } => Boolean(l.van && l.naar));

  return (
    <Kaart titel={spec.titel}>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full max-w-[340px]" role="img" aria-label={spec.titel}>
        <rect x={padding} y={padding} width={width - 2 * padding} height={height - 2 * padding} className="fill-none stroke-slate-200" />
        {xAsZichtbaar && (
          <line x1={padding} y1={py(0)} x2={width - padding} y2={py(0)} className="stroke-slate-400" strokeWidth={1} />
        )}
        {yAsZichtbaar && (
          <line x1={px(0)} y1={padding} x2={px(0)} y2={height - padding} className="stroke-slate-400" strokeWidth={1} />
        )}
        <text x={padding} y={height - 6} className="fill-slate-400 text-[9px]">
          x: {fmt(spec.xMin)} tot {fmt(spec.xMax)}
        </text>
        <text x={width - padding} y={16} textAnchor="end" className="fill-slate-400 text-[9px]">
          y: {fmt(spec.yMin)} tot {fmt(spec.yMax)}
        </text>

        {paden.map((d, i) => (
          <polyline key={i} points={d} className={STROOK_KLEUREN[i % STROOK_KLEUREN.length]} strokeWidth={2} fill="none" />
        ))}

        {lijnstukken.map((l, i) => (
          <line
            key={i}
            x1={px(l.van.x)}
            y1={py(clamp(l.van.y))}
            x2={px(l.naar.x)}
            y2={py(clamp(l.naar.y))}
            className={STROOK_KLEUREN[(spec.functies.length + i) % STROOK_KLEUREN.length]}
            strokeWidth={2}
          />
        ))}

        {spec.punten.map((p, i) => (
          <g key={i}>
            <circle cx={px(p.x)} cy={py(clamp(p.y))} r={3} className="fill-slate-700" />
            <text x={px(p.x) + 5} y={py(clamp(p.y)) - 5} className="fill-slate-600 text-[9px]">
              {p.label}
            </text>
          </g>
        ))}
      </svg>
      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
        {spec.functies.map((f, i) => (
          <span key={`f-${i}`} className={`font-medium ${TEKST_KLEUREN[i % TEKST_KLEUREN.length]}`}>
            {f.label}
          </span>
        ))}
        {spec.lijnstukken.map((l, i) => (
          <span key={`l-${i}`} className={`font-medium ${TEKST_KLEUREN[(spec.functies.length + i) % TEKST_KLEUREN.length]}`}>
            {l.label}
          </span>
        ))}
      </div>
    </Kaart>
  );
}

function GetallenlijnWeergave({ spec }: { spec: GetallenlijnSpec }) {
  const width = 300;
  const height = 70;
  const padding = 20;
  const schaalX = (width - 2 * padding) / (spec.max - spec.min);
  const px = (v: number) => padding + (v - spec.min) * schaalX;

  return (
    <Kaart titel={spec.titel}>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full max-w-[340px]" role="img" aria-label={spec.titel}>
        <line x1={padding} y1={height / 2} x2={width - padding} y2={height / 2} className="stroke-slate-400" strokeWidth={1.5} />
        <text x={padding} y={height / 2 + 18} className="fill-slate-400 text-[9px]">
          {fmt(spec.min)}
        </text>
        <text x={width - padding} y={height / 2 + 18} textAnchor="end" className="fill-slate-400 text-[9px]">
          {fmt(spec.max)}
        </text>
        {spec.punten.map((p, i) => (
          <g key={i}>
            <circle cx={px(p.waarde)} cy={height / 2} r={4} className="fill-accent-600" />
            <text x={px(p.waarde)} y={height / 2 - 10} textAnchor="middle" className="fill-slate-700 text-[10px] font-medium">
              {p.label}
            </text>
          </g>
        ))}
      </svg>
    </Kaart>
  );
}

function TabelWeergave({ spec }: { spec: TabelSpec }) {
  return (
    <Kaart titel={spec.titel}>
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr>
            <th className="border border-slate-200 bg-slate-50 px-2 py-1 text-left font-medium text-slate-600">{spec.xLabel}</th>
            {spec.rijen.map((r, i) => (
              <td key={i} className="border border-slate-200 px-2 py-1 text-center text-slate-700">
                {fmt(r.x)}
              </td>
            ))}
          </tr>
          <tr>
            <th className="border border-slate-200 bg-slate-50 px-2 py-1 text-left font-medium text-slate-600">{spec.yLabel}</th>
            {spec.rijen.map((r, i) => (
              <td key={i} className="border border-slate-200 px-2 py-1 text-center text-slate-700">
                {fmt(r.y)}
              </td>
            ))}
          </tr>
        </thead>
      </table>
    </Kaart>
  );
}

function DiagramWeergave({ spec }: { spec: DiagramSpec }) {
  const totaal = spec.categorieen.reduce((som, c) => som + c.waarde, 0);
  const width = 300;
  const height = spec.soort === "cirkel" ? 190 : 190;

  if (spec.soort === "staaf") {
    const padding = 26;
    const max = Math.max(...spec.categorieen.map((c) => c.waarde), 1);
    const breedte = (width - 2 * padding) / spec.categorieen.length;
    return (
      <Kaart titel={spec.titel}>
        <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full max-w-[340px]" role="img" aria-label={spec.titel}>
          <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} className="stroke-slate-300" />
          {spec.categorieen.map((c, i) => {
            const h = ((height - 2 * padding) * c.waarde) / max;
            const x = padding + i * breedte + breedte * 0.15;
            const y = height - padding - h;
            return (
              <g key={i}>
                <rect x={x} y={y} width={breedte * 0.7} height={h} className={i % 2 === 0 ? "fill-accent-500" : "fill-emerald-500"} rx={2} />
                <text x={x + breedte * 0.35} y={height - padding + 12} textAnchor="middle" className="fill-slate-500 text-[8px]">
                  {c.label.length > 10 ? `${c.label.slice(0, 9)}…` : c.label}
                </text>
                <text x={x + breedte * 0.35} y={y - 4} textAnchor="middle" className="fill-slate-700 text-[9px] font-medium">
                  {fmt(c.waarde)}
                </text>
              </g>
            );
          })}
        </svg>
      </Kaart>
    );
  }

  // cirkeldiagram
  const cx = width / 2;
  const cy = height / 2;
  const r = 75;
  const kleuren = ["fill-accent-500", "fill-emerald-500", "fill-amber-500", "fill-rose-400", "fill-violet-400", "fill-slate-400"];

  const segmenten: { startHoek: number; eindHoek: number }[] = [];
  let cumulatieveHoek = -Math.PI / 2;
  for (const c of spec.categorieen) {
    const deel = totaal > 0 ? c.waarde / totaal : 0;
    const startHoek = cumulatieveHoek;
    const eindHoek = cumulatieveHoek + deel * Math.PI * 2;
    segmenten.push({ startHoek, eindHoek });
    cumulatieveHoek = eindHoek;
  }

  return (
    <Kaart titel={spec.titel}>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full max-w-[340px]" role="img" aria-label={spec.titel}>
        {segmenten.map(({ startHoek, eindHoek }, i) => {
          const x1 = cx + r * Math.cos(startHoek);
          const y1 = cy + r * Math.sin(startHoek);
          const x2 = cx + r * Math.cos(eindHoek);
          const y2 = cy + r * Math.sin(eindHoek);
          const grootBoog = eindHoek - startHoek > Math.PI ? 1 : 0;
          const d = `M ${cx},${cy} L ${x1.toFixed(1)},${y1.toFixed(1)} A ${r},${r} 0 ${grootBoog} 1 ${x2.toFixed(1)},${y2.toFixed(1)} Z`;
          return <path key={i} d={d} className={kleuren[i % kleuren.length]} stroke="white" strokeWidth={1} />;
        })}
      </svg>
      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-600">
        {spec.categorieen.map((c, i) => (
          <span key={i} className="flex items-center gap-1">
            <span className={`h-2.5 w-2.5 rounded-sm ${kleuren[i % kleuren.length]}`} />
            {c.label} ({totaal > 0 ? Math.round((c.waarde / totaal) * 100) : 0}%)
          </span>
        ))}
      </div>
    </Kaart>
  );
}

// Breuken als echte gestapelde teller/noemer i.p.v. platte tekst zoals
// "2/3" - dat mist juist het visuele onderscheid tussen "boven" en "onder"
// dat een leerling nodig heeft om breukbewerkingen te begrijpen.
function BreukTermWeergave({ term }: { term: BreukTerm }) {
  return (
    <span className="inline-flex flex-col items-center px-1 text-base font-semibold leading-none text-slate-800">
      <span className="pb-0.5">{term.teller}</span>
      <span className="w-full border-t-2 border-slate-700" />
      <span className="pt-0.5">{term.noemer}</span>
    </span>
  );
}

function BreukWeergave({ spec }: { spec: BreukSpec }) {
  return (
    <Kaart titel={spec.titel}>
      <div className="flex flex-wrap items-center gap-2 py-1">
        {spec.breuken.map((b, i) => (
          <span key={i} className="flex items-center gap-2">
            {i > 0 && <span className="text-lg font-semibold text-slate-500">{spec.operator ?? ""}</span>}
            <BreukTermWeergave term={b} />
          </span>
        ))}
        {spec.uitkomst && (
          <>
            <span className="text-lg font-semibold text-slate-500">=</span>
            <BreukTermWeergave term={spec.uitkomst} />
          </>
        )}
      </div>
    </Kaart>
  );
}

export function VisualWeergave({ visual }: { visual: VisualSpec }) {
  switch (visual.type) {
    case "grafiek":
      return <GrafiekWeergave spec={visual} />;
    case "getallenlijn":
      return <GetallenlijnWeergave spec={visual} />;
    case "tabel":
      return <TabelWeergave spec={visual} />;
    case "diagram":
      return <DiagramWeergave spec={visual} />;
    case "breuk":
      return <BreukWeergave spec={visual} />;
  }
}
