"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { ChevronDown, Download, Printer, Zap } from "lucide-react";
import { useAppointments, useSettings } from "@/lib/hooks";
import { effectiveStatus, formatDate, todayISO } from "@/lib/dates";
import { formatPhone } from "@/lib/whatsapp";
import {
  buildEpl,
  buildTspl,
  buildZpl,
  DEFAULT_PRINTER,
  downloadFile,
  findZebraPrinter,
  LABEL_FONT,
  labelInnerHtml,
  layoutLabel,
  printLabelsInBrowser,
  sendToZebra,
  type LabelLine,
  type LabelSpec,
  type PrinterConfig,
} from "@/lib/labels";
import type { Appointment } from "@/lib/types";
import { cn, vehicleLabel } from "@/lib/utils";
import { Button, Card, Field, Input, PageHeader, Select, Skeleton } from "@/components/ui";

interface Fields {
  line1: string;
  line2: string;
  serviceDate: string;
  nextDate: string;
  mileage: string;
  nextMileage: string;
  oil: string;
}

const STORAGE_KEY = "label-printer-v3";

function loadPrinter(): PrinterConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULT_PRINTER, ...JSON.parse(raw) };
  } catch {}
  return DEFAULT_PRINTER;
}

/** 2026-11-12 → 12-11-26 (como en el diseño del taller) */
const shortDate = (iso: string) => (iso ? formatDate(iso, "d-M-yy") : "");
const digits = (v: string) => v.replace(/[^\d]/g, "");

/** Formato del taller: encabezado centrado y 4 renglones de datos a la izquierda. */
function buildLines(f: Fields): LabelLine[] {
  const T = (text: string, align: "center" | "left", size: "lg" | "md" = "lg"): LabelLine => ({
    kind: "text",
    text: text.toUpperCase(),
    size,
    bold: true,
    align,
  });
  const fecha = [f.serviceDate && `FECHA ${shortDate(f.serviceDate)}`, f.nextDate && `PROX. ${shortDate(f.nextDate)}`]
    .filter(Boolean)
    .join(" ");
  return [
    T(f.line1, "center"),
    T(f.line2, "center", "md"),
    { kind: "space", size: "md" },
    T(fecha, "left"),
    T(f.mileage ? `MI. ACTUAL. ${digits(f.mileage)}` : "", "left"),
    T(f.nextMileage ? `PROX. MI. ${digits(f.nextMileage)}` : "", "left"),
    T(f.oil ? `ACEITE ${f.oil}` : "", "left"),
  ];
}

export default function EtiquetasPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <EtiquetasContent />
    </Suspense>
  );
}

