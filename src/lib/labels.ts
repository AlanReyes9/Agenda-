"use client";

/* ------------------------------------------------------------------ */
/* Modelo                                                              */
/* ------------------------------------------------------------------ */

export type LineSize = "xl" | "lg" | "md" | "sm" | "xs";

export type LabelLine =
  | { kind: "text"; text: string; size: LineSize; bold?: boolean; align?: "center" | "left" }
  | { kind: "rule" }
  | { kind: "space"; size: LineSize };

export interface LabelSpec {
  widthMm: number;
  heightMm: number;
  lines: LabelLine[];
}

export interface PrinterConfig {
  widthMm: number;
  heightMm: number;
  dpi: 203 | 300;
  gapMm: number;
  copies: number;
  /** Algunas impresoras TSPL interpretan los bits al revés. */
  invertTspl: boolean;
  /** Lenguaje para «Zebra directo»: EPL (LP 2844, TLP 2844) o ZPL (modelos -Z, ZD, GK…). */
  zebraLang: "epl" | "zpl";
  /** Calibración por computadora: mover (mm) y escalar (%) lo que se imprime. */
  offsetXmm: number;
  offsetYmm: number;
  scalePct: number;
  /** Escala extra solo en vertical (para cuando sale más alta o más baja que el sticker). */
  scaleYPct: number;
  /** Imprime un borde en el contorno de la etiqueta para calibrar. */
  testBorder: boolean;
}

export const LABEL_PRESETS = [
  { id: "2.5x1.4", label: "2.5″ × 1.4″ (64 × 36 mm) — horizontal", w: 63.5, h: 35.6 },
  { id: "1.4x2.5", label: "1.4″ × 2.5″ (36 × 64 mm) — vertical", w: 35.6, h: 63.5 },
  { id: "50x25", label: "50 × 25 mm (2″ × 1″)", w: 50, h: 25 },
  { id: "50x50", label: "50 × 50 mm (2″ × 2″)", w: 50, h: 50 },
  { id: "60x40", label: "60 × 40 mm", w: 60, h: 40 },
  { id: "76x51", label: "76 × 51 mm (3″ × 2″)", w: 76, h: 51 },
  { id: "100x50", label: "100 × 50 mm (4″ × 2″)", w: 100, h: 50 },
  { id: "100x150", label: "100 × 150 mm (4″ × 6″)", w: 100, h: 150 },
] as const;

/** Fuente gruesa parecida a la del diseño de ZDesigner (Tahoma Bold en Windows). */
export const LABEL_FONT = "Tahoma, Verdana, 'DejaVu Sans', Arial, Helvetica, sans-serif";

export const DEFAULT_PRINTER: PrinterConfig = {
  widthMm: 63.5,
  heightMm: 35.6,
  dpi: 203,
  gapMm: 2,
  copies: 1,
  invertTspl: false,
  zebraLang: "epl",
  offsetXmm: 0,
  offsetYmm: 0,
  scalePct: 100,
  scaleYPct: 100,
  testBorder: false,
};

/** Aplica la calibración (escala desde la esquina y desplazamiento) y el borde de prueba. */
export function placedForPrint(spec: LabelSpec, cfg?: Pick<PrinterConfig, "offsetXmm" | "offsetYmm" | "scalePct" | "scaleYPct" | "testBorder">): Placed[] {
  const base = layoutLabel(spec);
  if (cfg?.testBorder) {
    const t = 0.5;
    const { widthMm: W, heightMm: H } = spec;
    base.push(
      { kind: "rule", x: 0, y: 0, w: W, t },
      { kind: "rule", x: 0, y: H - t, w: W, t },
      { kind: "rule", x: 0, y: 0, w: t, t: H },
      { kind: "rule", x: W - t, y: 0, w: t, t: H },
    );
  }
  if (!cfg) return base;
  const kx = (cfg.scalePct || 100) / 100;
  const ky = kx * ((cfg.scaleYPct || 100) / 100);
  const dx = cfg.offsetXmm || 0;
  const dy = cfg.offsetYmm || 0;
  if (kx === 1 && ky === 1 && !dx && !dy) return base;
  return base.map((p) =>
    p.kind === "rule"
      ? { ...p, x: p.x * kx + dx, y: p.y * ky + dy, w: p.w * kx, t: p.t * ky }
      : // la letra se escala con el menor factor para no deformarse ni salirse
        { ...p, x: p.x * kx + dx, y: p.y * ky + dy + (p.h * ky - p.h * Math.min(kx, ky)) / 2, w: p.w * kx, h: p.h * Math.min(kx, ky) },
  );
}

