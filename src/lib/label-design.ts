import type { LabelLine, LineSize } from "./labels";

/* Diseño editable de la etiqueta: renglones con variables entre llaves. */

export type RowKind = "text" | "rule" | "space";

export interface DesignRow {
  id: string;
  kind: RowKind;
  text: string;
  size: LineSize;
  bold: boolean;
  align: "left" | "center";
}

export interface LabelDesign {
  widthMm: number;
  heightMm: number;
  rows: DesignRow[];
  /** Imprime todo el texto en mayúsculas. */
  uppercase?: boolean;
}

export const SIZE_OPTIONS: { value: LineSize; label: string }[] = [
  { value: "xs", label: "Muy pequeña" },
  { value: "sm", label: "Pequeña" },
  { value: "md", label: "Mediana" },
  { value: "lg", label: "Grande" },
  { value: "xl", label: "Muy grande" },
];

export const DESIGN_VARIABLES = [
  { key: "taller", label: "Nombre del taller" },
  { key: "direccion", label: "Dirección del taller" },
  { key: "telefono", label: "Teléfono del taller" },
  { key: "cliente", label: "Cliente" },
  { key: "vehiculo", label: "Vehículo" },
  { key: "placa", label: "Placa" },
  { key: "fecha", label: "Fecha del servicio (14/08/2026)" },
  { key: "fecha_corta", label: "Fecha corta (14-8-26)" },
  { key: "proximo", label: "Próximo cambio (14/11/2026)" },
  { key: "proximo_corto", label: "Próximo corto (14-11-26)" },
  { key: "millaje", label: "Millaje actual" },
  { key: "proximo_millaje", label: "Próximo millaje" },
  { key: "aceite", label: "Aceite" },
  { key: "notas", label: "Notas" },
] as const;

export type DesignValues = Partial<Record<(typeof DESIGN_VARIABLES)[number]["key"], string>>;

let seq = 0;
export const newRowId = () => `r${Date.now().toString(36)}${(seq++).toString(36)}`;

const row = (text: string, size: LineSize, bold = false, align: "left" | "center" = "center"): DesignRow => ({
  id: newRowId(),
  kind: "text",
  text,
  size,
  bold,
  align,
});
const rule = (): DesignRow => ({ id: newRowId(), kind: "rule", text: "", size: "sm", bold: false, align: "center" });
const space = (): DesignRow => ({ id: newRowId(), kind: "space", text: "", size: "md", bold: false, align: "center" });

export const DEFAULT_SIZE = { widthMm: 63.5, heightMm: 31.8 }; // 2.50″ × 1.25″ (sticker real medido)

export const DESIGN_PRESETS: { id: string; name: string; build: () => LabelDesign }[] = [
  {
    id: "zdesigner",
    name: "Sticker formato Zebra",
    build: () => ({
      ...DEFAULT_SIZE,
      uppercase: true,
      rows: [
        row("{taller}", "lg", true),
        row("{direccion} - {telefono}", "md", true),
        space(),
        row("FECHA {fecha_corta} PROX. {proximo_corto}", "lg", true, "left"),
        row("MI. ACTUAL. {millaje}", "lg", true, "left"),
        row("PROX. MI. {proximo_millaje}", "lg", true, "left"),
        row("ACEITE {aceite}", "lg", true, "left"),
      ],
    }),
  },
];

export const defaultDesign = () => DESIGN_PRESETS[0].build();

/** Valida y normaliza un diseño guardado (viene de la BD). */
export function sanitizeDesign(input: unknown): LabelDesign | null {
  if (!input || typeof input !== "object") return null;
  const d = input as Partial<LabelDesign>;
  if (!Array.isArray(d.rows)) return null;
  const sizes: LineSize[] = ["xs", "sm", "md", "lg", "xl"];
  const rows = d.rows.slice(0, 30).map((r) => {
    const x = (r ?? {}) as Partial<DesignRow>;
    return {
      id: typeof x.id === "string" ? x.id.slice(0, 40) : newRowId(),
      kind: x.kind === "rule" || x.kind === "space" ? x.kind : "text",
      text: typeof x.text === "string" ? x.text.slice(0, 200) : "",
      size: sizes.includes(x.size as LineSize) ? (x.size as LineSize) : "sm",
      bold: Boolean(x.bold),
      align: x.align === "left" ? "left" : "center",
    } satisfies DesignRow;
  });
  const num = (v: unknown, min: number, max: number, def: number) =>
    typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : def;
  return {
    widthMm: num(d.widthMm, 30, 120, DEFAULT_SIZE.widthMm),
    heightMm: num(d.heightMm, 15, 100, DEFAULT_SIZE.heightMm),
    rows,
    uppercase: Boolean(d.uppercase),
  };
}

const VAR_RE = /\{(\w+)\}/g;

/**
 * Sustituye las variables. Los tramos separados por « · » cuyas variables
 * quedan vacías se omiten, y el renglón entero se omite si solo tenía
 * variables vacías (p. ej. «Notas: {notas}» sin notas).
 */
export function renderRowText(text: string, values: DesignValues): string {
  const segments = text.split(" · ");
  const kept: string[] = [];
  let hadVars = false;
  for (const seg of segments) {
    const vars = [...seg.matchAll(VAR_RE)].map((m) => m[1]);
    if (vars.length) hadVars = true;
    const filled = vars.filter((k) => (values as Record<string, string | undefined>)[k]?.trim());
    if (vars.length && filled.length === 0) continue;
    kept.push(seg.replace(VAR_RE, (_, k: string) => (values as Record<string, string | undefined>)[k]?.trim() ?? ""));
  }
  if (hadVars && kept.length === 0) return "";
  return kept.join(" · ").trim();
}

export function renderDesign(design: LabelDesign, values: DesignValues): LabelLine[] {
  const out: LabelLine[] = [];
  for (const r of design.rows) {
    if (r.kind === "rule") out.push({ kind: "rule" });
    else if (r.kind === "space") out.push({ kind: "space", size: r.size });
    else {
      const raw = renderRowText(r.text, values);
      const text = design.uppercase ? raw.toLocaleUpperCase("es") : raw;
      if (text) out.push({ kind: "text", text, size: r.size, bold: r.bold, align: r.align });
    }
  }
  return out;
}
