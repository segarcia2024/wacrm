"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import {
  DEFAULT_CURRENCY,
  parseDealValue,
  sanitizeDealValueInput,
} from "@/lib/currency";
import { titleFromVehicle } from "@/lib/vehicles/deal-vehicle";
import type { Deal, DealStatus, Pipeline, PipelineStage, Vehicle } from "@/types";
import { VehiclePicker } from "@/components/inventory/vehicle-picker";
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
import { Banknote, Check, Loader2, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

export type InboxDealSavedEvent =
  | { type: "saved" }
  | { type: "deleted"; dealId: string }
  | {
      type: "status";
      dealId: string;
      status: DealStatus;
      conversationClosed?: boolean;
    };

interface InboxDealFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contactId: string;
  conversationId?: string | null;
  /** When set, form updates this deal instead of creating a new one. */
  deal?: Deal | null;
  onSaved: (event?: InboxDealSavedEvent) => void;
}

export function InboxDealForm({
  open,
  onOpenChange,
  contactId,
  conversationId,
  deal = null,
  onSaved,
}: InboxDealFormProps) {
  const t = useTranslations("Inbox.sidebar");
  const supabase = createClient();
  const { accountId } = useAuth();
  const isEdit = !!deal;

  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [value, setValue] = useState("");
  const [notes, setNotes] = useState("");
  const [source, setSource] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [budget, setBudget] = useState("");
  const [purchaseTimeline, setPurchaseTimeline] = useState("");
  const [tradeIn, setTradeIn] = useState(false);
  const [nextAction, setNextAction] = useState("");
  const [nextActionAt, setNextActionAt] = useState("");
  const [lossReason, setLossReason] = useState("");
  const [observations, setObservations] = useState("");
  const [pipelineId, setPipelineId] = useState("");
  const [stageId, setStageId] = useState("");
  const [preferredStageId, setPreferredStageId] = useState<string | null>(null);

  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [loadingMeta, setLoadingMeta] = useState(false);
  const [loadingVehicle, setLoadingVehicle] = useState(false);
  const [saving, setSaving] = useState(false);
  const [statusAction, setStatusAction] = useState<DealStatus | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmLost, setConfirmLost] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const titlePreview = vehicle ? titleFromVehicle(vehicle) : "";

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!open) return;
    setConfirmDelete(false);
    setConfirmLost(false);
    if (deal) {
      setValue(deal.value ? String(Math.round(deal.value)) : "");
      setNotes(deal.notes ?? "");
      setSource(deal.source ?? "");
      setPaymentMethod(deal.payment_method ?? "");
      setBudget(deal.budget != null ? String(Math.round(Number(deal.budget))) : "");
      setPurchaseTimeline(deal.purchase_timeline ?? "");
      setTradeIn(!!deal.trade_in);
      setNextAction(deal.next_action ?? "");
      setNextActionAt(
        deal.next_action_at
          ? deal.next_action_at.slice(0, 16)
          : "",
      );
      setLossReason(deal.loss_reason ?? "");
      setObservations(deal.observations ?? "");
      setPipelineId(deal.pipeline_id);
      setPreferredStageId(deal.stage_id);
      setStageId(deal.stage_id);
    } else {
      setVehicle(null);
      setValue("");
      setNotes("");
      setSource("");
      setPaymentMethod("");
      setBudget("");
      setPurchaseTimeline("");
      setTradeIn(false);
      setNextAction("");
      setNextActionAt("");
      setLossReason("");
      setObservations("");
      setPipelineId("");
      setStageId("");
      setPreferredStageId(null);
      setStages([]);
    }
  }, [open, deal]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (!open || !deal?.vehicle_id) {
      if (open && deal && !deal.vehicle_id) {
        // Legacy deal without inventory link — clear selection.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setVehicle(null);
      }
      return;
    }
    let cancelled = false;
    (async () => {
      setLoadingVehicle(true);
      const { data, error } = await supabase
        .from("vehicles")
        .select("*")
        .eq("id", deal.vehicle_id!)
        .maybeSingle();
      if (cancelled) return;
      setLoadingVehicle(false);
      if (error || !data) {
        setVehicle(null);
        return;
      }
      setVehicle(data as Vehicle);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, deal, supabase]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoadingMeta(true);
      const { data, error } = await supabase
        .from("pipelines")
        .select("*")
        .order("created_at");
      if (cancelled) return;
      if (error) {
        toast.error(t("toastFailedLoadPipelines"));
        setPipelines([]);
      } else {
        const list = (data ?? []) as Pipeline[];
        setPipelines(list);
        if (deal?.pipeline_id && list.some((p) => p.id === deal.pipeline_id)) {
          setPipelineId(deal.pipeline_id);
        } else if (!deal && list.length > 0) {
          setPipelineId(list[0].id);
        }
      }
      setLoadingMeta(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, deal, supabase, t]);

  useEffect(() => {
    if (!open || !pipelineId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStages([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("pipeline_stages")
        .select("*")
        .eq("pipeline_id", pipelineId)
        .order("position");
      if (cancelled) return;
      if (error) {
        toast.error(t("toastFailedLoadStages"));
        setStages([]);
        setStageId("");
        return;
      }
      const list = (data ?? []) as PipelineStage[];
      setStages(list);
      if (
        preferredStageId &&
        list.some((s) => s.id === preferredStageId)
      ) {
        setStageId(preferredStageId);
        setPreferredStageId(null);
      } else if (!list.some((s) => s.id === stageId)) {
        setStageId(list[0]?.id ?? "");
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, pipelineId, preferredStageId, supabase, t]);

  function handleVehicleChange(next: Vehicle | null) {
    setVehicle(next);
    if (next) {
      // Prefill price from inventory; agent can still override.
      setValue(next.price ? String(Math.round(next.price)) : "");
    }
  }

  async function handleSave() {
    if (!vehicle || !pipelineId || !stageId) {
      toast.error(t("toastRequiredVehicle"));
      return;
    }

    const title = titleFromVehicle(vehicle);
    if (!title) {
      toast.error(t("toastRequiredVehicle"));
      return;
    }

    setSaving(true);

    const basePayload = {
      title,
      vehicle_id: vehicle.id,
      value: parseDealValue(value),
      currency: DEFAULT_CURRENCY,
      contact_id: contactId,
      pipeline_id: pipelineId,
      stage_id: stageId,
      notes: notes.trim() || null,
      source: source.trim() || null,
      payment_method: paymentMethod.trim() || null,
      budget: budget.trim() ? parseDealValue(budget) : null,
      purchase_timeline: purchaseTimeline.trim() || null,
      trade_in: tradeIn,
      next_action: nextAction.trim() || null,
      next_action_at: nextActionAt ? new Date(nextActionAt).toISOString() : null,
      loss_reason: lossReason.trim() || null,
      observations: observations.trim() || null,
    };

    if (isEdit && deal) {
      const { error } = await supabase
        .from("deals")
        .update({
          ...basePayload,
          updated_at: new Date().toISOString(),
        })
        .eq("id", deal.id);
      setSaving(false);
      if (error) {
        toast.error(t("toastFailedSaveDeal"));
        return;
      }
      toast.success(t("toastDealUpdated"));
      onOpenChange(false);
      onSaved({ type: "saved" });
      return;
    }

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

    const payload: Record<string, unknown> = {
      ...basePayload,
      user_id: user.id,
      account_id: accountId,
      status: "open",
    };
    if (conversationId) {
      payload.conversation_id = conversationId;
    }

    const { error } = await supabase.from("deals").insert(payload);
    setSaving(false);

    if (error) {
      toast.error(t("toastFailedCreate"));
      return;
    }

    toast.success(t("toastCreated"));
    onOpenChange(false);
    onSaved({ type: "saved" });
  }

  async function handleStatusChange(status: DealStatus) {
    if (!deal) return;
    setStatusAction(status);

    const update: Record<string, unknown> = {
      status,
      updated_at: new Date().toISOString(),
    };
    // Persist notes so admins can see why the deal was lost.
    if (status === "lost") {
      update.notes = notes.trim() || null;
      update.loss_reason = lossReason.trim() || notes.trim() || null;
      update.closed_at = new Date().toISOString();
    }
    if (status === "won") {
      update.closed_at = new Date().toISOString();
    }

    const { error } = await supabase
      .from("deals")
      .update(update)
      .eq("id", deal.id);

    if (error) {
      setStatusAction(null);
      toast.error(t("toastFailedStatus"));
      return;
    }

    let conversationClosed = false;
    const targetConversationId =
      conversationId || deal.conversation_id || null;

    if (status === "lost" && targetConversationId) {
      const { error: convError } = await supabase
        .from("conversations")
        .update({
          status: "closed",
          updated_at: new Date().toISOString(),
        })
        .eq("id", targetConversationId);
      if (!convError) conversationClosed = true;
    } else if (status === "open" && targetConversationId) {
      await supabase
        .from("conversations")
        .update({
          status: "open",
          updated_at: new Date().toISOString(),
        })
        .eq("id", targetConversationId);
    }

    setStatusAction(null);
    setConfirmLost(false);
    toast.success(
      status === "won"
        ? t("toastMarkedWon")
        : status === "lost"
          ? t("toastMarkedLost")
          : t("toastReopened"),
    );
    onOpenChange(false);
    onSaved({
      type: "status",
      dealId: deal.id,
      status,
      conversationClosed,
    });
  }

  async function handleDelete() {
    if (!deal) return;
    setDeleting(true);
    const { error } = await supabase.from("deals").delete().eq("id", deal.id);
    setDeleting(false);
    if (error) {
      toast.error(t("toastFailedDelete"));
      return;
    }
    toast.success(t("toastDeleted"));
    setConfirmDelete(false);
    onOpenChange(false);
    onSaved({ type: "deleted", dealId: deal.id });
  }

  const canSubmit =
    !!vehicle &&
    !!pipelineId &&
    !!stageId &&
    !saving &&
    !loadingMeta &&
    !loadingVehicle;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full border-border bg-popover p-0 text-popover-foreground sm:max-w-md"
      >
        <div className="flex h-full flex-col">
          <SheetHeader className="border-b border-border/50 p-4">
            <SheetTitle className="text-popover-foreground">
              {isEdit ? t("editDeal") : t("newDeal")}
            </SheetTitle>
          </SheetHeader>

          <div className="flex-1 space-y-4 overflow-y-auto p-4">
            {loadingVehicle ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                {t("loadingVehicle")}
              </div>
            ) : (
              <VehiclePicker
                value={vehicle}
                onChange={handleVehicleChange}
                includeVehicleId={deal?.vehicle_id}
              />
            )}

            {titlePreview ? (
              <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">
                  {t("titlePreview")}:
                </span>{" "}
                {titlePreview}
              </p>
            ) : null}

            <div className="grid gap-2">
              <Label className="text-muted-foreground">{t("price")}</Label>
              <div className="relative">
                <Banknote className="absolute top-1/2 left-2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={value}
                  onChange={(e) =>
                    setValue(sanitizeDealValueInput(e.target.value))
                  }
                  placeholder="0"
                  className="border-border bg-muted pl-7 text-foreground"
                />
              </div>
              <p className="text-xs text-muted-foreground">{t("priceHint")}</p>
            </div>

            <div className="grid gap-2">
              <Label className="text-muted-foreground">{t("pipeline")}</Label>
              <select
                value={pipelineId}
                onChange={(e) => {
                  setPreferredStageId(null);
                  setPipelineId(e.target.value);
                }}
                disabled={loadingMeta || pipelines.length === 0}
                className="h-9 w-full rounded-lg border border-border bg-muted px-2.5 text-sm text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              >
                {pipelines.length === 0 ? (
                  <option value="">{t("noPipelines")}</option>
                ) : (
                  pipelines.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))
                )}
              </select>
            </div>

            <div className="grid gap-2">
              <Label className="text-muted-foreground">{t("stage")}</Label>
              <select
                value={stageId}
                onChange={(e) => setStageId(e.target.value)}
                disabled={!pipelineId || stages.length === 0}
                className="h-9 w-full rounded-lg border border-border bg-muted px-2.5 text-sm text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              >
                {stages.length === 0 ? (
                  <option value="">{t("noStages")}</option>
                ) : (
                  stages.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))
                )}
              </select>
            </div>

            <div className="grid gap-2">
              <Label className="text-muted-foreground">Fuente</Label>
              <Input
                value={source}
                onChange={(e) => setSource(e.target.value)}
                placeholder="WhatsApp, referido, web…"
                className="border-border bg-muted text-foreground"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="grid gap-2">
                <Label className="text-muted-foreground">Método de pago</Label>
                <Input
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  placeholder="Contado, crédito…"
                  className="border-border bg-muted text-foreground"
                />
              </div>
              <div className="grid gap-2">
                <Label className="text-muted-foreground">Plazo de compra</Label>
                <Input
                  value={purchaseTimeline}
                  onChange={(e) => setPurchaseTimeline(e.target.value)}
                  placeholder="Esta semana, 30 días…"
                  className="border-border bg-muted text-foreground"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="grid gap-2">
                <Label className="text-muted-foreground">Presupuesto</Label>
                <Input
                  value={budget}
                  onChange={(e) => setBudget(sanitizeDealValueInput(e.target.value))}
                  placeholder="0"
                  className="border-border bg-muted text-foreground"
                />
              </div>
              <label className="flex items-end gap-2 pb-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={tradeIn}
                  onChange={(e) => setTradeIn(e.target.checked)}
                  className="rounded border-border"
                />
                Entrega vehículo
              </label>
            </div>

            <div className="grid gap-2">
              <Label className="text-muted-foreground">Próxima acción</Label>
              <Input
                value={nextAction}
                onChange={(e) => setNextAction(e.target.value)}
                placeholder="Llamar, enviar cotización…"
                className="border-border bg-muted text-foreground"
              />
              <Input
                type="datetime-local"
                value={nextActionAt}
                onChange={(e) => setNextActionAt(e.target.value)}
                className="border-border bg-muted text-foreground"
              />
            </div>

            {isEdit && (
              <div className="grid gap-2">
                <Label className="text-muted-foreground">Motivo de pérdida</Label>
                <Input
                  value={lossReason}
                  onChange={(e) => setLossReason(e.target.value)}
                  placeholder="Precio, competencia, sin respuesta…"
                  className="border-border bg-muted text-foreground"
                />
              </div>
            )}

            <div className="grid gap-2">
              <Label className="text-muted-foreground">Observaciones</Label>
              <Textarea
                value={observations}
                onChange={(e) => setObservations(e.target.value)}
                className="min-h-[60px] border-border bg-muted text-foreground"
              />
            </div>

            <div className="grid gap-2">
              <Label className="text-muted-foreground">{t("dealNotes")}</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={t("dealNotesPlaceholder")}
                className="min-h-[80px] border-border bg-muted text-foreground"
              />
              {isEdit ? (
                <p className="text-[11px] text-muted-foreground">
                  {t("lostNotesHint")}
                </p>
              ) : null}
            </div>

            {deal && (
              <div className="space-y-2 rounded-lg border border-border bg-muted/50 p-3">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  {t("status")}
                </p>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    onClick={() => handleStatusChange("won")}
                    disabled={!!statusAction || deal.status === "won"}
                    className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                  >
                    {statusAction === "won" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <Check className="mr-1 h-4 w-4" />
                        {t("markAsWon")}
                      </>
                    )}
                  </Button>
                  {confirmLost ? (
                    <div className="flex flex-1 flex-col gap-1.5 rounded-md border border-red-500/30 bg-red-500/10 px-2 py-1.5">
                      <span className="text-[11px] text-red-300">
                        {t("lostPrompt")}
                      </span>
                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={() => setConfirmLost(false)}
                          disabled={!!statusAction}
                          className="rounded px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted"
                        >
                          {t("cancel")}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleStatusChange("lost")}
                          disabled={!!statusAction}
                          className="rounded bg-red-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-red-700 disabled:opacity-50"
                        >
                          {statusAction === "lost" ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            t("confirm")
                          )}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <Button
                      type="button"
                      onClick={() => setConfirmLost(true)}
                      disabled={!!statusAction || deal.status === "lost"}
                      className="flex-1 bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
                    >
                      <X className="mr-1 h-4 w-4" />
                      {t("markAsLost")}
                    </Button>
                  )}
                </div>
                {deal.status && deal.status !== "open" && (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => handleStatusChange("open")}
                    disabled={!!statusAction}
                    className="w-full text-muted-foreground hover:text-foreground"
                  >
                    {t("reopenDeal")}
                  </Button>
                )}
              </div>
            )}
          </div>

          <div className="border-t border-border/50 bg-popover/80 p-4">
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
                disabled={!canSubmit}
                className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : isEdit ? (
                  t("saveDeal")
                ) : (
                  t("createDeal")
                )}
              </Button>
            </div>

            {deal &&
              (confirmDelete ? (
                <div className="mt-3 flex items-center justify-between gap-2 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs">
                  <span className="text-red-300">{t("deletePrompt")}</span>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(false)}
                      disabled={deleting}
                      className="rounded px-2 py-1 text-muted-foreground hover:bg-muted"
                    >
                      {t("cancel")}
                    </button>
                    <button
                      type="button"
                      onClick={handleDelete}
                      disabled={deleting}
                      className="rounded bg-red-600 px-2 py-1 font-medium text-white hover:bg-red-700 disabled:opacity-50"
                    >
                      {deleting ? t("deleting") : t("confirm")}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="mt-3 flex w-full items-center justify-center gap-1 text-xs text-red-400 hover:text-red-300"
                >
                  <Trash2 className="h-3 w-3" />
                  {t("deleteDeal")}
                </button>
              ))}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