const WEIGHT: Record<LineSize, number> = { xl: 2.6, lg: 1.7, md: 1.25, sm: 1, xs: 0.82 };
const LINE_GAP = 1.22;
const RULE_SLOT = 0.55;

/* ------------------------------------------------------------------ */
/* Diseño: posiciones en milímetros, compartidas por todos los formatos */
/* ------------------------------------------------------------------ */

export interface PlacedText {
  kind: "text";
  x: number;
  y: number;
  w: number;
  h: number; // alto de la fuente en mm
  text: string;
  bold: boolean;
  align: "center" | "left";
}
export interface PlacedRule {
  kind: "rule";
  x: number;
  y: number;
  w: number;
  t: number;
}
export type Placed = PlacedText | PlacedRule;

/** Ancho del texto (en unidades de alto de fuente), medido con la fuente real cuando hay navegador. */
let measureCtx: CanvasRenderingContext2D | null | undefined;
function textWidthRatio(text: string, bold: boolean): number {
  if (measureCtx === undefined) {
    measureCtx = typeof document !== "undefined" ? document.createElement("canvas").getContext("2d") : null;
  }
  if (measureCtx) {
    measureCtx.font = `${bold ? "bold" : "500"} 100px ${LABEL_FONT}`;
    return measureCtx.measureText(text).width / 100;
  }
  let w = 0;
  for (const ch of text) w += /[A-ZÁÉÍÓÚÑ0-9@MW]/.test(ch) ? 0.68 : /[\s.,:;·il|!]/.test(ch) ? 0.3 : 0.55;
  return w * (bold ? 1.06 : 1);
}

export function layoutLabel(spec: LabelSpec): Placed[] {
  const { widthMm: W, heightMm: H } = spec;
  const m = Math.min(4, Math.max(1.5, Math.min(W, H) * 0.06));
  const out: Placed[] = [];
  const textX = m;
  const textW = W - 2 * m;
  const textTop = m;
  const textBottom = H - m;

  const lines = spec.lines.filter((l) => l.kind !== "text" || l.text.trim());
  const units = lines.reduce(
    (n, l) => n + (l.kind === "rule" ? RULE_SLOT : l.kind === "space" ? WEIGHT[l.size] * 0.5 : WEIGHT[l.size] * LINE_GAP),
    0,
  );
  if (!units) return out;
  const unit = (textBottom - textTop) / units;

  let y = textTop;
  for (const l of lines) {
    if (l.kind === "space") {
      y += unit * WEIGHT[l.size] * 0.5;
      continue;
    }
    if (l.kind === "rule") {
      const slot = unit * RULE_SLOT;
      const t = Math.max(0.25, Math.min(0.5, unit * 0.12));
      out.push({ kind: "rule", x: textX, y: y + slot / 2 - t / 2, w: textW, t });
      y += slot;
      continue;
    }
    const slot = unit * WEIGHT[l.size] * LINE_GAP;
    const bold = Boolean(l.bold);
    let h = unit * WEIGHT[l.size];
    // 4% de margen de seguridad: la fuente de la impresora no es idéntica a Arial
    const maxByWidth = (textW * 0.96) / Math.max(0.5, textWidthRatio(l.text, bold));
    h = Math.min(h, maxByWidth);
    out.push({
      kind: "text",
      x: textX,
      y: y + (slot - h) / 2,
      w: textW,
      h,
      text: l.text,
      bold,
      align: l.align ?? "center",
    });
    y += slot;
  }

  // Las líneas alineadas a la izquierda y consecutivas usan el mismo tamaño (el menor del grupo)
  const texts = out.filter((p): p is PlacedText => p.kind === "text");
  let group: PlacedText[] = [];
  const flush = () => {
    if (group.length > 1) {
      const h = Math.min(...group.map((g) => g.h));
      for (const g of group) {
        g.y += (g.h - h) / 2;
        g.h = h;
      }
    }
    group = [];
  };
  for (const t of texts) {
    if (t.align === "left" && (!group.length || Math.abs(group[0].h - t.h) < group[0].h * 0.6)) group.push(t);
    else {
      flush();
      if (t.align === "left") group.push(t);
    }
  }
  flush();
  return out;
}

