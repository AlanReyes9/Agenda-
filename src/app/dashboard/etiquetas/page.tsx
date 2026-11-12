"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  AlignCenter,
  AlignLeft,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Bold,
  ChevronDown,
  Download,
  Minus,
  Plus,
  Printer,
  RotateCcw,
  Save,
  Space,
  Trash2,
  Zap,
} from "lucide-react";
import { api } from "@/lib/fetcher";
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
  type LabelSpec,
  type LineSize,
  type PrinterConfig,
} from "@/lib/labels";
import {
  defaultDesign,
  DESIGN_VARIABLES,
  newRowId,
  renderDesign,
  SIZE_OPTIONS,
  type DesignRow,
  type DesignValues,
  type LabelDesign,
} from "@/lib/label-design";
import type { Appointment, AppUser } from "@/lib/types";
import { cn, vehicleLabel } from "@/lib/utils";
import { Button, Card, Field, Input, PageHeader, Select, Skeleton } from "@/components/ui";

interface Fields {
  client: string;
  vehicle: string;
  plate: string;
  serviceDate: string;
  nextDate: string;
  mileage: string;
  nextMileage: string;
  oil: string;
  notes: string;
}

const STORAGE_KEY = "label-printer-v4";

function loadPrinter(): PrinterConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULT_PRINTER, ...JSON.parse(raw) };
  } catch {}
  return DEFAULT_PRINTER;
}

