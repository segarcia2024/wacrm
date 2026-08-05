"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { parseDealValue, sanitizeDealValueInput } from "@/lib/currency";
import {
  VEHICLE_STATUSES,
  isValidVehicleMileage,
  isValidVehiclePlate,
  isValidVehicleYear,
  normalizeVehiclePlate,
  parseMileage,
} from "@/lib/vehicles/helpers";
import type { Vehicle, VehicleStatus } from "@/types";
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
import { Banknote, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

interface VehicleFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vehicle?: Vehicle | null;
  onSaved: () => void;
}

export function VehicleForm({
  open,
  onOpenChange,
  vehicle = null,
  onSaved,
}: VehicleFormProps) {
  const t = useTranslations("Inventory.form");
  const supabase = createClient();
  const { accountId } = useAuth();
  const isEdit = !!vehicle;

  const [plate, setPlate] = useState("");
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [year, setYear] = useState("");
  const [price, setPrice] = useState("");
  const [mileage, setMileage] = useState("");
  const [status, setStatus] = useState<VehicleStatus>("available");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!open) return;
    if (vehicle) {
      setPlate(vehicle.plate);
      setMake(vehicle.make);
      setModel(vehicle.model);
      setYear(String(vehicle.year));
      setPrice(vehicle.price ? String(Math.round(vehicle.price)) : "");
      setMileage(
        vehicle.mileage != null ? String(Math.round(vehicle.mileage)) : "",
      );
      setStatus(vehicle.status);
      setNotes(vehicle.notes ?? "");
    } else {
      setPlate("");
      setMake("");
      setModel("");
      setYear("");
      setPrice("");
      setMileage("");
      setStatus("available");
      setNotes("");
    }
  }, [open, vehicle]);
  /* eslint-enable react-hooks/set-state-in-effect */

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const normalizedPlate = normalizeVehiclePlate(plate);
    if (!isValidVehiclePlate(normalizedPlate)) {
      toast.error(t("toastInvalidPlate"));
      return;
    }
    if (!make.trim() || !model.trim() || !year.trim()) {
      toast.error(t("toastRequired"));
      return;
    }
    if (!isValidVehicleYear(year)) {
      toast.error(t("toastInvalidYear"));
      return;
    }
    if (!isValidVehicleMileage(mileage)) {
      toast.error(t("toastInvalidMileage"));
      return;
    }

    if (!accountId) {
      toast.error(t("toastNotLinked"));
      return;
    }

    setSaving(true);

    const yearNum = Number.parseInt(year.trim(), 10);
    const priceNum = parseDealValue(price);
    const mileageNum = parseMileage(mileage);

    const basePayload = {
      plate: normalizedPlate,
      make: make.trim().toUpperCase(),
      model: model.trim().toUpperCase(),
      year: yearNum,
      price: priceNum,
      mileage: mileageNum,
      status,
      notes: notes.trim() || null,
    };

    // Clear sold metadata when leaving sold (won-hook will refill later).
    const soldFields =
      status === "sold"
        ? {
            sold_at: vehicle?.sold_at ?? new Date().toISOString(),
          }
        : {
            sold_at: null,
            sold_by: null,
            buyer_contact_id: null,
            sold_deal_id: null,
          };

    if (isEdit && vehicle) {
      const { error } = await supabase
        .from("vehicles")
        .update({
          plate: basePayload.plate,
          make: basePayload.make,
          model: basePayload.model,
          year: basePayload.year,
          price: basePayload.price,
          mileage: basePayload.mileage,
          status: basePayload.status,
          notes: basePayload.notes,
          ...soldFields,
        })
        .eq("id", vehicle.id);
      setSaving(false);
      if (error) {
        if (error.code === "23505") {
          toast.error(t("toastDuplicatePlate"));
        } else {
          toast.error(t("toastFailedSave"));
        }
        return;
      }
      toast.success(t("toastUpdated"));
      onOpenChange(false);
      onSaved();
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

    const { error } = await supabase.from("vehicles").insert({
      plate: basePayload.plate,
      make: basePayload.make,
      model: basePayload.model,
      year: basePayload.year,
      price: basePayload.price,
      mileage: basePayload.mileage,
      status: basePayload.status,
      notes: basePayload.notes,
      user_id: user.id,
      account_id: accountId,
      ...soldFields,
    });
    setSaving(false);

    if (error) {
      if (error.code === "23505") {
        toast.error(t("toastDuplicatePlate"));
      } else {
        toast.error(t("toastFailedCreate"));
      }
      return;
    }

    toast.success(t("toastCreated"));
    onOpenChange(false);
    onSaved();
  }

  const canSubmit =
    !!plate.trim() &&
    !!make.trim() &&
    !!model.trim() &&
    !!year.trim() &&
    !saving;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full border-border bg-popover p-0 text-popover-foreground sm:max-w-md"
      >
        <form onSubmit={handleSubmit} className="flex h-full flex-col">
          <SheetHeader className="border-b border-border/50 p-4">
            <SheetTitle className="text-popover-foreground">
              {isEdit ? t("editTitle") : t("newTitle")}
            </SheetTitle>
          </SheetHeader>

          <div className="flex-1 space-y-4 overflow-y-auto p-4">
            <div className="grid gap-2">
              <Label className="text-muted-foreground">{t("plate")}</Label>
              <Input
                value={plate}
                onChange={(e) => setPlate(e.target.value.toUpperCase())}
                placeholder={t("platePlaceholder")}
                className="border-border bg-muted text-foreground uppercase"
                autoFocus
              />
            </div>

            <div className="grid gap-2">
              <Label className="text-muted-foreground">{t("make")}</Label>
              <Input
                value={make}
                onChange={(e) => setMake(e.target.value)}
                placeholder={t("makePlaceholder")}
                className="border-border bg-muted text-foreground"
              />
            </div>

            <div className="grid gap-2">
              <Label className="text-muted-foreground">{t("model")}</Label>
              <Input
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder={t("modelPlaceholder")}
                className="border-border bg-muted text-foreground"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label className="text-muted-foreground">{t("year")}</Label>
                <Input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={4}
                  value={year}
                  onChange={(e) =>
                    setYear(e.target.value.replace(/\D/g, "").slice(0, 4))
                  }
                  placeholder={t("yearPlaceholder")}
                  className="border-border bg-muted text-foreground"
                />
              </div>
              <div className="grid gap-2">
                <Label className="text-muted-foreground">{t("mileage")}</Label>
                <Input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={mileage}
                  onChange={(e) =>
                    setMileage(e.target.value.replace(/\D/g, ""))
                  }
                  placeholder={t("mileagePlaceholder")}
                  className="border-border bg-muted text-foreground"
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label className="text-muted-foreground">{t("price")}</Label>
              <div className="relative">
                <Banknote className="absolute top-1/2 left-2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={price}
                  onChange={(e) =>
                    setPrice(sanitizeDealValueInput(e.target.value))
                  }
                  placeholder="0"
                  className="border-border bg-muted pl-7 text-foreground"
                />
              </div>
              <p className="text-xs text-muted-foreground">{t("priceHint")}</p>
            </div>

            <div className="grid gap-2">
              <Label className="text-muted-foreground">{t("status")}</Label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as VehicleStatus)}
                className="flex h-9 w-full rounded-md border border-border bg-muted px-3 text-sm text-foreground"
              >
                {VEHICLE_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {t(`statuses.${s}`)}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-2">
              <Label className="text-muted-foreground">{t("notes")}</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={t("notesPlaceholder")}
                rows={3}
                className="border-border bg-muted text-foreground"
              />
            </div>
          </div>

          <div className="flex gap-2 border-t border-border/50 p-4">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              {t("cancel")}
            </Button>
            <Button type="submit" className="flex-1" disabled={!canSubmit}>
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : isEdit ? (
                t("save")
              ) : (
                t("create")
              )}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
