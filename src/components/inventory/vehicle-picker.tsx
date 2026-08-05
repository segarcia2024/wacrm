"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency } from "@/lib/currency";
import { buildVehicleLabel } from "@/lib/vehicles/helpers";
import type { Vehicle } from "@/types";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Car, Loader2, Search, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

const SEARCH_DEBOUNCE_MS = 250;
const FETCH_LIMIT = 40;
const RESULT_LIMIT = 20;

interface VehiclePickerProps {
  value: Vehicle | null;
  onChange: (vehicle: Vehicle | null) => void;
  /** Keep this vehicle selectable even if sold (edit flow). */
  includeVehicleId?: string | null;
  disabled?: boolean;
  className?: string;
}

function isSelectable(
  v: Vehicle,
  includeVehicleId?: string | null,
): boolean {
  if (includeVehicleId && v.id === includeVehicleId) return true;
  return v.status === "available" || v.status === "reserved";
}

export function VehiclePicker({
  value,
  onChange,
  includeVehicleId = null,
  disabled = false,
  className,
}: VehiclePickerProps) {
  const t = useTranslations("Inventory.picker");
  const supabase = createClient();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState(false);
  const seq = useRef(0);
  const rootRef = useRef<HTMLDivElement>(null);

  const search = useCallback(
    async (term: string) => {
      const id = ++seq.current;
      setLoading(true);
      setError(false);

      let q = supabase
        .from("vehicles")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(FETCH_LIMIT);

      const trimmed = term.trim();
      if (trimmed) {
        const like = `%${trimmed}%`;
        q = q.or(
          `plate.ilike.${like},make.ilike.${like},model.ilike.${like}`,
        );
      }

      const { data, error: err } = await q;
      if (id !== seq.current) return;
      setLoading(false);
      if (err) {
        setError(true);
        setResults([]);
        return;
      }

      const rows = ((data ?? []) as Vehicle[])
        .filter((v) => isSelectable(v, includeVehicleId))
        .slice(0, RESULT_LIMIT);
      setResults(rows);
    },
    [supabase, includeVehicleId],
  );

  useEffect(() => {
    if (!open) return;
    const handle = window.setTimeout(() => {
      void search(query);
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(handle);
  }, [open, query, search]);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  if (value) {
    return (
      <div className={cn("grid gap-2", className)}>
        <Label className="text-muted-foreground">{t("label")}</Label>
        <div className="flex items-start gap-2 rounded-lg border border-border bg-muted px-3 py-2.5">
          <Car className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-foreground">
              {buildVehicleLabel(value)}
            </p>
            <p className="text-xs text-muted-foreground">
              {formatCurrency(value.price)}
              {value.mileage != null
                ? ` · ${t("mileageKm", { km: value.mileage.toLocaleString("es-CO") })}`
                : ""}
              {value.status === "sold" ? ` · ${t("statusSold")}` : ""}
            </p>
          </div>
          {!disabled ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0 text-muted-foreground"
              onClick={() => onChange(null)}
              aria-label={t("clear")}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div ref={rootRef} className={cn("grid gap-2", className)}>
      <Label className="text-muted-foreground">{t("label")}</Label>
      <div className="relative">
        <Search className="absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder={t("searchPlaceholder")}
          disabled={disabled}
          className="border-border bg-muted pl-8 text-foreground"
          autoComplete="off"
        />
        {loading ? (
          <Loader2 className="absolute top-1/2 right-2.5 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-muted-foreground" />
        ) : null}
      </div>

      {open ? (
        <div className="max-h-56 overflow-y-auto rounded-lg border border-border bg-card shadow-md">
          {error ? (
            <p className="px-3 py-4 text-center text-xs text-muted-foreground">
              {t("loadError")}
            </p>
          ) : results.length === 0 && !loading ? (
            <p className="px-3 py-4 text-center text-xs text-muted-foreground">
              {query.trim() ? t("noResults") : t("emptyInventory")}
            </p>
          ) : (
            <ul className="py-1">
              {results.map((v) => (
                <li key={v.id}>
                  <button
                    type="button"
                    className="flex w-full flex-col gap-0.5 px-3 py-2 text-left hover:bg-muted"
                    onClick={() => {
                      onChange(v);
                      setQuery("");
                      setOpen(false);
                    }}
                  >
                    <span className="text-sm font-medium text-foreground">
                      {buildVehicleLabel(v)}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formatCurrency(v.price)}
                      {v.mileage != null
                        ? ` · ${t("mileageKm", { km: v.mileage.toLocaleString("es-CO") })}`
                        : ""}
                      {v.status === "reserved"
                        ? ` · ${t("statusReserved")}`
                        : ""}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
