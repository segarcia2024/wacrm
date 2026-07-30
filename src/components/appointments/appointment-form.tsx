"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import {
  APPOINTMENT_TYPES,
  DEFAULT_DURATION_MINUTES,
} from "@/lib/appointments/helpers";
import type {
  Appointment,
  AppointmentStatus,
  AppointmentType,
  Deal,
  Profile,
} from "@/types";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

interface AppointmentFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contactId: string;
  conversationId?: string | null;
  appointment?: Appointment | null;
  onSaved: () => void;
}

function toLocalInputValue(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function AppointmentForm({
  open,
  onOpenChange,
  contactId,
  conversationId,
  appointment,
  onSaved,
}: AppointmentFormProps) {
  const t = useTranslations("Appointments.form");
  const supabase = createClient();
  const { accountId } = useAuth();

  const [type, setType] = useState<AppointmentType>("showroom");
  const [startsAt, setStartsAt] = useState("");
  const [duration, setDuration] = useState(String(DEFAULT_DURATION_MINUTES));
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [dealId, setDealId] = useState("");
  const [reminderEnabled, setReminderEnabled] = useState(true);
  const [status, setStatus] = useState<AppointmentStatus>("scheduled");

  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [saving, setSaving] = useState(false);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!open) return;
    if (appointment) {
      setType(appointment.type);
      setStartsAt(toLocalInputValue(appointment.starts_at));
      setDuration(String(appointment.duration_minutes));
      setLocation(appointment.location ?? "");
      setNotes(appointment.notes ?? "");
      setAssignedTo(appointment.assigned_to ?? "");
      setDealId(appointment.deal_id ?? "");
      setReminderEnabled(appointment.reminder_enabled);
      setStatus(appointment.status);
    } else {
      const def = new Date();
      def.setHours(def.getHours() + 1, 0, 0, 0);
      setType("showroom");
      setStartsAt(toLocalInputValue(def.toISOString()));
      setDuration(String(DEFAULT_DURATION_MINUTES));
      setLocation("");
      setNotes("");
      setAssignedTo("");
      setDealId("");
      setReminderEnabled(true);
      setStatus("scheduled");
    }
  }, [open, appointment]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      const [p, d] = await Promise.all([
        supabase.from("profiles").select("*").order("full_name"),
        supabase
          .from("deals")
          .select("id, title, status")
          .eq("contact_id", contactId)
          .eq("status", "open")
          .order("created_at", { ascending: false }),
      ]);
      if (cancelled) return;
      setProfiles((p.data ?? []) as Profile[]);
      setDeals((d.data ?? []) as Deal[]);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, contactId, supabase]);

  async function handleSave() {
    if (!startsAt) {
      toast.error(t("toastRequired"));
      return;
    }
    const startsIso = new Date(startsAt).toISOString();
    if (Number.isNaN(new Date(startsIso).getTime())) {
      toast.error(t("toastInvalidDate"));
      return;
    }
    const durationMinutes = Math.max(
      15,
      Math.min(24 * 60, Number.parseInt(duration, 10) || DEFAULT_DURATION_MINUTES),
    );

    setSaving(true);

    const payload = {
      type,
      starts_at: startsIso,
      duration_minutes: durationMinutes,
      location: location.trim() || null,
      notes: notes.trim() || null,
      assigned_to: assignedTo || null,
      deal_id: dealId || null,
      reminder_enabled: reminderEnabled,
      status,
      updated_at: new Date().toISOString(),
    };

    if (appointment) {
      const { error } = await supabase
        .from("appointments")
        .update(payload)
        .eq("id", appointment.id);
      setSaving(false);
      if (error) {
        toast.error(t("toastFailedSave"));
        return;
      }
      toast.success(t("toastUpdated"));
    } else {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) {
        toast.error(t("toastNotSignedIn"));
        setSaving(false);
        return;
      }
      if (!accountId) {
        toast.error(t("toastNotLinked"));
        setSaving(false);
        return;
      }
      const { error } = await supabase.from("appointments").insert({
        ...payload,
        contact_id: contactId,
        conversation_id: conversationId || null,
        user_id: user.id,
        account_id: accountId,
        status: "scheduled",
      });
      setSaving(false);
      if (error) {
        toast.error(t("toastFailedCreate"));
        return;
      }
      toast.success(t("toastCreated"));
    }

    onOpenChange(false);
    onSaved();
  }

  async function handleCancelAppointment() {
    if (!appointment) return;
    setSaving(true);
    const { error } = await supabase
      .from("appointments")
      .update({
        status: "cancelled",
        updated_at: new Date().toISOString(),
      })
      .eq("id", appointment.id);
    setSaving(false);
    if (error) {
      toast.error(t("toastFailedSave"));
      return;
    }
    toast.success(t("toastCancelled"));
    onOpenChange(false);
    onSaved();
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full border-border bg-popover p-0 text-popover-foreground sm:max-w-md"
      >
        <div className="flex h-full flex-col">
          <SheetHeader className="border-b border-border/50 p-4">
            <SheetTitle className="text-popover-foreground">
              {appointment ? t("editTitle") : t("newTitle")}
            </SheetTitle>
          </SheetHeader>

          <div className="flex-1 space-y-4 overflow-y-auto p-4">
            <div className="grid gap-2">
              <Label className="text-muted-foreground">{t("type")}</Label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as AppointmentType)}
                className="h-9 w-full rounded-lg border border-border bg-muted px-2.5 text-sm text-foreground outline-none focus:border-primary"
              >
                {APPOINTMENT_TYPES.map((key) => (
                  <option key={key} value={key}>
                    {t(`types.${key}`)}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-2">
              <Label className="text-muted-foreground">{t("startsAt")}</Label>
              <Input
                type="datetime-local"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
                className="border-border bg-muted text-foreground"
              />
            </div>

            <div className="grid gap-2">
              <Label className="text-muted-foreground">{t("duration")}</Label>
              <Input
                type="number"
                min={15}
                max={1440}
                step={15}
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                className="border-border bg-muted text-foreground"
              />
              <p className="text-xs text-muted-foreground">{t("durationHint")}</p>
            </div>

            <div className="grid gap-2">
              <Label className="text-muted-foreground">{t("location")}</Label>
              <Input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder={t("locationPlaceholder")}
                className="border-border bg-muted text-foreground"
              />
            </div>

            <div className="grid gap-2">
              <Label className="text-muted-foreground">{t("assignedTo")}</Label>
              <select
                value={assignedTo}
                onChange={(e) => setAssignedTo(e.target.value)}
                className="h-9 w-full rounded-lg border border-border bg-muted px-2.5 text-sm text-foreground outline-none focus:border-primary"
              >
                <option value="">{t("unassigned")}</option>
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name || p.email}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-2">
              <Label className="text-muted-foreground">{t("deal")}</Label>
              <select
                value={dealId}
                onChange={(e) => setDealId(e.target.value)}
                className="h-9 w-full rounded-lg border border-border bg-muted px-2.5 text-sm text-foreground outline-none focus:border-primary"
              >
                <option value="">{t("noDeal")}</option>
                {deals.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.title}
                  </option>
                ))}
              </select>
            </div>

            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={reminderEnabled}
                onChange={(e) => setReminderEnabled(e.target.checked)}
                className="rounded border-border"
              />
              {t("reminderEnabled")}
            </label>

            {appointment && (
              <div className="grid gap-2">
                <Label className="text-muted-foreground">{t("status")}</Label>
                <select
                  value={status}
                  onChange={(e) =>
                    setStatus(e.target.value as AppointmentStatus)
                  }
                  className="h-9 w-full rounded-lg border border-border bg-muted px-2.5 text-sm text-foreground outline-none focus:border-primary"
                >
                  {(
                    [
                      "scheduled",
                      "completed",
                      "cancelled",
                      "no_show",
                    ] as AppointmentStatus[]
                  ).map((s) => (
                    <option key={s} value={s}>
                      {t(`statuses.${s}`)}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="grid gap-2">
              <Label className="text-muted-foreground">{t("notes")}</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={t("notesPlaceholder")}
                className="min-h-[80px] border-border bg-muted text-foreground"
              />
            </div>
          </div>

          <div className="space-y-2 border-t border-border/50 bg-popover/80 p-4">
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                className="flex-1 border-border bg-transparent text-muted-foreground hover:bg-muted"
              >
                {t("cancel")}
              </Button>
              <Button
                onClick={handleSave}
                disabled={saving || !startsAt}
                className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : appointment ? (
                  t("save")
                ) : (
                  t("create")
                )}
              </Button>
            </div>
            {appointment && appointment.status === "scheduled" && (
              <button
                type="button"
                onClick={handleCancelAppointment}
                disabled={saving}
                className="w-full text-xs text-red-400 hover:text-red-300"
              >
                {t("cancelAppointment")}
              </button>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
