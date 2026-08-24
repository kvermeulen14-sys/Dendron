// Deterministische wiskunde-visualisaties: de AI-vakdocent kan in zijn
// antwoord een klein stukje JSON in een fenced code-block zetten (bv.
// ```grafiek ... ```) om een grafiek/getallenlijn/tabel/diagram te tonen.
// Dit wordt hier uit de tekst gehaald, streng gevalideerd (nooit ongeldige
// data laten renderen) en apart weergegeven - de wiskunde komt dus altijd
// uit een berekening, nooit uit een los gegenereerd plaatje.

export interface GrafiekFunctie {
  label: string;
  a: number; // coefficient bij x^2 (0 = rechte lijn)
  b: number; // coefficient bij x (richtingscoefficient bij een rechte lijn)
  c: number; // constante term
}
export interface GrafiekPunt {
  label: string;
  x: number;
  y: number;
}
export interface GrafiekLijnstuk {
  label: string;
  /** Verwijst naar het label van een punt in "punten" - nooit losse coordinaten, zodat een lijnstuk altijd precies tussen de 2 echte punten loopt. */
  van: string;
  naar: string;
}
export interface GrafiekSpec {
  type: "grafiek";
  titel: string;
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  functies: GrafiekFunctie[];
  punten: GrafiekPunt[];
  lijnstukken: GrafiekLijnstuk[];
}

export interface GetallenlijnPunt {
  label: string;
  waarde: number;
}
export interface GetallenlijnSpec {
  type: "getallenlijn";
  titel: string;
  min: number;
  max: number;
  punten: GetallenlijnPunt[];
}

export interface TabelRij {
  x: number;
  y: number;
}
export interface TabelSpec {
  type: "tabel";
  titel: string;
  xLabel: string;
  yLabel: string;
  rijen: TabelRij[];
}

export interface DiagramCategorie {
  label: string;
  waarde: number;
}
export interface DiagramSpec {
  type: "diagram";
  titel: string;
  soort: "staaf" | "cirkel";
  categorieen: DiagramCategorie[];
}

export interface BreukTerm {
  teller: number;
  noemer: number;
}
export interface BreukSpec {
  type: "breuk";
  titel: string;
  operator: "×" | "+" | "-" | "÷" | null;
  breuken: BreukTerm[];
  uitkomst: BreukTerm | null;
}

export type VisualSpec = GrafiekSpec | GetallenlijnSpec | TabelSpec | DiagramSpec | BreukSpec;

