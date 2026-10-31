"use client";

import { toast } from "sonner";
import { MessageCircle } from "lucide-react";
import { buildAppointmentMessage, buildWhatsAppLink } from "@/lib/whatsapp";
import type { Appointment, Settings } from "@/lib/types";
import { Button } from "./ui";

export function WhatsAppButton({
  appointment,
  settings,
  compact,
}: {
  appointment: Appointment;
  settings: Settings | null;
  compact?: boolean;
}) {
  const open = () => {
    const msg = buildAppointmentMessage(
      settings?.whatsapp_template ?? "Hola {cliente}, su próximo cambio de aceite es el {fecha}.",
      appointment,
      settings?.workshop_name ?? "Auto Soluciones Daniel",
    );
    const link = buildWhatsAppLink(appointment.client?.phone, msg);
    if (!link) {
      toast.error("Este cliente no tiene un teléfono válido", { description: "Edita el cliente y agrega su número." });
      return;
    }
    window.open(link, "_blank", "noopener,noreferrer");
  };
  return compact ? (
    <Button variant="whatsapp" size="icon" onClick={open} title="Enviar recordatorio por WhatsApp" aria-label="WhatsApp">
      <MessageCircle className="size-4" />
    </Button>
  ) : (
    <Button variant="whatsapp" size="sm" onClick={open}>
      <MessageCircle className="size-3.5" /> WhatsApp
    </Button>
  );
}