const digits = (v: string) => v.replace(/[^\d]/g, "");
const miles = (v: string) => (digits(v) ? Number(digits(v)).toLocaleString("en-US") : "");

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
  const { data: settings, setData: setSettings } = useSettings();
  const [me, setMe] = useState<AppUser | null>(null);
  const [tab, setTab] = useState<"datos" | "diseno">("datos");
  const [agendaId, setAgendaId] = useState<string>(params.get("agenda") ?? "");
  const [printer, setPrinter] = useState<PrinterConfig>(DEFAULT_PRINTER);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [design, setDesign] = useState<LabelDesign>(defaultDesign);
  const [savedJson, setSavedJson] = useState<string>("");
  const [fields, setFields] = useState<Fields>({
    client: "",
    vehicle: "",
    plate: "",
    serviceDate: todayISO(),
    nextDate: "",
    mileage: "",
    nextMileage: "",
    oil: "",
    notes: "",
  });

  useEffect(() => {
    setPrinter(loadPrinter());
    api<{ user: AppUser }>("/api/me").then((r) => setMe(r.user)).catch(() => null);
  }, []);
  const isAdmin = me?.role === "admin";

  // Diseño guardado en Configuración
  const designLoaded = useRef(false);
  useEffect(() => {
    if (!settings || designLoaded.current) return;
    designLoaded.current = true;
    const d = settings.label_design ?? defaultDesign();
    setDesign(d);
    setSavedJson(JSON.stringify(d));
  }, [settings]);
  const dirty = savedJson !== "" && JSON.stringify(design) !== savedJson;

  const updatePrinter = (p: Partial<PrinterConfig>) =>
    setPrinter((cur) => {
      const next = { ...cur, ...p };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });

  const options = useMemo(
    () =>
      appointments
        .filter((a) => a.id === agendaId || !["completado", "renovado"].includes(effectiveStatus(a)))
        .sort((a, b) => (a.client?.name ?? "").localeCompare(b.client?.name ?? "")),
    [appointments, agendaId],
  );

  useEffect(() => {
    const a: Appointment | undefined = appointments.find((x) => x.id === agendaId);
    if (!a) return;
    const v = a.vehicle;
    setFields({
      client: a.client?.name ?? "",
      vehicle: v ? [v.brand, v.model, v.year].filter(Boolean).join(" ") : "",
      plate: v?.plate ?? "",
      serviceDate: a.service_date,
      nextDate: a.next_due_date,
      mileage: a.mileage ? String(a.mileage) : "",
      nextMileage: a.next_mileage ? String(a.next_mileage) : "",
      oil: a.oil_type ?? "",
      notes: a.notes ?? "",
    });
  }, [agendaId, appointments]);

  const set = (k: keyof Fields) => (e: React.ChangeEvent<HTMLInputElement>) => setFields((f) => ({ ...f, [k]: e.target.value }));

  const values: DesignValues = useMemo(
    () => ({
      taller: settings?.workshop_name ?? "",
      direccion: settings?.workshop_address ?? "",
      telefono: formatPhone(settings?.workshop_phone),
      cliente: fields.client,
      vehiculo: fields.vehicle,
      placa: fields.plate.toUpperCase(),
      fecha: fields.serviceDate ? formatDate(fields.serviceDate, "dd/MM/yyyy") : "",
      fecha_corta: fields.serviceDate ? formatDate(fields.serviceDate, "d-M-yy") : "",
      proximo: fields.nextDate ? formatDate(fields.nextDate, "dd/MM/yyyy") : "",
      proximo_corto: fields.nextDate ? formatDate(fields.nextDate, "d-M-yy") : "",
      millaje: miles(fields.mileage),
      proximo_millaje: miles(fields.nextMileage),
      aceite: fields.oil,
      notas: fields.notes,
    }),
    [settings, fields],
  );

  const spec: LabelSpec = useMemo(
    () => ({ widthMm: design.widthMm, heightMm: design.heightMm, lines: renderDesign(design, values) }),
    [design, values],
  );
  const previewHtml = useMemo(() => labelInnerHtml(layoutLabel(spec)), [spec]);
  const printCfg = { ...printer, widthMm: design.widthMm, heightMm: design.heightMm };

  // Escala de la vista previa según el ancho disponible
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
  const fileBase = `etiqueta-${(fields.plate || fields.client || "taller").replace(/[^\w-]+/g, "_")}`;

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
      const data = printer.zebraLang === "zpl" ? buildZpl(spec, printCfg) : buildEpl(spec, printCfg);
      await sendToZebra(found.host, found.device, data);
      toast.success(`Enviado a ${found.device.name}`);
    } catch (e) {
      toast.error("No se pudo imprimir en la Zebra", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };

  const saveDesign = async () => {
    setSaving(true);
    try {
      const r = await api<{ settings: typeof settings }>("/api/settings", { method: "PATCH", json: { label_design: design } });
      setSettings(r.settings);
      const saved = r.settings?.label_design ?? design;
      setDesign(saved);
      setSavedJson(JSON.stringify(saved));
      toast.success("Diseño guardado para todas las computadoras");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  const mileagePlus = (n: number) => setFields((f) => ({ ...f, nextMileage: String(Number(digits(f.mileage)) + n) }));

  return (
    <>
      <PageHeader
        title="Etiquetas"
        description={`${(design.widthMm / 25.4).toFixed(1)}″ × ${(design.heightMm / 25.4).toFixed(1)}″ · Zebra LP 2844`}
      />

      <div className="grid gap-6 xl:grid-cols-[1fr_minmax(0,600px)]">
        {/* -------- Izquierda: datos / diseño -------- */}
        <div className="space-y-4 min-w-0">
          <div className="inline-flex rounded-xl bg-surface-2 p-1 text-sm">
            {(
              [
                ["datos", "Datos"],
                ["diseno", "Editar diseño"],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                onClick={() => setTab(k)}
                className={cn("rounded-lg px-4 py-1.5 font-medium transition cursor-pointer", tab === k ? "bg-surface shadow-sm" : "text-muted hover:text-fg")}
              >
                {label}
                {k === "diseno" && dirty && <span className="ml-1.5 inline-block size-1.5 rounded-full bg-brand-500 align-middle" />}
              </button>
            ))}
          </div>

          {tab === "datos" ? (
            <Card className="p-5 space-y-5">
              <Field label="Llenar desde una agenda" hint="Copia cliente, vehículo, fechas, millaje y aceite.">
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
                <Field label="Cliente">
                  <Input value={fields.client} onChange={set("client")} />
                </Field>
                <Field label="Vehículo">
                  <Input value={fields.vehicle} onChange={set("vehicle")} />
                </Field>
                <Field label="Placa">
                  <Input value={fields.plate} onChange={set("plate")} className="uppercase" />
                </Field>
                <Field label="Aceite">
                  <Input value={fields.oil} onChange={set("oil")} placeholder="CEPSA 5W-20" />
                </Field>
                <Field label="Fecha del servicio">
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
                <Field label="Notas" className="sm:col-span-2">
                  <Input value={fields.notes} onChange={set("notes")} placeholder="Filtro cambiado…" />
                </Field>
              </div>
            </Card>
          ) : (
            <DesignEditor
              design={design}
              onChange={setDesign}
              dirty={dirty}
              canSave={isAdmin}
              saving={saving}
              onSave={saveDesign}
              onDiscard={() => setDesign(settings?.label_design ?? defaultDesign())}
            />
          )}
        </div>

        {/* -------- Derecha: vista previa e impresión -------- */}
        <div className="space-y-4 min-w-0 xl:sticky xl:top-6 h-fit">
          <Card className="p-5">
            <div className="mb-4 flex items-center justify-between">
              <p className="text-xs font-medium uppercase tracking-wide text-muted">Vista previa</p>
              <span className="text-xs text-muted tabular-nums">
                {design.widthMm} × {design.heightMm} mm
              </span>
            </div>
            <div className="overflow-hidden rounded-2xl bg-[repeating-linear-gradient(45deg,var(--surface-2),var(--surface-2)_8px,transparent_8px,transparent_16px)] p-4 sm:p-6">
              <div ref={previewBox} className="w-full" />
              <div className="mx-auto" style={{ width: spec.widthMm * pxPerMm * scale, height: spec.heightMm * pxPerMm * scale }}>
                <div
                  className="relative overflow-hidden rounded-[10px] bg-white text-black shadow-xl ring-1 ring-black/10 origin-top-left"
                  style={{ width: `${spec.widthMm}mm`, height: `${spec.heightMm}mm`, transform: `scale(${scale})`, fontFamily: LABEL_FONT }}
                  dangerouslySetInnerHTML={{ __html: previewHtml }}
                />
              </div>
            </div>
          </Card>

          <Card className="p-5 space-y-3">
            <div className="flex items-end gap-3">
              <Field label="Copias" className="w-28">
                <Input type="number" min={1} max={100} value={printer.copies} onChange={(e) => updatePrinter({ copies: Math.max(1, Math.min(100, Number(e.target.value) || 1)) })} />
              </Field>
              <Button size="lg" className="flex-1" onClick={() => printLabelsInBrowser(spec, printCfg)}>
                <Printer className="size-4" /> Imprimir
              </Button>
            </div>
            <p className="text-xs text-muted">
              En la ventana de impresión: impresora <b className="text-fg">ZDesigner LP 2844</b>, tamaño de papel <b className="text-fg">2.50 × 1.40 in</b>, márgenes <b className="text-fg">Ninguno</b> y escala <b className="text-fg">100%</b>.
            </p>

            <Calibration printer={printer} onChange={updatePrinter} />

            <button onClick={() => setShowAdvanced((s) => !s)} className="flex w-full items-center justify-between pt-2 text-sm font-medium text-muted hover:text-fg cursor-pointer">
              Opciones avanzadas
              <ChevronDown className={cn("size-4 transition", showAdvanced && "rotate-180")} />
            </button>
            {showAdvanced && (
              <div className="space-y-4 border-t border-line pt-4">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Separación (mm)">
                    <Input type="number" min={0} max={10} step={0.5} value={printer.gapMm} onChange={(e) => updatePrinter({ gapMm: Math.max(0, Number(e.target.value) || 0) })} />
                  </Field>
                  <Field label="Lenguaje Zebra">
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
                <div className="rounded-lg bg-surface-2/60 p-3 text-xs text-muted space-y-2">
                  <p>
                    <b className="text-fg">Zebra directo</b> solo funciona si la impresora está conectada por USB a esta computadora y tiene abierto Zebra Browser Print. Con la impresora compartida en red usa «Imprimir».
                  </p>
                  <Button variant="secondary" size="sm" loading={busy} onClick={printZebraDirect}>
                    <Zap className="size-3.5" /> Zebra directo (USB)
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="ghost" size="sm" onClick={() => downloadFile(`${fileBase}.epl`, buildEpl(spec, printCfg))}>
                    <Download className="size-3.5" /> EPL
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => downloadFile(`${fileBase}.zpl`, buildZpl(spec, printCfg), "text/plain")}>
                    <Download className="size-3.5" /> ZPL
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => downloadFile(`${fileBase}.prn`, buildTspl(spec, printCfg))}>
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

/* ------------------------------------------------------------------ */
/* Editor de diseño                                                    */
/* ------------------------------------------------------------------ */

function DesignEditor({
  design,
  onChange,
  dirty,
  canSave,
  saving,
  onSave,
  onDiscard,
}: {
  design: LabelDesign;
  onChange: (d: LabelDesign) => void;
  dirty: boolean;
  canSave: boolean;
  saving: boolean;
  onSave: () => void;
  onDiscard: () => void;
}) {
  const inputs = useRef(new Map<string, HTMLInputElement>());
  const [focused, setFocused] = useState<string | null>(null);

  const rows = design.rows;
  const setRows = (r: DesignRow[]) => onChange({ ...design, rows: r });
  const patch = (id: string, p: Partial<DesignRow>) => setRows(rows.map((r) => (r.id === id ? { ...r, ...p } : r)));
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= rows.length) return;
    const next = [...rows];
    [next[i], next[j]] = [next[j], next[i]];
    setRows(next);
  };
  const add = (kind: DesignRow["kind"]) => {
    const row: DesignRow = { id: newRowId(), kind, text: kind === "text" ? "Texto nuevo" : "", size: kind === "space" ? "md" : "sm", bold: false, align: "center" };
    setRows([...rows, row]);
    if (kind === "text") setTimeout(() => inputs.current.get(row.id)?.select(), 50);
  };

  const insertVariable = (key: string) => {
    const token = `{${key}}`;
    const id = focused && rows.find((r) => r.id === focused && r.kind === "text") ? focused : null;
    if (!id) {
      const row: DesignRow = { id: newRowId(), kind: "text", text: token, size: "sm", bold: false, align: "left" };
      setRows([...rows, row]);
      return;
    }
    const el = inputs.current.get(id);
    const r = rows.find((x) => x.id === id)!;
    const start = el?.selectionStart ?? r.text.length;
    const end = el?.selectionEnd ?? r.text.length;
    patch(id, { text: r.text.slice(0, start) + token + r.text.slice(end) });
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + token.length, start + token.length);
    });
  };

  return (
    <Card className="p-5 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted">Sticker formato Zebra · edita los renglones como quieras.</p>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            if (window.confirm("¿Volver al sticker formato Zebra original? Se perderán los cambios del diseño.")) onChange(defaultDesign());
          }}
        >
          <RotateCcw className="size-3.5" /> Diseño original
        </Button>
      </div>

      <label className="flex items-center gap-2 text-sm cursor-pointer">
        <input type="checkbox" className="accent-brand-500" checked={Boolean(design.uppercase)} onChange={(e) => onChange({ ...design, uppercase: e.target.checked })} />
        Todo en MAYÚSCULAS
      </label>

      <div className="grid grid-cols-2 gap-3 sm:max-w-sm">
        <Field label="Ancho (mm)" hint={`${(design.widthMm / 25.4).toFixed(2)}″`}>
          <Input type="number" min={30} max={120} step={0.1} value={design.widthMm} onChange={(e) => onChange({ ...design, widthMm: Math.max(30, Math.min(120, Number(e.target.value) || 30)) })} />
        </Field>
        <Field label="Alto (mm)" hint={`${(design.heightMm / 25.4).toFixed(2)}″`}>
          <Input type="number" min={15} max={100} step={0.1} value={design.heightMm} onChange={(e) => onChange({ ...design, heightMm: Math.max(15, Math.min(100, Number(e.target.value) || 15)) })} />
        </Field>
      </div>

      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Datos automáticos · toca uno para insertarlo</p>
        <div className="flex flex-wrap gap-1.5">
          {DESIGN_VARIABLES.map((v) => (
            <button
              key={v.key}
              type="button"
              title={v.label}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => insertVariable(v.key)}
              className="rounded-lg border border-line bg-surface-2 px-2 py-1 font-mono text-xs text-muted hover:text-fg hover:border-brand-500/50 transition cursor-pointer"
            >
              {`{${v.key}}`}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted">
          Si un dato está vacío, se oculta su parte (separada por « · ») o el renglón completo.
        </p>
      </div>

      <ul className="space-y-2">
        {rows.map((r, i) => (
          <li
            key={r.id}
            className={cn(
              "flex flex-wrap items-center gap-2 rounded-xl border bg-surface p-2 transition",
              focused === r.id ? "border-brand-500/60 ring-4 ring-brand-500/10" : "border-line",
            )}
          >
            <span className="w-5 text-center text-xs tabular-nums text-muted">{i + 1}</span>
            {r.kind === "text" ? (
              <input
                ref={(el) => {
                  if (el) inputs.current.set(r.id, el);
                  else inputs.current.delete(r.id);
                }}
                value={r.text}
                onFocus={() => setFocused(r.id)}
                onChange={(e) => patch(r.id, { text: e.target.value })}
                className={cn(
                  "h-9 min-w-0 flex-1 basis-48 rounded-lg border border-line bg-surface-2/50 px-3 text-sm outline-none focus:border-brand-500",
                  r.bold && "font-semibold",
                  r.align === "center" && "text-center",
                )}
              />
            ) : (
              <div className="flex h-9 flex-1 basis-48 items-center gap-2 rounded-lg border border-dashed border-line px-3 text-sm text-muted">
                {r.kind === "rule" ? (
                  <>
                    <Minus className="size-4" /> Línea separadora
                  </>
                ) : (
                  <>
                    <Space className="size-4" /> Espacio
                  </>
                )}
              </div>
            )}

            <div className="flex items-center gap-1">
              {r.kind !== "rule" && (
                <select
                  value={r.size}
                  onChange={(e) => patch(r.id, { size: e.target.value as LineSize })}
                  className="h-9 rounded-lg border border-line bg-surface px-2 text-xs outline-none focus:border-brand-500 cursor-pointer"
                  title="Tamaño"
                >
                  {SIZE_OPTIONS.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              )}
              {r.kind === "text" && (
                <>
                  <IconToggle active={r.bold} onClick={() => patch(r.id, { bold: !r.bold })} title="Negrita">
                    <Bold className="size-4" />
                  </IconToggle>
                  <IconToggle active={false} onClick={() => patch(r.id, { align: r.align === "center" ? "left" : "center" })} title={r.align === "center" ? "Centrado (cambiar a izquierda)" : "Izquierda (cambiar a centrado)"}>
                    {r.align === "center" ? <AlignCenter className="size-4" /> : <AlignLeft className="size-4" />}
                  </IconToggle>
                </>
              )}
              <IconToggle active={false} onClick={() => move(i, -1)} title="Subir" disabled={i === 0}>
                <ArrowUp className="size-4" />
              </IconToggle>
              <IconToggle active={false} onClick={() => move(i, 1)} title="Bajar" disabled={i === rows.length - 1}>
                <ArrowDown className="size-4" />
              </IconToggle>
              <IconToggle active={false} onClick={() => setRows(rows.filter((x) => x.id !== r.id))} title="Eliminar" danger>
                <Trash2 className="size-4" />
              </IconToggle>
            </div>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" onClick={() => add("text")}>
          <Plus className="size-3.5" /> Texto
        </Button>
        <Button size="sm" variant="secondary" onClick={() => add("rule")}>
          <Minus className="size-3.5" /> Línea separadora
        </Button>
        <Button size="sm" variant="secondary" onClick={() => add("space")}>
          <Space className="size-3.5" /> Espacio
        </Button>
      </div>

      <div className="flex flex-col-reverse gap-2 border-t border-line pt-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted">
          {canSave
            ? dirty
              ? "Tienes cambios sin guardar. Puedes imprimir igual sin guardarlos."
              : "El diseño guardado se usa en todas las computadoras."
            : "Solo un administrador puede guardar el diseño; tus cambios sirven para esta impresión."}
        </p>
        {canSave && (
          <div className="flex gap-2">
            {dirty && (
              <Button variant="ghost" onClick={onDiscard}>
                <RotateCcw className="size-4" /> Descartar
              </Button>
            )}
            <Button onClick={onSave} loading={saving} disabled={!dirty}>
              <Save className="size-4" /> Guardar diseño
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}

function IconToggle({
  active,
  onClick,
  title,
  disabled,
  danger,
  children,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  disabled?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "grid size-9 place-items-center rounded-lg transition cursor-pointer disabled:opacity-30 disabled:cursor-default",
        active ? "bg-brand-500 text-white" : danger ? "text-muted hover:bg-red-500/10 hover:text-red-600" : "text-muted hover:bg-surface-2 hover:text-fg",
      )}
    >
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Calibración de posición (se guarda en esta computadora)              */
/* ------------------------------------------------------------------ */

function Calibration({ printer, onChange }: { printer: PrinterConfig; onChange: (p: Partial<PrinterConfig>) => void }) {
  const [open, setOpen] = useState(false);
  const round = (n: number) => Math.round(n * 10) / 10;
  const changed = printer.offsetXmm !== 0 || printer.offsetYmm !== 0 || printer.scalePct !== 100;
  const Step = ({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) => (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className="grid size-9 place-items-center rounded-lg border border-line bg-surface text-muted hover:text-fg hover:border-brand-500/50 transition cursor-pointer"
    >
      {children}
    </button>
  );
  return (
    <div className="rounded-xl border border-line">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium cursor-pointer">
        <span>
          Ajustar posición
          {changed && (
            <span className="ml-2 text-xs font-normal text-muted">
              ({printer.offsetXmm > 0 ? "+" : ""}
              {printer.offsetXmm} / {printer.offsetYmm > 0 ? "+" : ""}
              {printer.offsetYmm} mm · {printer.scalePct}%)
            </span>
          )}
        </span>
        <ChevronDown className={cn("size-4 text-muted transition", open && "rotate-180")} />
      </button>
      {open && (
        <div className="space-y-4 border-t border-line p-4">
          <p className="text-xs text-muted">
            Si la etiqueta sale cortada o corrida, muévela aquí y vuelve a imprimir. Activa el <b className="text-fg">borde de prueba</b>: cuando el borde coincida con el contorno del sticker, está calibrada.
          </p>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted">Horizontal</p>
              <div className="flex items-center gap-1.5">
                <Step label="Mover a la izquierda" onClick={() => onChange({ offsetXmm: round(printer.offsetXmm - 0.5) })}>
                  <ArrowLeft className="size-4" />
                </Step>
                <span className="w-16 text-center text-sm tabular-nums">{printer.offsetXmm} mm</span>
                <Step label="Mover a la derecha" onClick={() => onChange({ offsetXmm: round(printer.offsetXmm + 0.5) })}>
                  <ArrowRight className="size-4" />
                </Step>
              </div>
            </div>
            <div>
              <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted">Vertical</p>
              <div className="flex items-center gap-1.5">
                <Step label="Mover hacia arriba" onClick={() => onChange({ offsetYmm: round(printer.offsetYmm - 0.5) })}>
                  <ArrowUp className="size-4" />
                </Step>
                <span className="w-16 text-center text-sm tabular-nums">{printer.offsetYmm} mm</span>
                <Step label="Mover hacia abajo" onClick={() => onChange({ offsetYmm: round(printer.offsetYmm + 0.5) })}>
                  <ArrowDown className="size-4" />
                </Step>
              </div>
            </div>
            <div>
              <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted">Tamaño</p>
              <div className="flex items-center gap-1.5">
                <Step label="Más pequeño" onClick={() => onChange({ scalePct: Math.max(50, printer.scalePct - 2) })}>
                  <Minus className="size-4" />
                </Step>
                <span className="w-16 text-center text-sm tabular-nums">{printer.scalePct}%</span>
                <Step label="Más grande" onClick={() => onChange({ scalePct: Math.min(150, printer.scalePct + 2) })}>
                  <Plus className="size-4" />
                </Step>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" className="accent-brand-500" checked={printer.testBorder} onChange={(e) => onChange({ testBorder: e.target.checked })} />
              Imprimir borde de prueba
            </label>
            {changed && (
              <Button size="sm" variant="ghost" onClick={() => onChange({ offsetXmm: 0, offsetYmm: 0, scalePct: 100 })}>
                <RotateCcw className="size-3.5" /> Restablecer
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
