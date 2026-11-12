"use client";

import QRCode from "qrcode";

/* ------------------------------------------------------------------ */
/* Modelo                                                              */
/* ------------------------------------------------------------------ */

export type LineSize = "xl" | "lg" | "md" | "sm" | "xs";

export type LabelLine =
  | { kind: "text"; text: string; size: LineSize; bold?: boolean; align?: "center" | "left" }
  | { kind: "rule" };

export interface LabelSpec {
  widthMm: number;
  heightMm: number;
  lines: LabelLine[];
  qr?: string | null;
}

export interface PrinterConfig {
  widthMm: number;
  heightMm: number;
  dpi: 203 | 300;
  gapMm: number;
  copies: number;
  /** Algunas impresoras TSPL interpretan los bits al revés. */
  invertTspl: boolean;
  showQr: boolean;
}

export const LABEL_PRESETS = [
  { id: "50x25", label: "50 × 25 mm (2″ × 1″)", w: 50, h: 25 },
  { id: "50x50", label: "50 × 50 mm (2″ × 2″)", w: 50, h: 50 },
  { id: "60x40", label: "60 × 40 mm", w: 60, h: 40 },
  { id: "76x51", label: "76 × 51 mm (3″ × 2″)", w: 76, h: 51 },
  { id: "100x50", label: "100 × 50 mm (4″ × 2″)", w: 100, h: 50 },
  { id: "100x150", label: "100 × 150 mm (4″ × 6″)", w: 100, h: 150 },
] as const;

export const DEFAULT_PRINTER: PrinterConfig = {
  widthMm: 50,
  heightMm: 50,
  dpi: 203,
  gapMm: 2,
  copies: 1,
  invertTspl: false,
  showQr: true,
};

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
export interface PlacedQr {
  kind: "qr";
  x: number;
  y: number;
  size: number;
  modules: boolean[][];
}
export type Placed = PlacedText | PlacedRule | PlacedQr;

function qrModules(data: string): boolean[][] {
  const qr = QRCode.create(data, { errorCorrectionLevel: "M" });
  const n = qr.modules.size;
  const rows: boolean[][] = [];
  for (let r = 0; r < n; r++) {
    const row: boolean[] = [];
    for (let c = 0; c < n; c++) row.push(Boolean(qr.modules.get(r, c)));
    rows.push(row);
  }
  return rows;
}

/** Ancho aproximado de un carácter en relación con el alto de la fuente. */
const charRatio = (bold: boolean) => (bold ? 0.6 : 0.55);

