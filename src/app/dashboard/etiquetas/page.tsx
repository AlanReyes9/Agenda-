"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { ChevronDown, Download, FileText, Printer, QrCode, Ticket, Type, Zap } from "lucide-react";
import { useAppointments, useSettings } from "@/lib/hooks";
import { effectiveStatus, formatDate, todayISO } from "@/lib/dates";
import { normalizePhone } from "@/lib/whatsapp";
import {
  buildTspl,
  buildZpl,
  DEFAULT_PRINTER,
  downloadFile,
  findZebraPrinter,
  LABEL_PRESETS,
  labelInnerHtml,
  layoutLabel,
  printLabelsInBrowser,
  sendToZebra,
  type LabelLine,
  type LabelSpec,
  type LineSize,
  type PrinterConfig,
} from "@/lib/labels";
import type { Appointment } from "@/lib/types";
import { cn, vehicleLabel } from "@/lib/utils";
import { Button, Card, Field, Input, PageHeader, Select, Skeleton, Textarea } from "@/components/ui";

type Template = "aceite" | "servicio" | "libre";

interface Fields {
  workshop: string;
  phone: string;
  title: string;
  client: string;
  vehicle: string;
  plate: string;
  serviceDate: string;
  km: string;
  oil: string;
  nextDate: string;
  nextKm: string;
  notes: string;
  footer: string;
  freeText: string;
}

const STORAGE_KEY = "label-printer-v2";

function loadPrinter(): PrinterConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULT_PRINTER, ...JSON.parse(raw) };
  } catch {}
  return DEFAULT_PRINTER;
}

const kmText = (v: string) => {
  const n = Number(v.replace(/[^\d]/g, ""));
  return n ? `${n.toLocaleString("es-DO")} km` : "";
};
const dmy = (iso: string) => (iso ? formatDate(iso, "dd/MM/yyyy") : "");