/* ------------------------------------------------------------------ */
/* HTML (vista previa e impresión con el driver)                        */
/* ------------------------------------------------------------------ */

function esc(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

export function labelInnerHtml(placed: Placed[]): string {
  return placed
    .map((p) => {
      if (p.kind === "rule")
        return `<div style="position:absolute;left:${p.x}mm;top:${p.y}mm;width:${p.w}mm;height:${p.t}mm;background:#000"></div>`;
      return `<div style="position:absolute;left:${p.x}mm;top:${p.y}mm;width:${p.w}mm;font-size:${p.h}mm;line-height:1;font-weight:${p.bold ? 700 : 500};text-align:${p.align};white-space:nowrap;overflow:hidden;letter-spacing:-0.01em">${esc(p.text)}</div>`;
    })
    .join("");
}

export function printLabelsInBrowser(spec: LabelSpec, cfg: PrinterConfig) {
  // Se imprime como imagen en blanco y negro puro a la resolución de la impresora:
  // así el driver no difumina (gris) ni reacomoda el texto.
  const src = renderToCanvas(spec, cfg.dpi, cfg).toDataURL("image/png");
  const img = `<img src="${src}" style="display:block;width:${spec.widthMm}mm;height:${spec.heightMm}mm;image-rendering:pixelated;image-rendering:crisp-edges">`;
  const pages = Array.from({ length: Math.max(1, cfg.copies) }, () => `<div class="label">${img}</div>`).join("");
  // La página va en pulgadas redondeadas hacia abajo (63.5 × 35.6 mm → 2.50″ × 1.40″),
  // igual que el tamaño configurado en el driver ZDesigner.
  const pageWin = Math.floor((spec.widthMm / 25.4) * 100 + 1e-6) / 100;
  const pageHin = Math.floor((spec.heightMm / 25.4) * 100 + 1e-6) / 100;
  // El contenido queda 1.5 mm más corto que la página: así nunca se desborda a una
  // segunda página (que la impresora saca como un sticker en blanco).
  const boxHmm = (pageHin * 25.4 - 1.5).toFixed(2);
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Etiqueta</title><style>
    @page { size: ${pageWin.toFixed(2)}in ${pageHin.toFixed(2)}in; margin: 0; }
    * { box-sizing: border-box; margin: 0; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    html, body { background: #fff; overflow: hidden; }
    .label { width: ${pageWin.toFixed(2)}in; height: ${boxHmm}mm; overflow: hidden; page-break-after: always; break-after: page; page-break-inside: avoid; break-inside: avoid; }
    .label:last-child { page-break-after: auto; break-after: auto; }
  </style></head><body>${pages}</body></html>`.replace(/>\s+</g, "><");

  const iframe = document.createElement("iframe");
  iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument!;
  doc.open();
  doc.write(html);
  doc.close();
  setTimeout(() => {
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();
    setTimeout(() => iframe.remove(), 60_000);
  }, 250);
}

/* ------------------------------------------------------------------ */
/* Mapa de bits (canvas) — base de TSPL                                 */
/* ------------------------------------------------------------------ */

export function renderToCanvas(spec: LabelSpec, dpi: number, cfg?: PrinterConfig): HTMLCanvasElement {
  const dpmm = dpi / 25.4;
  const W = Math.round(spec.widthMm * dpmm);
  const H = Math.round(spec.heightMm * dpmm);
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#000";
  for (const p of placedForPrint(spec, cfg)) {
    if (p.kind === "rule") {
      ctx.fillRect(Math.round(p.x * dpmm), Math.round(p.y * dpmm), Math.round(p.w * dpmm), Math.max(1, Math.round(p.t * dpmm)));
    } else {
      let px = p.h * dpmm;
      const maxW = p.w * dpmm;
      const font = (s: number) => `${p.bold ? "bold" : "500"} ${s}px ${LABEL_FONT}`;
      ctx.font = font(px);
      const measured = ctx.measureText(p.text).width;
      if (measured > maxW) {
        px = (px * maxW) / measured;
        ctx.font = font(px);
      }
      ctx.textBaseline = "top";
      ctx.textAlign = p.align === "center" ? "center" : "left";
      const x = p.align === "center" ? (p.x + p.w / 2) * dpmm : p.x * dpmm;
      ctx.fillText(p.text, x, p.y * dpmm + (p.h * dpmm - px) / 2);
    }
  }
  // Blanco y negro puro (sin grises del suavizado)
  const img = ctx.getImageData(0, 0, W, H);
  const d = img.data;
  for (let k = 0; k < d.length; k += 4) {
    const v = 0.299 * d[k] + 0.587 * d[k + 1] + 0.114 * d[k + 2] < 140 ? 0 : 255;
    d[k] = d[k + 1] = d[k + 2] = v;
    d[k + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/** Convierte el canvas a 1 bit por punto. Devuelve filas empaquetadas (1 = negro). */
function canvasToBits(canvas: HTMLCanvasElement) {
  const { width, height } = canvas;
  const data = canvas.getContext("2d")!.getImageData(0, 0, width, height).data;
  const bytesPerRow = Math.ceil(width / 8);
  const bits = new Uint8Array(bytesPerRow * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      if (lum < 140) bits[y * bytesPerRow + (x >> 3)] |= 0x80 >> (x & 7);
    }
  }
  return { bits, bytesPerRow, height };
}

/* ------------------------------------------------------------------ */
/* EPL2 (Zebra LP 2844, TLP 2844 y otras Zebra antiguas)                 */
/* ------------------------------------------------------------------ */

export function buildEpl(spec: LabelSpec, cfg: PrinterConfig): Uint8Array {
  const canvas = renderToCanvas(spec, cfg.dpi, cfg);
  const { bits, bytesPerRow, height } = canvasToBits(canvas);
  // En EPL (GW) un bit en 0 imprime negro, igual que en TSPL.
  const payload = cfg.invertTspl ? bits : bits.map((b) => ~b & 0xff);
  const dpmm = cfg.dpi / 25.4;
  const enc = new TextEncoder();
  const head = enc.encode(
    ["", "N", `q${bytesPerRow * 8}`, `Q${Math.round(spec.heightMm * dpmm)},${Math.round(cfg.gapMm * dpmm)}`, `GW0,0,${bytesPerRow},${height},`].join("\n"),
  );
  const tail = enc.encode(`\nP${Math.max(1, cfg.copies)}\n`);
  const out = new Uint8Array(head.length + payload.length + tail.length);
  out.set(head, 0);
  out.set(payload, head.length);
  out.set(tail, head.length + payload.length);
  return out;
}

/* ------------------------------------------------------------------ */
/* TSPL (2Connect, Xprinter, TSC y compatibles)                         */
/* ------------------------------------------------------------------ */

export function buildTspl(spec: LabelSpec, cfg: PrinterConfig): Uint8Array {
  const canvas = renderToCanvas(spec, cfg.dpi, cfg);
  const { bits, bytesPerRow, height } = canvasToBits(canvas);
  // En TSPL un bit en 0 imprime negro: invertimos salvo que la impresora pida lo contrario.
  const payload = cfg.invertTspl ? bits : bits.map((b) => ~b & 0xff);
  const enc = new TextEncoder();
  const head = enc.encode(
    [
      `SIZE ${spec.widthMm} mm,${spec.heightMm} mm`,
      `GAP ${cfg.gapMm} mm,0 mm`,
      "DIRECTION 1,0",
      "REFERENCE 0,0",
      "CLS",
      `BITMAP 0,0,${bytesPerRow},${height},0,`,
    ].join("\r\n"),
  );
  const tail = enc.encode(`\r\nPRINT ${Math.max(1, cfg.copies)},1\r\n`);
  const out = new Uint8Array(head.length + payload.length + tail.length);
  out.set(head, 0);
  out.set(payload, head.length);
  out.set(tail, head.length + payload.length);
  return out;
}

/* ------------------------------------------------------------------ */
/* ZPL (Zebra)                                                          */
/* ------------------------------------------------------------------ */


export function buildZpl(spec: LabelSpec, cfg: PrinterConfig): string {
  const dpmm = cfg.dpi / 25.4;
  const d = (mm: number) => Math.max(0, Math.round(mm * dpmm));
  const clean = (s: string) => s.replace(/[\^~\\]/g, " ");
  const parts = ["^XA", "^CI28", `^PW${d(spec.widthMm)}`, `^LL${d(spec.heightMm)}`, "^LH0,0"];
  for (const p of placedForPrint(spec, cfg)) {
    if (p.kind === "rule") parts.push(`^FO${d(p.x)},${d(p.y)}^GB${Math.max(1, d(p.w))},${Math.max(1, d(p.t))},${Math.max(1, Math.min(d(p.w), d(p.t)))}^FS`);
    else {
      const h = Math.max(10, d(p.h * 1.12)); // la fuente 0 es algo más baja que Arial
      parts.push(`^FO${d(p.x)},${d(p.y)}^A0N,${h},${Math.round(h * (p.bold ? 0.95 : 0.85))}^FB${d(p.w)},1,0,${p.align === "center" ? "C" : "L"},0^FD${clean(p.text)}^FS`);
    }
  }
  parts.push(`^PQ${Math.max(1, cfg.copies)},0,1,Y`, "^XZ");
  return parts.join("\n");
}

/* ------------------------------------------------------------------ */
/* Zebra Browser Print (programa local de Zebra)                         */
/* ------------------------------------------------------------------ */

const BROWSER_PRINT_HOSTS = ["http://127.0.0.1:9100", "https://127.0.0.1:9101", "http://localhost:9100"];

export interface ZebraDevice {
  name: string;
  uid: string;
  connection: string;
  deviceType: string;
  provider: string;
  manufacturer: string;
  version?: number;
}

async function withTimeout<T>(p: Promise<T>, ms = 3500): Promise<T> {
  return Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);
}

export async function findZebraPrinter(): Promise<{ host: string; device: ZebraDevice } | null> {
  for (const host of BROWSER_PRINT_HOSTS) {
    try {
      const res = await withTimeout(fetch(`${host}/default?type=printer`));
      if (!res.ok) continue;
      const text = await res.text();
      if (!text.trim()) continue;
      return { host, device: JSON.parse(text) as ZebraDevice };
    } catch {
      /* probar el siguiente */
    }
  }
  return null;
}

export async function sendToZebra(host: string, device: ZebraDevice, data: string | Uint8Array) {
  // Browser Print recibe texto: los bytes del mapa de bits van como latin1 (1 carácter = 1 byte)
  const zpl = typeof data === "string" ? data : Array.from(data, (b) => String.fromCharCode(b)).join("");
  const res = await withTimeout(
    fetch(`${host}/write`, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=UTF-8" },
      body: JSON.stringify({ device, data: zpl }),
    }),
    10000,
  );
  if (!res.ok) throw new Error(`Zebra Browser Print respondió ${res.status}`);
}

/* ------------------------------------------------------------------ */
/* Descarga de archivos                                                 */
/* ------------------------------------------------------------------ */

export function downloadFile(name: string, data: string | Uint8Array, type = "application/octet-stream") {
  const blob = new Blob([data as BlobPart], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
