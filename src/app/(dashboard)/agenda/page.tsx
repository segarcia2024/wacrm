"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useCan } from "@/hooks/use-can";
import {
  addDays,
  endOfDay,
  startOfWeekMonday,
} from "@/lib/appointments/helpers";
import type { Appointment, Profile } from "@/types";
import { AppointmentForm } from "@/components/appointments/appointment-form";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import { useTranslations } from "next-intl";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";

export default function AgendaPage() {
  const t = useTranslations("Appointments.agenda");
  const tForm = useTranslations("Appointments.form");
  const { accountId } = useAuth();
  const canEdit = useCan("send-messages");
  const supabase = createClient();

  const [weekStart, setWeekStart] = useState(() => startOfWeekMonday(new Date()));
  const [agentFilter, setAgentFilter] = useState<string>("all");
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Appointment | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  );

  const load = useCallback(async () => {
    if (!accountId) return;
    setLoading(true);
    const from = weekStart.toISOString();
    const to = endOfDay(addDays(weekStart, 6)).toISOString();

    let query = supabase
      .from("appointments")
      .select(
        "*, contact:contacts(id, name, phone), assignee:profiles!appointments_assigned_to_fkey(id, full_name, email), deal:deals(id, title)",
      )
      .eq("account_id", accountId)
      .gte("starts_at", from)
      .lte("starts_at", to)
      .neq("status", "cancelled")
      .order("starts_at", { ascending: true });

    if (agentFilter !== "all") {
      query = query.eq("assigned_to", agentFilter);
    }

    const [aRes, pRes] = await Promise.all([
      query,
      supabase.from("profiles").select("*").order("full_name"),
    ]);

    if (aRes.data) setAppointments(aRes.data as Appointment[]);
    else setAppointments([]);
    if (pRes.data) setProfiles(pRes.data as Profile[]);
    setLoading(false);
  }, [accountId, weekStart, agentFilter, supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  const byDay = useMemo(() => {
    const map = new Map<string, Appointment[]>();
    for (const day of weekDays) {
      map.set(format(day, "yyyy-MM-dd"), []);
    }
    for (const appt of appointments) {
      const key = format(new Date(appt.starts_at), "yyyy-MM-dd");
      const list = map.get(key);
      if (list) list.push(appt);
    }
    return map;
  }, [appointments, weekDays]);

  const weekLabel = `${format(weekStart, "d MMM", { locale: es })} – ${format(
    addDays(weekStart, 6),
    "d MMM yyyy",
    { locale: es },
  )}`;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t("title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={agentFilter}
            onChange={(e) => setAgentFilter(e.target.value)}
            className="h-9 rounded-lg border border-border bg-muted px-2.5 text-sm text-foreground outline-none focus:border-primary"
            aria-label={t("filterAgent")}
          >
            <option value="all">{t("allAgents")}</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name || p.email}
              </option>
            ))}
          </select>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-9 border-border"
              onClick={() => setWeekStart((d) => addDays(d, -7))}
              aria-label={t("prevWeek")}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-9 border-border px-3"
              onClick={() => setWeekStart(startOfWeekMonday(new Date()))}
            >
              {t("today")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-9 border-border"
              onClick={() => setWeekStart((d) => addDays(d, 7))}
              aria-label={t("nextWeek")}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <CalendarDays className="h-4 w-4" />
        <span className="font-medium text-foreground">{weekLabel}</span>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">{t("loading")}</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-7">
          {weekDays.map((day) => {
            const key = format(day, "yyyy-MM-dd");
            const items = byDay.get(key) ?? [];
            const isToday =
              format(day, "yyyy-MM-dd") === format(new Date(), "yyyy-MM-dd");
            return (
              <div
                key={key}
                className={cn(
                  "min-h-[180px] rounded-xl border border-border bg-card p-2",
                  isToday && "border-primary/50 ring-1 ring-primary/30",
                )}
              >
                <div className="mb-2 px-1">
                  <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    {format(day, "EEE", { locale: es })}
                  </p>
                  <p
                    className={cn(
                      "text-sm font-semibold",
                      isToday ? "text-primary" : "text-foreground",
                    )}
                  >
                    {format(day, "d")}
                  </p>
                </div>
                <div className="space-y-1.5">
                  {items.length === 0 ? (
                    <p className="px-1 text-[11px] text-muted-foreground">
                      {t("emptyDay")}
                    </p>
                  ) : (
                    items.map((appt) => {
                      const contactLabel =
                        appt.contact?.name ||
                        appt.contact?.phone ||
                        t("unknownContact");
                      return (
                        <button
                          key={appt.id}
                          type="button"
                          disabled={!canEdit}
                          onClick={() => {
                            if (!canEdit) return;
                            setEditing(appt);
                            setFormOpen(true);
                          }}
                          className={cn(
                            "w-full rounded-lg bg-muted px-2 py-1.5 text-left transition-colors",
                            canEdit && "hover:bg-muted/80",
                          )}
                        >
                          <p className="text-[11px] font-medium text-primary">
                            {format(new Date(appt.starts_at), "HH:mm")} ·{" "}
                            {tForm(`types.${appt.type}`)}
                          </p>
                          <p className="truncate text-xs font-medium text-foreground">
                            {contactLabel}
                          </p>
                          {appt.location && (
                            <p className="truncate text-[10px] text-muted-foreground">
                              {appt.location}
                            </p>
                          )}
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {editing && (
        <AppointmentForm
          open={formOpen}
          onOpenChange={(o) => {
            setFormOpen(o);
            if (!o) setEditing(null);
          }}
          contactId={editing.contact_id}
          conversationId={editing.conversation_id}
          appointment={editing}
          onSaved={load}
        />
      )}
    </div>
  );
}