export function layoutLabel(spec: LabelSpec): Placed[] {
  const { widthMm: W, heightMm: H } = spec;
  const m = Math.min(4, Math.max(1.5, Math.min(W, H) * 0.06));
  const out: Placed[] = [];
  let textX = m;
  let textW = W - 2 * m;
  let textTop = m;
  let textBottom = H - m;

  if (spec.qr) {
    const modules = qrModules(spec.qr);
    if (W >= H * 1.3) {
      // Apaisada: QR a la derecha
      const size = Math.min(H - 2 * m, W * 0.36);
      out.push({ kind: "qr", x: W - m - size, y: (H - size) / 2, size, modules });
      textW = W - 3 * m - size;
    } else {
      // Cuadrada o vertical: QR abajo, centrado
      const size = Math.min(W * 0.34, H * 0.28);
      out.push({ kind: "qr", x: (W - size) / 2, y: H - m - size, size, modules });
      textBottom = H - m - size - m * 0.6;
    }
  }

  const lines = spec.lines.filter((l) => l.kind === "rule" || l.text.trim());
  const units = lines.reduce((n, l) => n + (l.kind === "rule" ? RULE_SLOT : WEIGHT[l.size] * LINE_GAP), 0);
  if (!units) return out;
  const unit = (textBottom - textTop) / units;

  let y = textTop;
  for (const l of lines) {
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
    const maxByWidth = textW / (Math.max(1, l.text.length) * charRatio(bold));
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

function qrSvg(q: PlacedQr): string {
  const n = q.modules.length;
  let path = "";
  q.modules.forEach((row, r) => row.forEach((on, c) => on && (path += `M${c} ${r}h1v1h-1z`)));
  return `<svg style="position:absolute;left:${q.x}mm;top:${q.y}mm;width:${q.size}mm;height:${q.size}mm" viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges"><path d="${path}" fill="#000"/></svg>`;
}

export function labelInnerHtml(placed: Placed[]): string {
  return placed
    .map((p) => {
      if (p.kind === "qr") return qrSvg(p);
      if (p.kind === "rule")
        return `<div style="position:absolute;left:${p.x}mm;top:${p.y}mm;width:${p.w}mm;height:${p.t}mm;background:#000"></div>`;
      return `<div style="position:absolute;left:${p.x}mm;top:${p.y}mm;width:${p.w}mm;font-size:${p.h}mm;line-height:1;font-weight:${p.bold ? 700 : 500};text-align:${p.align};white-space:nowrap;overflow:hidden;letter-spacing:-0.01em">${esc(p.text)}</div>`;
    })
    .join("");
}

export function printLabelsInBrowser(spec: LabelSpec, copies: number) {
  const placed = layoutLabel(spec);
  const inner = labelInnerHtml(placed);
  const pages = Array.from({ length: Math.max(1, copies) }, () => `<div class="label">${inner}</div>`).join("");
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Etiqueta</title><style>
    @page { size: ${spec.widthMm}mm ${spec.heightMm}mm; margin: 0; }
    * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    html, body { margin: 0; padding: 0; background: #fff; color: #000; font-family: Arial, Helvetica, sans-serif; }
    .label { position: relative; width: ${spec.widthMm}mm; height: ${spec.heightMm}mm; overflow: hidden; page-break-after: always; break-after: page; }
    .label:last-child { page-break-after: auto; break-after: auto; }
  </style></head><body>${pages}</body></html>`;

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

export function renderToCanvas(spec: LabelSpec, dpi: number): HTMLCanvasElement {
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
  for (const p of layoutLabel(spec)) {
    if (p.kind === "rule") {
      ctx.fillRect(Math.round(p.x * dpmm), Math.round(p.y * dpmm), Math.round(p.w * dpmm), Math.max(1, Math.round(p.t * dpmm)));
    } else if (p.kind === "qr") {
      const n = p.modules.length;
      const cell = Math.max(1, Math.floor((p.size * dpmm) / n));
      const ox = Math.round(p.x * dpmm + (p.size * dpmm - cell * n) / 2);
      const oy = Math.round(p.y * dpmm + (p.size * dpmm - cell * n) / 2);
      p.modules.forEach((row, r) => row.forEach((on, c) => on && ctx.fillRect(ox + c * cell, oy + r * cell, cell, cell)));
    } else {
      let px = p.h * dpmm;
      const maxW = p.w * dpmm;
      const font = (s: number) => `${p.bold ? "bold" : "500"} ${s}px Arial, Helvetica, sans-serif`;
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
/* TSPL (2Connect, Xprinter, TSC y compatibles)                         */
/* ------------------------------------------------------------------ */

export function buildTspl(spec: LabelSpec, cfg: PrinterConfig): Uint8Array {
  const canvas = renderToCanvas(spec, cfg.dpi);
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

function hex(bytes: Uint8Array) {
  let s = "";
  for (const b of bytes) s += b.toString(16).padStart(2, "0").toUpperCase();
  return s;
}

function zplQr(p: PlacedQr, dpmm: number): string {
  const n = p.modules.length;
  const cell = Math.max(1, Math.floor((p.size * dpmm) / n));
  const px = cell * n;
  const bytesPerRow = Math.ceil(px / 8);
  const bits = new Uint8Array(bytesPerRow * px);
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++) {
      if (!p.modules[r][c]) continue;
      for (let dy = 0; dy < cell; dy++)
        for (let dx = 0; dx < cell; dx++) {
          const x = c * cell + dx;
          const y = r * cell + dy;
          bits[y * bytesPerRow + (x >> 3)] |= 0x80 >> (x & 7);
        }
    }
  const ox = Math.round(p.x * dpmm + (p.size * dpmm - px) / 2);
  const oy = Math.round(p.y * dpmm + (p.size * dpmm - px) / 2);
  return `^FO${ox},${oy}^GFA,${bits.length},${bits.length},${bytesPerRow},${hex(bits)}^FS`;
}

export function buildZpl(spec: LabelSpec, cfg: PrinterConfig): string {
  const dpmm = cfg.dpi / 25.4;
  const d = (mm: number) => Math.max(0, Math.round(mm * dpmm));
  const clean = (s: string) => s.replace(/[\^~\\]/g, " ");
  const parts = ["^XA", "^CI28", `^PW${d(spec.widthMm)}`, `^LL${d(spec.heightMm)}`, "^LH0,0"];
  for (const p of layoutLabel(spec)) {
    if (p.kind === "rule") parts.push(`^FO${d(p.x)},${d(p.y)}^GB${d(p.w)},${Math.max(1, d(p.t))},${Math.max(1, d(p.t))}^FS`);
    else if (p.kind === "qr") parts.push(zplQr(p, dpmm));
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

export async function sendToZebra(host: string, device: ZebraDevice, zpl: string) {
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
