"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import type { Vehicle, VehicleStatus } from "@/types";
import { formatCurrency } from "@/lib/currency";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Search,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  Car,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { VehicleForm } from "@/components/inventory/vehicle-form";
import { useCan } from "@/hooks/use-can";
import { GatedButton } from "@/components/ui/gated-button";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 25;

type StatusFilter = "all" | VehicleStatus;

const STATUS_STYLES: Record<VehicleStatus, string> = {
  available: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  reserved: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  sold: "border-border bg-muted text-muted-foreground",
};

export default function InventoryPage() {
  const t = useTranslations("Inventory.page");
  const supabase = createClient();
  const canManage = useCan("edit-settings");

  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);

  const [formOpen, setFormOpen] = useState(false);
  const [editVehicle, setEditVehicle] = useState<Vehicle | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Vehicle | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchSeq = useRef(0);

  const fetchVehicles = useCallback(async () => {
    if (!canManage) {
      setLoading(false);
      return;
    }

    const seq = ++fetchSeq.current;
    setLoading(true);

    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    const term = search.trim();

    let query = supabase
      .from("vehicles")
      .select(
        "*, buyer:contacts!buyer_contact_id(id, name, phone), seller:profiles!sold_by(id, full_name), deals(id, status, conversation_id, stage:pipeline_stages(name))",
        { count: "exact" },
      )
      .order("created_at", { ascending: false })
      .range(from, to);

    if (statusFilter !== "all") {
      query = query.eq("status", statusFilter);
    }

    if (term) {
      const like = `%${term}%`;
      query = query.or(
        `plate.ilike.${like},make.ilike.${like},model.ilike.${like}`,
      );
    }

    let { data, count, error } = await query;
    if (error) {
      // Fallback without deals/stage embed
      let fallback = supabase
        .from("vehicles")
        .select(
          "*, buyer:contacts!buyer_contact_id(id, name, phone), seller:profiles!sold_by(id, full_name)",
          { count: "exact" },
        )
        .order("created_at", { ascending: false })
        .range(from, to);
      if (statusFilter !== "all") fallback = fallback.eq("status", statusFilter);
      if (term) {
        const like = `%${term}%`;
        fallback = fallback.or(
          `plate.ilike.${like},make.ilike.${like},model.ilike.${like}`,
        );
      }
      const again = await fallback;
      data = again.data;
      count = again.count;
      error = again.error;
    }

    if (seq !== fetchSeq.current) return;

    if (error) {
      toast.error(t("toastFailedLoad"));
      setLoading(false);
      return;
    }

    setVehicles((data ?? []) as Vehicle[]);
    setTotalCount(count ?? 0);
    setLoading(false);
  }, [supabase, page, search, statusFilter, canManage, t]);

  useEffect(() => {
    void fetchVehicles();
  }, [fetchVehicles]);

  // Reset page when filters change
  useEffect(() => {
    setPage(0);
  }, [search, statusFilter]);

  function openCreate() {
    setEditVehicle(null);
    setFormOpen(true);
  }

  function openEdit(v: Vehicle) {
    setEditVehicle(v);
    setFormOpen(true);
  }

  function confirmDelete(v: Vehicle) {
    setDeleteTarget(v);
    setDeleteConfirmOpen(true);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    const { error } = await supabase
      .from("vehicles")
      .delete()
      .eq("id", deleteTarget.id);
    setDeleting(false);
    if (error) {
      toast.error(t("toastFailedDelete"));
      return;
    }
    toast.success(t("toastDeleted"));
    setDeleteConfirmOpen(false);
    setDeleteTarget(null);
    void fetchVehicles();
  }

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const start = totalCount === 0 ? 0 : page * PAGE_SIZE + 1;
  const end = Math.min(totalCount, (page + 1) * PAGE_SIZE);

  const filters: { id: StatusFilter; label: string }[] = [
    { id: "all", label: t("filterAll") },
    { id: "available", label: t("statuses.available") },
    { id: "reserved", label: t("statuses.reserved") },
    { id: "sold", label: t("statuses.sold") },
  ];

  if (!canManage) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
        <Car className="h-8 w-8 text-muted-foreground/50" />
        <h1 className="text-lg font-semibold text-foreground">{t("title")}</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          {t("adminOnly")}
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-4 p-4 md:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            {t("title")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {totalCount > 0
              ? t("subtitle", { count: totalCount })
              : t("subtitleZero")}
          </p>
        </div>
        <GatedButton
          canAct={canManage}
          gateReason="manage inventory"
          onClick={openCreate}
          className="shrink-0"
        >
          <Plus className="mr-1.5 h-4 w-4" />
          {t("addVehicleBtn")}
        </GatedButton>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative max-w-md flex-1">
          <Search className="absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("searchPlaceholder")}
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {filters.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setStatusFilter(f.id)}
              className={cn(
                "rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
                statusFilter === f.id
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-border bg-card text-muted-foreground hover:text-foreground",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("tableColumns.plate")}</TableHead>
              <TableHead>{t("tableColumns.vehicle")}</TableHead>
              <TableHead className="hidden md:table-cell">
                {t("tableColumns.mileage")}
              </TableHead>
              <TableHead>{t("tableColumns.price")}</TableHead>
              <TableHead>{t("tableColumns.status")}</TableHead>
              <TableHead className="hidden md:table-cell">
                {t("tableColumns.openDeals")}
              </TableHead>
              <TableHead className="hidden lg:table-cell">
                {t("tableColumns.buyerSeller")}
              </TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={8} className="h-32 text-center">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
                  <p className="mt-2 text-sm text-muted-foreground">
                    {t("loading")}
                  </p>
                </TableCell>
              </TableRow>
            ) : vehicles.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="h-40 text-center">
                  <Car className="mx-auto h-8 w-8 text-muted-foreground/50" />
                  <p className="mt-2 text-sm text-muted-foreground">
                    {search || statusFilter !== "all"
                      ? t("noVehiclesMatch")
                      : t("noVehiclesYet")}
                  </p>
                  {canManage && !search && statusFilter === "all" ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-3"
                      onClick={openCreate}
                    >
                      <Plus className="mr-1.5 h-3.5 w-3.5" />
                      {t("addFirstVehicle")}
                    </Button>
                  ) : null}
                </TableCell>
              </TableRow>
            ) : (
              vehicles.map((v) => {
                const buyerName =
                  v.buyer?.name ||
                  (v.buyer_contact_id ? t("unknownBuyer") : null);
                const sellerName =
                  v.seller?.full_name ||
                  (v.sold_by ? t("unknownSeller") : null);
                const openDeals = (v.deals ?? []).filter(
                  (d) => !d.status || d.status === "open",
                );
                const stageNames = [
                  ...new Set(
                    openDeals
                      .map((d) => d.stage?.name?.trim())
                      .filter((n): n is string => !!n),
                  ),
                ];

                return (
                  <TableRow key={v.id}>
                    <TableCell className="font-mono text-sm font-medium">
                      {v.plate}
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">
                        {v.make} {v.model}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {v.year}
                      </div>
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground md:table-cell">
                      {v.mileage != null
                        ? t("mileageKm", {
                            km: v.mileage.toLocaleString("es-CO"),
                          })
                        : "—"}
                    </TableCell>
                    <TableCell>{formatCurrency(v.price)}</TableCell>
                    <TableCell>
                      <span
                        className={cn(
                          "inline-flex rounded-md border px-2 py-0.5 text-xs font-medium",
                          STATUS_STYLES[v.status],
                        )}
                      >
                        {t(`statuses.${v.status}`)}
                      </span>
                    </TableCell>
                    <TableCell className="hidden text-xs md:table-cell">
                      {openDeals.length === 0 ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <div className="space-y-0.5">
                          <div className="font-medium text-foreground">
                            {t("openDealsCount", { count: openDeals.length })}
                          </div>
                          {stageNames.length > 0 ? (
                            <div className="text-muted-foreground">
                              {stageNames.join(", ")}
                            </div>
                          ) : null}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="hidden text-xs text-muted-foreground lg:table-cell">
                      {v.status === "sold" ? (
                        <div className="space-y-0.5">
                          {sellerName ? (
                            <div>
                              {t("seller")}: {sellerName}
                            </div>
                          ) : null}
                          {buyerName ? (
                            <div>
                              {t("buyer")}: {buyerName}
                            </div>
                          ) : null}
                          {!sellerName && !buyerName ? "—" : null}
                        </div>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell>
                      {canManage ? (
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            render={
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                aria-label={t("actions")}
                              />
                            }
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openEdit(v)}>
                              <Pencil className="mr-2 h-3.5 w-3.5" />
                              {t("editAction")}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              variant="destructive"
                              onClick={() => confirmDelete(v)}
                            >
                              <Trash2 className="mr-2 h-3.5 w-3.5" />
                              {t("deleteAction")}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      ) : null}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {totalCount > 0 ? (
        <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
          <span>
            {t("showingPagination", { start, end, total: totalCount })}
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="px-2">
              {t("pageCount", { page: page + 1, total: totalPages })}
            </span>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              disabled={page + 1 >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ) : null}

      <VehicleForm
        open={formOpen}
        onOpenChange={setFormOpen}
        vehicle={editVehicle}
        onSaved={() => void fetchVehicles()}
      />

      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("deleteVehicleTitle")}</DialogTitle>
            <DialogDescription>
              {t("deleteVehicleDesc", {
                label: deleteTarget
                  ? `${deleteTarget.plate} · ${deleteTarget.make} ${deleteTarget.model}`
                  : "",
              })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteConfirmOpen(false)}
              disabled={deleting}
            >
              {t("cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={() => void handleDelete()}
              disabled={deleting}
            >
              {deleting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                t("deleteBtn")
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