function EtiquetasContent() {
  const params = useSearchParams();
  const { data: appointments, loading } = useAppointments();
  const { data: settings } = useSettings();
  const [agendaId, setAgendaId] = useState<string>(params.get("agenda") ?? "");
  const [printer, setPrinter] = useState<PrinterConfig>(DEFAULT_PRINTER);
  const [busy, setBusy] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [fields, setFields] = useState<Fields>({
    line1: "",
    line2: "",
    serviceDate: todayISO(),
    nextDate: "",
    mileage: "",
    nextMileage: "",
    oil: "",
  });

  useEffect(() => setPrinter(loadPrinter()), []);
  const updatePrinter = (p: Partial<PrinterConfig>) =>
    setPrinter((cur) => {
      const next = { ...cur, ...p };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });

  // Encabezado desde Configuración
  useEffect(() => {
    if (!settings) return;
    setFields((f) => ({
      ...f,
      line1: f.line1 || settings.workshop_name,
      line2: f.line2 || [settings.workshop_address, formatPhone(settings.workshop_phone)].filter(Boolean).join(" - "),
    }));
  }, [settings]);

  const options = useMemo(
    () =>
      appointments
        .filter((a) => a.id === agendaId || !["completado", "renovado"].includes(effectiveStatus(a)))
        .sort((a, b) => (a.client?.name ?? "").localeCompare(b.client?.name ?? "")),
    [appointments, agendaId],
  );

  // Rellenar desde la agenda elegida
  useEffect(() => {
    const a: Appointment | undefined = appointments.find((x) => x.id === agendaId);
    if (!a) return;
    setFields((f) => ({
      ...f,
      serviceDate: a.service_date,
      nextDate: a.next_due_date,
      mileage: a.mileage ? String(a.mileage) : "",
      nextMileage: a.next_mileage ? String(a.next_mileage) : "",
      oil: a.oil_type ?? "",
    }));
  }, [agendaId, appointments]);

  const set = (k: keyof Fields) => (e: React.ChangeEvent<HTMLInputElement>) => setFields((f) => ({ ...f, [k]: e.target.value }));

  const spec: LabelSpec = useMemo(
    () => ({ widthMm: printer.widthMm, heightMm: printer.heightMm, lines: buildLines(fields), qr: null }),
    [printer.widthMm, printer.heightMm, fields],
  );
  const previewHtml = useMemo(() => labelInnerHtml(layoutLabel(spec)), [spec]);
  const pxPerMm = 96 / 25.4;
  const previewBox = useRef<HTMLDivElement>(null);
  const [boxWidth, setBoxWidth] = useState(480);
  useEffect(() => {
    const el = previewBox.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setBoxWidth(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const scale = Math.min(boxWidth / (spec.widthMm * pxPerMm), 3);
  const fileBase = `etiqueta-aceite-${shortDate(fields.serviceDate) || "taller"}`;
  const missing = !fields.nextDate && !fields.nextMileage;

  const printZebraDirect = async () => {
    setBusy(true);
    try {
      const found = await findZebraPrinter();
      if (!found) {
        toast.error("No se encontró Zebra Browser Print", {
          description: "Instala y abre Zebra Browser Print en esta computadora, o usa «Imprimir».",
          duration: 9000,
        });
        return;
      }
      const data = printer.zebraLang === "zpl" ? buildZpl(spec, printer) : buildEpl(spec, printer);
      await sendToZebra(found.host, found.device, data);
      toast.success(`Enviado a ${found.device.name}`);
    } catch (e) {
      toast.error("No se pudo imprimir en la Zebra", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };

  const mileagePlus = (n: number) => setFields((f) => ({ ...f, nextMileage: String(Number(digits(f.mileage)) + n) }));

  return (
    <>
      <PageHeader title="Etiquetas de aceite" description={`Sticker para el parabrisas · ${(printer.widthMm / 25.4).toFixed(1)}″ × ${(printer.heightMm / 25.4).toFixed(1)}″ horizontal`} />

      <div className="grid gap-6 xl:grid-cols-[1fr_minmax(0,620px)]">
        {/* -------- Datos -------- */}
        <Card className="p-5 space-y-5 h-fit">
          <Field label="Llenar desde una agenda" hint="Copia las fechas, el millaje y el aceite de la agenda.">
            {loading ? (
              <Skeleton className="h-10" />
            ) : (
              <Select value={agendaId} onChange={(e) => setAgendaId(e.target.value)}>
                <option value="">— Sin agenda (llenar a mano) —</option>
                {options.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.client?.name ?? "Cliente"} · {vehicleLabel(a.vehicle)} · {formatDate(a.next_due_date)}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Fecha">
              <Input type="date" value={fields.serviceDate} onChange={set("serviceDate")} />
            </Field>
            <Field label="Próximo cambio">
              <Input type="date" value={fields.nextDate} onChange={set("nextDate")} />
            </Field>
            <Field label="Millaje actual">
              <Input inputMode="numeric" value={fields.mileage} onChange={set("mileage")} placeholder="240287" />
            </Field>
            <Field label="Próximo millaje">
              <div className="flex gap-2">
                <Input inputMode="numeric" value={fields.nextMileage} onChange={set("nextMileage")} placeholder="243287" />
                {digits(fields.mileage) && (
                  <>
                    <Button type="button" variant="secondary" className="shrink-0 px-2.5" onClick={() => mileagePlus(3000)}>
                      +3,000
                    </Button>
                    <Button type="button" variant="secondary" className="shrink-0 px-2.5" onClick={() => mileagePlus(5000)}>
                      +5,000
                    </Button>
                  </>
                )}
              </div>
            </Field>
            <Field label="Aceite" className="sm:col-span-2">
              <Input value={fields.oil} onChange={set("oil")} placeholder="CEPSA 5W-20" className="uppercase" />
            </Field>
          </div>

          <details className="group rounded-xl border border-line px-4 py-3">
            <summary className="cursor-pointer select-none text-sm font-medium text-muted">Encabezado</summary>
            <div className="mt-4 grid gap-4">
              <Field label="Línea 1">
                <Input value={fields.line1} onChange={set("line1")} className="uppercase" />
              </Field>
              <Field label="Línea 2" hint="Se toma de Configuración → Taller (dirección y teléfono).">
                <Input value={fields.line2} onChange={set("line2")} className="uppercase" />
              </Field>
            </div>
          </details>
        </Card>

        {/* -------- Vista previa e impresión -------- */}
        <div className="space-y-4 min-w-0">
          <Card className="p-5">
            <div className="mb-4 flex items-center justify-between">
              <p className="text-xs font-medium uppercase tracking-wide text-muted">Vista previa</p>
              <span className="text-xs text-muted tabular-nums">
                {spec.widthMm} × {spec.heightMm} mm
              </span>
            </div>
            <div className="overflow-hidden rounded-2xl bg-[repeating-linear-gradient(45deg,var(--surface-2),var(--surface-2)_8px,transparent_8px,transparent_16px)] p-4 sm:p-6">
              <div ref={previewBox} className="w-full" />
              <div className="mx-auto" style={{ width: spec.widthMm * pxPerMm * scale, height: spec.heightMm * pxPerMm * scale }}>
                <div
                  className="relative overflow-hidden rounded-[10px] bg-white text-black shadow-xl ring-1 ring-black/10 origin-top-left"
                  style={{
                    width: `${spec.widthMm}mm`,
                    height: `${spec.heightMm}mm`,
                    transform: `scale(${scale})`,
                    fontFamily: LABEL_FONT,
                  }}
                  dangerouslySetInnerHTML={{ __html: previewHtml }}
                />
              </div>
            </div>
            {missing && <p className="mt-3 text-center text-xs text-amber-600">Falta la fecha o el millaje del próximo cambio.</p>}
          </Card>

          <Card className="p-5 space-y-3">
            <div className="flex items-end gap-3">
              <Field label="Copias" className="w-28">
                <Input type="number" min={1} max={100} value={printer.copies} onChange={(e) => updatePrinter({ copies: Math.max(1, Math.min(100, Number(e.target.value) || 1)) })} />
              </Field>
              <Button size="lg" className="flex-1" onClick={() => printLabelsInBrowser(spec, printer.copies)}>
                <Printer className="size-4" /> Imprimir
              </Button>
            </div>
            <p className="text-xs text-muted">
              Elige <b className="text-fg">ZDesigner LP 2844</b> en la ventana de impresión, con márgenes <b className="text-fg">Ninguno</b> y escala <b className="text-fg">100%</b>.
            </p>
            <Button variant="secondary" className="w-full" loading={busy} onClick={printZebraDirect}>
              <Zap className="size-4" /> Zebra directo (Browser Print)
            </Button>

            <button
              onClick={() => setShowAdvanced((s) => !s)}
              className="flex w-full items-center justify-between pt-2 text-sm font-medium text-muted hover:text-fg cursor-pointer"
            >
              Opciones avanzadas
              <ChevronDown className={cn("size-4 transition", showAdvanced && "rotate-180")} />
            </button>
            {showAdvanced && (
              <div className="space-y-4 border-t border-line pt-4">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <Field label="Ancho (mm)">
                    <Input type="number" min={30} max={120} step={0.1} value={printer.widthMm} onChange={(e) => updatePrinter({ widthMm: Math.max(30, Math.min(120, Number(e.target.value) || 30)) })} />
                  </Field>
                  <Field label="Alto (mm)">
                    <Input type="number" min={15} max={100} step={0.1} value={printer.heightMm} onChange={(e) => updatePrinter({ heightMm: Math.max(15, Math.min(100, Number(e.target.value) || 15)) })} />
                  </Field>
                  <Field label="Separación (mm)">
                    <Input type="number" min={0} max={10} step={0.5} value={printer.gapMm} onChange={(e) => updatePrinter({ gapMm: Math.max(0, Number(e.target.value) || 0) })} />
                  </Field>
                  <Field label="Zebra directo">
                    <Select value={printer.zebraLang} onChange={(e) => updatePrinter({ zebraLang: e.target.value as "epl" | "zpl" })}>
                      <option value="epl">EPL (LP 2844)</option>
                      <option value="zpl">ZPL</option>
                    </Select>
                  </Field>
                </div>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" className="accent-brand-500" checked={printer.invertTspl} onChange={(e) => updatePrinter({ invertTspl: e.target.checked })} />
                  La etiqueta sale en negativo (EPL / TSPL)
                </label>
                <div className="flex flex-wrap gap-2">
                  <Button variant="ghost" size="sm" onClick={() => downloadFile(`${fileBase}.epl`, buildEpl(spec, printer))}>
                    <Download className="size-3.5" /> EPL
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => downloadFile(`${fileBase}.zpl`, buildZpl(spec, printer), "text/plain")}>
                    <Download className="size-3.5" /> ZPL
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => downloadFile(`${fileBase}.prn`, buildTspl(spec, printer))}>
                    <Download className="size-3.5" /> TSPL (2Connect)
                  </Button>
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