function isNum(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}
function isStr(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function valideerGrafiek(v: Record<string, unknown>): GrafiekSpec | null {
  if (!isStr(v.titel) || !isNum(v.xMin) || !isNum(v.xMax) || !isNum(v.yMin) || !isNum(v.yMax)) return null;
  if (v.xMin >= v.xMax || v.yMin >= v.yMax) return null;
  if (!Array.isArray(v.functies)) return null;

  const functies: GrafiekFunctie[] = [];
  for (const f of v.functies.slice(0, 3)) {
    if (f && typeof f === "object") {
      const rec = f as Record<string, unknown>;
      if (isStr(rec.label) && isNum(rec.a) && isNum(rec.b) && isNum(rec.c)) {
        functies.push({ label: rec.label, a: rec.a, b: rec.b, c: rec.c });
      }
    }
  }

  const punten: GrafiekPunt[] = [];
  if (Array.isArray(v.punten)) {
    for (const p of v.punten.slice(0, 8)) {
      if (p && typeof p === "object") {
        const rec = p as Record<string, unknown>;
        if (isStr(rec.label) && isNum(rec.x) && isNum(rec.y)) punten.push({ label: rec.label, x: rec.x, y: rec.y });
      }
    }
  }

  // Een lijnstuk verwijst altijd naar 2 bestaande punt-labels - zo loopt een
  // zijde van een driehoek/veelhoek altijd precies tussen de echte punten,
  // in plaats van dat de AI zelf een richtingscoefficient moet uitrekenen
  // voor een lijnSTUK (wat "functies" niet kan: dat tekent altijd de hele
  // lijn door het hele zichtbare venster, niet een stuk tussen 2 punten).
  const puntLabels = new Set(punten.map((p) => p.label));
  const lijnstukken: GrafiekLijnstuk[] = [];
  if (Array.isArray(v.lijnstukken)) {
    for (const l of v.lijnstukken.slice(0, 12)) {
      if (l && typeof l === "object") {
        const rec = l as Record<string, unknown>;
        if (isStr(rec.label) && isStr(rec.van) && isStr(rec.naar) && puntLabels.has(rec.van) && puntLabels.has(rec.naar)) {
          lijnstukken.push({ label: rec.label, van: rec.van, naar: rec.naar });
        }
      }
    }
  }

  if (functies.length === 0 && lijnstukken.length === 0) return null;

  return { type: "grafiek", titel: v.titel, xMin: v.xMin, xMax: v.xMax, yMin: v.yMin, yMax: v.yMax, functies, punten, lijnstukken };
}

function valideerGetallenlijn(v: Record<string, unknown>): GetallenlijnSpec | null {
  if (!isStr(v.titel) || !isNum(v.min) || !isNum(v.max) || v.min >= v.max) return null;
  if (!Array.isArray(v.punten)) return null;

  const punten: GetallenlijnPunt[] = [];
  for (const p of v.punten.slice(0, 10)) {
    if (p && typeof p === "object") {
      const rec = p as Record<string, unknown>;
      if (isStr(rec.label) && isNum(rec.waarde)) punten.push({ label: rec.label, waarde: rec.waarde });
    }
  }
  if (punten.length === 0) return null;

  return { type: "getallenlijn", titel: v.titel, min: v.min, max: v.max, punten };
}

function valideerTabel(v: Record<string, unknown>): TabelSpec | null {
  if (!isStr(v.titel) || !isStr(v.xLabel) || !isStr(v.yLabel)) return null;
  if (!Array.isArray(v.rijen)) return null;

  const rijen: TabelRij[] = [];
  for (const r of v.rijen.slice(0, 12)) {
    if (r && typeof r === "object") {
      const rec = r as Record<string, unknown>;
      if (isNum(rec.x) && isNum(rec.y)) rijen.push({ x: rec.x, y: rec.y });
    }
  }
  if (rijen.length === 0) return null;

  return { type: "tabel", titel: v.titel, xLabel: v.xLabel, yLabel: v.yLabel, rijen };
}

function valideerDiagram(v: Record<string, unknown>): DiagramSpec | null {
  if (!isStr(v.titel) || (v.soort !== "staaf" && v.soort !== "cirkel")) return null;
  if (!Array.isArray(v.categorieen)) return null;

  const categorieen: DiagramCategorie[] = [];
  for (const c of v.categorieen.slice(0, 10)) {
    if (c && typeof c === "object") {
      const rec = c as Record<string, unknown>;
      if (isStr(rec.label) && isNum(rec.waarde) && rec.waarde >= 0) categorieen.push({ label: rec.label, waarde: rec.waarde });
    }
  }
  if (categorieen.length === 0) return null;

  return { type: "diagram", titel: v.titel, soort: v.soort, categorieen };
}

const BREUK_OPERATOREN = new Set(["×", "+", "-", "÷"]);

function isBreukTerm(v: unknown): v is BreukTerm {
  if (!v || typeof v !== "object") return false;
  const rec = v as Record<string, unknown>;
  return isNum(rec.teller) && isNum(rec.noemer) && rec.noemer !== 0;
}

function valideerBreuk(v: Record<string, unknown>): BreukSpec | null {
  if (!isStr(v.titel) || !Array.isArray(v.breuken)) return null;

  const breuken: BreukTerm[] = [];
  for (const b of v.breuken.slice(0, 3)) {
    if (isBreukTerm(b)) breuken.push(b);
  }
  if (breuken.length === 0) return null;

  const operator = typeof v.operator === "string" && BREUK_OPERATOREN.has(v.operator) ? (v.operator as BreukSpec["operator"]) : null;
  const uitkomst = isBreukTerm(v.uitkomst) ? v.uitkomst : null;

  return { type: "breuk", titel: v.titel, operator, breuken, uitkomst };
}

const VALIDATORS: Record<string, (v: Record<string, unknown>) => VisualSpec | null> = {
  grafiek: valideerGrafiek,
  getallenlijn: valideerGetallenlijn,
  tabel: valideerTabel,
  diagram: valideerDiagram,
  breuk: valideerBreuk,
};

const BLOK_REGEX = /```(grafiek|getallenlijn|tabel|diagram|breuk)\s*\n([\s\S]*?)```/g;

/**
 * Haalt visual-blokken uit een AI-antwoord: geeft de tekst terug zonder de
 * code-blokken, plus de (gevalideerde) visuals die getoond mogen worden.
 * Een blok met ongeldige JSON of ontbrekende velden wordt gewoon
 * overgeslagen (nooit een halve/foute visual tonen).
 */
export function extraheerVisuals(tekst: string): { tekst: string; visuals: VisualSpec[] } {
  const visuals: VisualSpec[] = [];
  const schoneTekst = tekst
    .replace(BLOK_REGEX, (_match, taal: string, inhoud: string) => {
      try {
        const ruw = JSON.parse(inhoud);
        if (ruw && typeof ruw === "object") {
          const gevalideerd = VALIDATORS[taal]?.(ruw as Record<string, unknown>);
          if (gevalideerd) visuals.push(gevalideerd);
        }
      } catch {
        // ongeldige JSON - blok wordt gewoon weggelaten
      }
      return "";
    })
    .trim();

  return { tekst: schoneTekst, visuals };
}