function buildLines(t: Template, f: Fields): LabelLine[] {
  const T = (text: string, size: LineSize, bold = false, align: "center" | "left" = "center"): LabelLine => ({
    kind: "text",
    text,
    size,
    bold,
    align,
  });
  const rule: LabelLine = { kind: "rule" };

  if (t === "libre") {
    const rows = f.freeText.split("\n").filter((l) => l.trim());
    return [
      T(f.title, "lg", true),
      ...(f.title && rows.length ? [rule] : []),
      ...rows.map((r, i) => T(r, i === 0 && !f.title ? "lg" : "md", i === 0 && !f.title)),
    ];
  }

  if (t === "aceite") {
    const meta = [f.plate && `Placa ${f.plate}`, f.serviceDate && `Servicio ${dmy(f.serviceDate)}`].filter(Boolean).join(" · ");
    return [
      T(f.workshop, "md", true),
      T(f.phone, "xs"),
      rule,
      T(f.title || "PRÓXIMO CAMBIO", "sm", true),
      T(dmy(f.nextDate), "xl", true),
      T(f.nextKm ? `o a los ${kmText(f.nextKm)}` : "", "md", true),
      rule,
      T(f.oil ? `Aceite: ${f.oil}` : "", "sm"),
      T(meta, "xs"),
      T(f.footer, "xs"),
    ];
  }

  // Ticket de servicio (compacto: varios datos por renglón)
  const join = (...xs: (string | false)[]) => xs.filter(Boolean).join(" · ");
  const left = (text: string, size: LineSize = "sm", bold = false) => T(text, size, bold, "left");
  return [
    T(f.workshop, "lg", true),
    T(f.phone, "xs"),
    rule,
    T(f.title || "TICKET DE SERVICIO", "sm", true),
    left(f.client, "sm", true),
    left(join(f.vehicle, f.plate)),
    left(join(f.serviceDate && dmy(f.serviceDate), f.km && kmText(f.km))),
    left(f.oil ? `Aceite ${f.oil}` : ""),
    left(f.notes),
    rule,
    T(f.nextDate ? `Próximo cambio: ${dmy(f.nextDate)}` : "", "md", true),
    T(f.nextKm ? `o a los ${kmText(f.nextKm)}` : "", "sm"),
    T(f.footer, "xs"),
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
  const [template, setTemplate] = useState<Template>("aceite");
  const [agendaId, setAgendaId] = useState<string>(params.get("agenda") ?? "");
  const [printer, setPrinter] = useState<PrinterConfig>(DEFAULT_PRINTER);
  const [busy, setBusy] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [fields, setFields] = useState<Fields>({
    workshop: "",
    phone: "",
    title: "",
    client: "",
    vehicle: "",
    plate: "",
    serviceDate: todayISO(),
    km: "",
    oil: "",
    nextDate: "",
    nextKm: "",
    notes: "",
    footer: "¡Gracias por su preferencia!",
    freeText: "",
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

  // Datos del taller
  useEffect(() => {
    if (!settings) return;
    setFields((f) => ({
      ...f,
      workshop: f.workshop || settings.workshop_name,
      phone: f.phone || (settings.workshop_phone ? `Tel/WhatsApp ${settings.workshop_phone}` : ""),
    }));
  }, [settings]);

  // Agendas activas para elegir
  const options = useMemo(
    () =>
      appointments
        .filter((a) => a.id === agendaId || !["completado", "renovado"].includes(effectiveStatus(a)))
        .sort((a, b) => (a.client?.name ?? "").localeCompare(b.client?.name ?? "")),
    [appointments, agendaId],
  );

  // Rellenar desde la agenda seleccionada
  useEffect(() => {
    const a: Appointment | undefined = appointments.find((x) => x.id === agendaId);
    if (!a) return;
    const v = a.vehicle;
    setFields((f) => ({
      ...f,
      client: a.client?.name ?? "",
      vehicle: v ? [v.brand, v.model, v.year].filter(Boolean).join(" ") : "",
      plate: v?.plate ?? "",
      serviceDate: a.service_date,
      km: a.mileage ? String(a.mileage) : "",
      oil: a.oil_type ?? "",
      nextDate: a.next_due_date,
      nextKm: a.next_mileage ? String(a.next_mileage) : "",
      notes: a.notes ?? "",
    }));
  }, [agendaId, appointments]);

  const set = (k: keyof Fields) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setFields((f) => ({ ...f, [k]: e.target.value }));

  const qrData = useMemo(() => {
    const n = normalizePhone(settings?.workshop_phone);
    if (!printer.showQr || !n || template === "libre") return null;
    const msg = `Hola, quiero agendar mi cambio de aceite${fields.plate ? ` (placa ${fields.plate})` : ""}`;
    return `https://wa.me/${n}?text=${encodeURIComponent(msg)}`;
  }, [settings?.workshop_phone, printer.showQr, fields.plate, template]);

  const spec: LabelSpec = useMemo(
    () => ({ widthMm: printer.widthMm, heightMm: printer.heightMm, lines: buildLines(template, fields), qr: qrData }),
    [printer.widthMm, printer.heightMm, template, fields, qrData],
  );

  const previewHtml = useMemo(() => labelInnerHtml(layoutLabel(spec)), [spec]);
  const pxPerMm = 96 / 25.4;
  const scale = Math.min(340 / (spec.widthMm * pxPerMm), 440 / (spec.heightMm * pxPerMm), 3);

  const presetId = LABEL_PRESETS.find((p) => p.w === printer.widthMm && p.h === printer.heightMm)?.id ?? "custom";
  const fileBase = `etiqueta-${(fields.plate || fields.client || "taller").replace(/[^\w-]+/g, "_")}`;

  const printZebraDirect = async () => {
    setBusy("zebra");
    try {
      const found = await findZebraPrinter();
      if (!found) {
        toast.error("No se encontró Zebra Browser Print", {
          description: "Instala y abre Zebra Browser Print en esta computadora, o usa «Imprimir».",
          duration: 9000,
        });
        return;
      }
      await sendToZebra(found.host, found.device, buildZpl(spec, printer));
      toast.success(`Enviado a ${found.device.name}`);
    } catch (e) {
      toast.error("No se pudo imprimir en la Zebra", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <PageHeader title="Etiquetas" description="Crea stickers y tickets, e imprímelos en tu impresora Zebra o 2Connect." />

      <div className="grid gap-6 lg:grid-cols-[1fr_400px]">
        {/* -------- Contenido -------- */}
        <div className="space-y-6 min-w-0">
          <Card className="p-5">
            <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted">Tipo de etiqueta</p>
            <div className="grid gap-2 sm:grid-cols-3">
              {(
                [
                  ["aceite", "Sticker de aceite", "Para el parabrisas: próxima fecha y km.", Ticket],
                  ["servicio", "Ticket de servicio", "Detalle del servicio realizado.", FileText],
                  ["libre", "Texto libre", "Escribe lo que quieras.", Type],
                ] as const
              ).map(([id, label, desc, Icon]) => (
                <button
                  key={id}
                  onClick={() => setTemplate(id)}
                  className={cn(
                    "rounded-2xl border p-4 text-left transition cursor-pointer",
                    template === id ? "border-brand-500 bg-brand-500/[0.06] ring-4 ring-brand-500/10" : "border-line hover:border-brand-500/40",
                  )}
                >
                  <Icon className={cn("mb-2 size-5", template === id ? "text-brand-600 dark:text-brand-400" : "text-muted")} />
                  <p className="font-medium text-sm">{label}</p>
                  <p className="text-xs text-muted mt-0.5">{desc}</p>
                </button>
              ))}
            </div>
          </Card>

          <Card className="p-5 space-y-5">
            {template !== "libre" && (
              <Field label="Llenar desde una agenda" hint="Opcional: copia cliente, vehículo, aceite y fechas.">
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
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Nombre del taller">
                <Input value={fields.workshop} onChange={set("workshop")} />
              </Field>
              <Field label="Teléfono / línea 2">
                <Input value={fields.phone} onChange={set("phone")} placeholder="Tel/WhatsApp 809-000-0000" />
              </Field>
              <Field label="Título" className="sm:col-span-2" hint={template === "aceite" ? "Vacío = «PRÓXIMO CAMBIO»" : template === "servicio" ? "Vacío = «TICKET DE SERVICIO»" : undefined}>
                <Input value={fields.title} onChange={set("title")} />
              </Field>
            </div>

            {template === "libre" ? (
              <Field label="Texto (una línea por renglón)">
                <Textarea rows={6} value={fields.freeText} onChange={set("freeText")} placeholder={"Promoción del mes\nCambio de aceite + filtro\nRD$ 2,500"} />
              </Field>
            ) : (
              <>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <Field label="Próximo cambio">
                    <Input type="date" value={fields.nextDate} onChange={set("nextDate")} />
                  </Field>
                  <Field label="Próximo km">
                    <Input inputMode="numeric" value={fields.nextKm} onChange={set("nextKm")} placeholder="95000" />
                  </Field>
                  <Field label="Aceite">
                    <Input value={fields.oil} onChange={set("oil")} placeholder="5W-30 Sintético" />
                  </Field>
                  <Field label="Placa">
                    <Input value={fields.plate} onChange={set("plate")} className="uppercase" />
                  </Field>
                  <Field label="Fecha del servicio">
                    <Input type="date" value={fields.serviceDate} onChange={set("serviceDate")} />
                  </Field>
                  {template === "servicio" && (
                    <>
                      <Field label="Km actual">
                        <Input inputMode="numeric" value={fields.km} onChange={set("km")} />
                      </Field>
                      <Field label="Cliente">
                        <Input value={fields.client} onChange={set("client")} />
                      </Field>
                      <Field label="Vehículo" className="lg:col-span-2">
                        <Input value={fields.vehicle} onChange={set("vehicle")} />
                      </Field>
                    </>
                  )}
                </div>
                {template === "servicio" && (
                  <Field label="Notas">
                    <Input value={fields.notes} onChange={set("notes")} placeholder="Filtro de aceite cambiado…" />
                  </Field>
                )}
                <Field label="Mensaje final">
                  <Input value={fields.footer} onChange={set("footer")} />
                </Field>
              </>
            )}
          </Card>

          {/* Ayuda */}
          <Card>
            <button onClick={() => setShowHelp((s) => !s)} className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left cursor-pointer">
              <span className="font-semibold">¿Cómo configuro mi impresora?</span>
              <ChevronDown className={cn("size-4 text-muted transition", showHelp && "rotate-180")} />
            </button>
            {showHelp && (
              <div className="grid gap-5 border-t border-line p-5 text-sm sm:grid-cols-2">
                <div>
                  <p className="font-medium mb-2">Cualquier impresora (Zebra o 2Connect)</p>
                  <ol className="list-decimal pl-4 space-y-1.5 text-muted">
                    <li>Instala el driver de la impresora en la computadora (Windows o Mac).</li>
                    <li>En el driver, configura el tamaño de la etiqueta igual al de aquí (por ejemplo 50 × 50 mm).</li>
                    <li>
                      Pulsa <b className="text-fg">Imprimir</b>, elige la impresora, pon <b className="text-fg">Márgenes: ninguno</b> y escala <b className="text-fg">100%</b>.
                    </li>
                  </ol>
                </div>
                <div>
                  <p className="font-medium mb-2">Zebra directo (mejor calidad)</p>
                  <ol className="list-decimal pl-4 space-y-1.5 text-muted">
                    <li>
                      Instala{" "}
                      <a className="text-brand-600 underline" href="https://www.zebra.com/us/en/support-downloads/software/printer-software/browser-print.html" target="_blank" rel="noreferrer">
                        Zebra Browser Print
                      </a>{" "}
                      y déjalo abierto.
                    </li>
                    <li>Elige tu Zebra como impresora predeterminada en Browser Print.</li>
                    <li>
                      Pulsa <b className="text-fg">Zebra directo</b>. Si el navegador pide permiso para acceder a la red local, acéptalo. Funciona en Chrome o Edge.
                    </li>
                  </ol>
                  <p className="font-medium mt-4 mb-2">Archivos para otros programas</p>
                  <p className="text-muted">
                    <b className="text-fg">ZPL</b> sirve para Zebra y <b className="text-fg">TSPL (.prn)</b> para 2Connect, Xprinter y TSC, si usas un programa que envíe archivos directo a la impresora.
                  </p>
                </div>
              </div>
            )}
          </Card>
        </div>

        {/* -------- Vista previa e impresión -------- */}
        <div className="space-y-4 lg:sticky lg:top-6 h-fit">
          <Card className="p-5">
            <div className="mb-4 flex items-center justify-between">
              <p className="text-xs font-medium uppercase tracking-wide text-muted">Vista previa</p>
              <span className="text-xs text-muted tabular-nums">
                {spec.widthMm} × {spec.heightMm} mm
              </span>
            </div>
            <div className="grid place-items-center rounded-2xl bg-[repeating-linear-gradient(45deg,var(--surface-2),var(--surface-2)_8px,transparent_8px,transparent_16px)] p-6">
              <div style={{ width: spec.widthMm * pxPerMm * scale, height: spec.heightMm * pxPerMm * scale }}>
                <div
                  className="relative overflow-hidden rounded-[6px] bg-white text-black shadow-xl ring-1 ring-black/10"
                  style={{
                    width: `${spec.widthMm}mm`,
                    height: `${spec.heightMm}mm`,
                    transform: `scale(${scale})`,
                    transformOrigin: "top left",
                    fontFamily: "Arial, Helvetica, sans-serif",
                  }}
                  dangerouslySetInnerHTML={{ __html: previewHtml }}
                />
              </div>
            </div>
          </Card>

          <Card className="p-5 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Tamaño" className="col-span-2">
                <Select
                  value={presetId}
                  onChange={(e) => {
                    const p = LABEL_PRESETS.find((x) => x.id === e.target.value);
                    if (p) updatePrinter({ widthMm: p.w, heightMm: p.h });
                  }}
                >
                  {LABEL_PRESETS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                  <option value="custom">Personalizado…</option>
                </Select>
              </Field>
              <Field label="Ancho (mm)">
                <Input type="number" min={20} max={120} step={0.1} value={printer.widthMm} onChange={(e) => updatePrinter({ widthMm: Math.max(20, Math.min(120, Number(e.target.value) || 20)) })} />
              </Field>
              <Field label="Alto (mm)">
                <Input type="number" min={15} max={200} step={0.1} value={printer.heightMm} onChange={(e) => updatePrinter({ heightMm: Math.max(15, Math.min(200, Number(e.target.value) || 15)) })} />
              </Field>
              <Field label="Resolución">
                <Select value={printer.dpi} onChange={(e) => updatePrinter({ dpi: Number(e.target.value) as 203 | 300 })}>
                  <option value={203}>203 dpi</option>
                  <option value={300}>300 dpi</option>
                </Select>
              </Field>
              <Field label="Copias">
                <Input type="number" min={1} max={100} value={printer.copies} onChange={(e) => updatePrinter({ copies: Math.max(1, Math.min(100, Number(e.target.value) || 1)) })} />
              </Field>
            </div>

            {template !== "libre" && (
              <label className="flex items-start gap-2.5 text-sm cursor-pointer">
                <input type="checkbox" className="mt-0.5 accent-brand-500" checked={printer.showQr} onChange={(e) => updatePrinter({ showQr: e.target.checked })} />
                <span>
                  <span className="inline-flex items-center gap-1.5 font-medium">
                    <QrCode className="size-4" /> Código QR de WhatsApp
                  </span>
                  <span className="block text-xs text-muted">
                    {settings?.workshop_phone
                      ? "El cliente lo escanea para escribirle al taller."
                      : "Agrega el teléfono del taller en Configuración para activarlo."}
                  </span>
                </span>
              </label>
            )}

            <div className="space-y-2 pt-1">
              <Button size="lg" className="w-full" onClick={() => printLabelsInBrowser(spec, printer.copies)}>
                <Printer className="size-4" /> Imprimir
              </Button>
              <p className="text-center text-xs text-muted">Zebra o 2Connect con su driver instalado</p>
              <Button variant="secondary" className="w-full" loading={busy === "zebra"} onClick={printZebraDirect}>
                <Zap className="size-4" /> Zebra directo (Browser Print)
              </Button>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="ghost" size="sm" onClick={() => downloadFile(`${fileBase}.zpl`, buildZpl(spec, printer), "text/plain")}>
                  <Download className="size-3.5" /> ZPL (Zebra)
                </Button>
                <Button variant="ghost" size="sm" onClick={() => downloadFile(`${fileBase}.prn`, buildTspl(spec, printer))}>
                  <Download className="size-3.5" /> TSPL (2Connect)
                </Button>
              </div>
              <details className="text-xs text-muted">
                <summary className="cursor-pointer select-none">Opciones avanzadas</summary>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <Field label="Separación (mm)">
                    <Input type="number" min={0} max={10} step={0.5} value={printer.gapMm} onChange={(e) => updatePrinter({ gapMm: Math.max(0, Number(e.target.value) || 0) })} />
                  </Field>
                  <label className="flex items-end gap-2 pb-2 cursor-pointer">
                    <input type="checkbox" className="accent-brand-500" checked={printer.invertTspl} onChange={(e) => updatePrinter({ invertTspl: e.target.checked })} />
                    TSPL sale en negativo
                  </label>
                </div>
              </details>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
