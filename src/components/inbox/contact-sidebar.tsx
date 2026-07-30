"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useCan } from "@/hooks/use-can";
import { formatCurrency } from "@/lib/currency";
import type {
  Contact,
  Deal,
  ContactNote,
  Tag,
  PipelineStage,
  Appointment,
} from "@/types";
import {
  Phone,
  Mail,
  Copy,
  Check,
  Tag as TagIcon,
  DollarSign,
  StickyNote,
  Plus,
  X,
  Building2,
  CalendarDays,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { InboxDealForm } from "@/components/inbox/inbox-deal-form";
import { AppointmentForm } from "@/components/appointments/appointment-form";
import { format } from "date-fns";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type EditableField = "name" | "email" | "company";

interface ContactSidebarProps {
  contact: Contact | null;
  /** Active inbox conversation — written to deals.conversation_id on create. */
  conversationId?: string | null;
  /** Called after name/email/company are saved so the inbox can refresh. */
  onContactUpdated?: (contact: Contact) => void;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function ContactSidebar({
  contact,
  conversationId,
  onContactUpdated,
}: ContactSidebarProps) {
  const tSidebar = useTranslations("Inbox.sidebar");
  const tThread = useTranslations("Inbox.messageThread");

  const { accountId } = useAuth();
  const canEdit = useCan("send-messages");
  const [copied, setCopied] = useState(false);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [notes, setNotes] = useState<ContactNote[]>([]);
  const [tags, setTags] = useState<(Tag & { contact_tag_id: string })[]>([]);
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [newNote, setNewNote] = useState("");
  const [addingNote, setAddingNote] = useState(false);
  const [dealFormOpen, setDealFormOpen] = useState(false);
  const [editingDeal, setEditingDeal] = useState<Deal | null>(null);
  const [updatingStageId, setUpdatingStageId] = useState<string | null>(null);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [appointmentFormOpen, setAppointmentFormOpen] = useState(false);
  const [editingAppointment, setEditingAppointment] =
    useState<Appointment | null>(null);
  const tAppt = useTranslations("Appointments.form");

  const [draftName, setDraftName] = useState("");
  const [draftEmail, setDraftEmail] = useState("");
  const [draftCompany, setDraftCompany] = useState("");
  const [editingField, setEditingField] = useState<EditableField | null>(null);
  const [savingField, setSavingField] = useState<EditableField | null>(null);
  const [tagPickerOpen, setTagPickerOpen] = useState(false);
  const [togglingTagId, setTogglingTagId] = useState<string | null>(null);

  const skipBlurSaveRef = useRef(false);

  const fetchContactData = useCallback(async () => {
    if (!contact) return;

    const supabase = createClient();

    const [dealsRes, notesRes, tagsRes, stagesRes, allTagsRes, apptsRes] =
      await Promise.all([
        supabase
          .from("deals")
          .select("*, stage:pipeline_stages(*)")
          .eq("contact_id", contact.id)
          .order("created_at", { ascending: false }),
        supabase
          .from("contact_notes")
          .select("*")
          .eq("contact_id", contact.id)
          .order("created_at", { ascending: false }),
        supabase
          .from("contact_tags")
          .select("id, tag_id, tags(*)")
          .eq("contact_id", contact.id),
        supabase.from("pipeline_stages").select("*").order("position"),
        supabase.from("tags").select("*").order("name"),
        supabase
          .from("appointments")
          .select("*, deal:deals(id, title)")
          .eq("contact_id", contact.id)
          .neq("status", "cancelled")
          .order("starts_at", { ascending: true })
          .limit(20),
      ]);

    if (dealsRes.data) setDeals(dealsRes.data);
    if (notesRes.data) setNotes(notesRes.data);
    if (stagesRes.data) setStages(stagesRes.data as PipelineStage[]);
    if (allTagsRes.data) setAllTags(allTagsRes.data as Tag[]);
    if (apptsRes.data) setAppointments(apptsRes.data as Appointment[]);
    if (tagsRes.data) {
      const mapped = tagsRes.data
        .filter((ct: Record<string, unknown>) => ct.tags)
        .map((ct: Record<string, unknown>) => ({
          ...(ct.tags as Tag),
          contact_tag_id: ct.id as string,
        }));
      setTags(mapped);
    }
  }, [contact]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchContactData();
  }, [fetchContactData]);

  /* Sync drafts when the active contact (or its fields) change. */
  useEffect(() => {
    if (!contact) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDraftName(contact.name ?? "");
    setDraftEmail(contact.email ?? "");
    setDraftCompany(contact.company ?? "");
    setEditingField(null);
    setTagPickerOpen(false);
  }, [contact]);

  const handleCopyPhone = useCallback(async () => {
    if (!contact?.phone) return;
    await navigator.clipboard.writeText(contact.phone);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [contact]);

  const handleAddNote = useCallback(async () => {
    if (!contact || !newNote.trim()) return;
    if (!accountId) return;
    setAddingNote(true);

    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const user = session?.user;

    const { data, error } = await supabase
      .from("contact_notes")
      .insert({
        contact_id: contact.id,
        account_id: accountId,
        user_id: user?.id,
        note_text: newNote.trim(),
      })
      .select()
      .single();

    if (!error && data) {
      setNotes((prev) => [data, ...prev]);
      setNewNote("");
    }
    setAddingNote(false);
  }, [contact, newNote, accountId]);

  const handleStageChange = useCallback(
    async (dealId: string, nextStageId: string) => {
      const deal = deals.find((d) => d.id === dealId);
      if (!deal || deal.stage_id === nextStageId) return;

      const nextStage = stages.find((s) => s.id === nextStageId) ?? null;
      const prevStageId = deal.stage_id;
      const prevStage = deal.stage;

      setDeals((prev) =>
        prev.map((d) =>
          d.id === dealId
            ? {
                ...d,
                stage_id: nextStageId,
                stage: nextStage ?? d.stage,
              }
            : d,
        ),
      );
      setUpdatingStageId(dealId);

      const supabase = createClient();
      const { error } = await supabase
        .from("deals")
        .update({ stage_id: nextStageId })
        .eq("id", dealId);

      setUpdatingStageId(null);

      if (error) {
        setDeals((prev) =>
          prev.map((d) =>
            d.id === dealId
              ? { ...d, stage_id: prevStageId, stage: prevStage }
              : d,
          ),
        );
        toast.error(tSidebar("toastFailedStage"));
        return;
      }
      toast.success(tSidebar("toastStageUpdated"));
    },
    [deals, stages, tSidebar],
  );

  const cancelEdit = useCallback(
    (field: EditableField) => {
      if (!contact) return;
      skipBlurSaveRef.current = true;
      if (field === "name") setDraftName(contact.name ?? "");
      if (field === "email") setDraftEmail(contact.email ?? "");
      if (field === "company") setDraftCompany(contact.company ?? "");
      setEditingField(null);
    },
    [contact],
  );

  const saveField = useCallback(
    async (field: EditableField) => {
      if (!contact || !canEdit || savingField) return;

      const raw =
        field === "name"
          ? draftName
          : field === "email"
            ? draftEmail
            : draftCompany;
      const next = raw.trim();
      const prev = (contact[field] ?? "").trim();

      if (next === prev) {
        setEditingField(null);
        return;
      }

      if (field === "email" && next && !EMAIL_RE.test(next)) {
        toast.error(tSidebar("toastInvalidEmail"));
        return;
      }

      setSavingField(field);
      const supabase = createClient();
      const { error } = await supabase
        .from("contacts")
        .update({
          [field]: next || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", contact.id);

      setSavingField(null);

      if (error) {
        toast.error(tSidebar("toastFailedContactUpdate"));
        return;
      }

      const updated: Contact = {
        ...contact,
        [field]: next || undefined,
        updated_at: new Date().toISOString(),
      };
      onContactUpdated?.(updated);
      setEditingField(null);
      toast.success(tSidebar("toastContactUpdated"));
    },
    [
      contact,
      canEdit,
      savingField,
      draftName,
      draftEmail,
      draftCompany,
      onContactUpdated,
      tSidebar,
    ],
  );

  const handleFieldBlur = useCallback(
    (field: EditableField) => {
      if (skipBlurSaveRef.current) {
        skipBlurSaveRef.current = false;
        return;
      }
      void saveField(field);
    },
    [saveField],
  );

  const handleRemoveTag = useCallback(
    async (tag: Tag & { contact_tag_id: string }) => {
      if (!contact || !canEdit) return;
      setTogglingTagId(tag.id);
      const prev = tags;
      setTags((list) => list.filter((t) => t.contact_tag_id !== tag.contact_tag_id));

      const supabase = createClient();
      const { error } = await supabase
        .from("contact_tags")
        .delete()
        .eq("id", tag.contact_tag_id);

      setTogglingTagId(null);
      if (error) {
        setTags(prev);
        toast.error(tSidebar("toastFailedTag"));
        return;
      }
      toast.success(tSidebar("toastTagRemoved"));
    },
    [contact, canEdit, tags, tSidebar],
  );

  const handleAddTag = useCallback(
    async (tag: Tag) => {
      if (!contact || !canEdit) return;
      if (tags.some((t) => t.id === tag.id)) return;

      setTogglingTagId(tag.id);
      const supabase = createClient();
      const { data, error } = await supabase
        .from("contact_tags")
        .insert({ contact_id: contact.id, tag_id: tag.id })
        .select("id")
        .single();

      setTogglingTagId(null);

      if (error || !data) {
        toast.error(tSidebar("toastFailedTag"));
        return;
      }

      setTags((prev) => [
        ...prev,
        { ...tag, contact_tag_id: data.id as string },
      ]);
      toast.success(tSidebar("toastTagAdded"));
    },
    [contact, canEdit, tags, tSidebar],
  );

  if (!contact) {
    return (
      <div className="flex h-full w-70 items-center justify-center border-l border-border bg-card">
        <p className="text-sm text-muted-foreground">
          {tThread("selectConversation")}
        </p>
      </div>
    );
  }

  const displayName = draftName.trim() || contact.phone;
  const initials = displayName.charAt(0).toUpperCase();
  const assignedTagIds = new Set(tags.map((t) => t.id));
  const availableTags = allTags.filter((t) => !assignedTagIds.has(t.id));

  return (
    <div className="flex h-full w-70 flex-col border-l border-border bg-card">
      <ScrollArea className="flex-1">
        <div className="p-4">
          {/* Contact Info */}
          <div className="flex flex-col items-center text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted text-lg font-semibold text-foreground">
              {contact.avatar_url ? (
                <img
                  src={contact.avatar_url}
                  alt={displayName}
                  className="h-16 w-16 rounded-full object-cover"
                />
              ) : (
                initials
              )}
            </div>

            <div className="mt-3 w-full">
              {canEdit && editingField === "name" ? (
                <input
                  autoFocus
                  value={draftName}
                  disabled={savingField === "name"}
                  onChange={(e) => setDraftName(e.target.value)}
                  onBlur={() => handleFieldBlur("name")}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void saveField("name");
                    }
                    if (e.key === "Escape") cancelEdit("name");
                  }}
                  placeholder={tSidebar("namePlaceholder")}
                  className="w-full rounded-md border border-primary/50 bg-muted px-2 py-1 text-center text-sm font-semibold text-foreground outline-none"
                  aria-label={tSidebar("name")}
                />
              ) : (
                <button
                  type="button"
                  disabled={!canEdit}
                  onClick={() => canEdit && setEditingField("name")}
                  className={cn(
                    "w-full rounded-md px-2 py-1 text-sm font-semibold text-foreground",
                    canEdit && "hover:bg-muted cursor-text",
                    !canEdit && "cursor-default",
                  )}
                  title={canEdit ? tSidebar("clickToEdit") : undefined}
                >
                  {draftName.trim() || (
                    <span className="font-normal text-muted-foreground">
                      {canEdit ? tSidebar("namePlaceholder") : contact.phone}
                    </span>
                  )}
                </button>
              )}
            </div>

            <div className="mt-1 w-full">
              {canEdit && editingField === "company" ? (
                <input
                  autoFocus
                  value={draftCompany}
                  disabled={savingField === "company"}
                  onChange={(e) => setDraftCompany(e.target.value)}
                  onBlur={() => handleFieldBlur("company")}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void saveField("company");
                    }
                    if (e.key === "Escape") cancelEdit("company");
                  }}
                  placeholder={tSidebar("companyPlaceholder")}
                  className="w-full rounded-md border border-primary/50 bg-muted px-2 py-1 text-center text-xs text-foreground outline-none"
                  aria-label={tSidebar("company")}
                />
              ) : (
                <button
                  type="button"
                  disabled={!canEdit}
                  onClick={() => canEdit && setEditingField("company")}
                  className={cn(
                    "inline-flex w-full items-center justify-center gap-1 rounded-md px-2 py-0.5 text-xs text-muted-foreground",
                    canEdit && "hover:bg-muted cursor-text",
                    !canEdit && "cursor-default",
                  )}
                  title={canEdit ? tSidebar("clickToEdit") : undefined}
                >
                  {(canEdit || draftCompany.trim()) && (
                    <Building2 className="h-3 w-3 shrink-0" />
                  )}
                  {draftCompany.trim() ||
                    (canEdit ? (
                      <span className="text-muted-foreground/70">
                        {tSidebar("companyPlaceholder")}
                      </span>
                    ) : null)}
                </button>
              )}
            </div>
          </div>

          {/* Phone (read-only) + Email */}
          <div className="mt-4 space-y-2">
            <button
              onClick={handleCopyPhone}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted"
            >
              <Phone className="h-4 w-4 text-muted-foreground" />
              <span className="flex-1 text-left">{contact.phone}</span>
              {copied ? (
                <Check className="h-3 w-3 text-primary" />
              ) : (
                <Copy className="h-3 w-3 text-muted-foreground" />
              )}
            </button>

            {canEdit && editingField === "email" ? (
              <div className="flex items-center gap-2 rounded-lg border border-primary/50 bg-muted px-3 py-1.5">
                <Mail className="h-4 w-4 shrink-0 text-muted-foreground" />
                <input
                  autoFocus
                  type="email"
                  value={draftEmail}
                  disabled={savingField === "email"}
                  onChange={(e) => setDraftEmail(e.target.value)}
                  onBlur={() => handleFieldBlur("email")}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void saveField("email");
                    }
                    if (e.key === "Escape") cancelEdit("email");
                  }}
                  placeholder={tSidebar("emailPlaceholder")}
                  className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none"
                  aria-label={tSidebar("email")}
                />
              </div>
            ) : (
              <button
                type="button"
                disabled={!canEdit}
                onClick={() => canEdit && setEditingField("email")}
                className={cn(
                  "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground",
                  canEdit && "hover:bg-muted cursor-text",
                  !canEdit && "cursor-default",
                )}
                title={canEdit ? tSidebar("clickToEdit") : undefined}
              >
                <Mail className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="truncate text-left">
                  {draftEmail.trim() ||
                    (canEdit ? (
                      <span className="text-muted-foreground/70">
                        {tSidebar("emailPlaceholder")}
                      </span>
                    ) : (
                      "—"
                    ))}
                </span>
              </button>
            )}
          </div>

          <div className="my-4 border-t border-border" />

          {/* Tags */}
          <div>
            <div className="flex items-center justify-between gap-2 px-1">
              <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                <TagIcon className="h-3 w-3" />
                {tSidebar("tags")}
              </div>
              {canEdit && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-6 w-6 p-0 text-primary hover:bg-primary/10 hover:text-primary"
                  onClick={() => setTagPickerOpen((o) => !o)}
                  aria-label={tSidebar("addTag")}
                  aria-expanded={tagPickerOpen}
                >
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>

            <div className="mt-2 flex flex-wrap gap-1">
              {tags.length === 0 ? (
                <p className="px-1 text-xs text-muted-foreground">
                  {tSidebar("noTags")}
                </p>
              ) : (
                tags.map((tag) => (
                  <span
                    key={tag.contact_tag_id}
                    className="inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] font-medium"
                    style={{
                      backgroundColor: `${tag.color}20`,
                      color: tag.color,
                    }}
                  >
                    {tag.name}
                    {canEdit && (
                      <button
                        type="button"
                        disabled={togglingTagId === tag.id}
                        onClick={() => handleRemoveTag(tag)}
                        className="ml-0.5 rounded-full p-0.5 opacity-70 hover:opacity-100"
                        aria-label={tSidebar("removeTag", { name: tag.name })}
                      >
                        <X className="h-2.5 w-2.5" />
                      </button>
                    )}
                  </span>
                ))
              )}
            </div>

            {canEdit && tagPickerOpen && (
              <div className="mt-2 rounded-lg border border-border bg-muted/50 p-2">
                {availableTags.length === 0 ? (
                  <p className="px-1 text-[11px] text-muted-foreground">
                    {allTags.length === 0
                      ? tSidebar("noTagsAvailable")
                      : tSidebar("allTagsAssigned")}
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-1">
                    {availableTags.map((tag) => (
                      <button
                        key={tag.id}
                        type="button"
                        disabled={togglingTagId === tag.id}
                        onClick={() => handleAddTag(tag)}
                        className="rounded-full px-2 py-0.5 text-[10px] font-medium opacity-80 transition-opacity hover:opacity-100"
                        style={{
                          backgroundColor: `${tag.color}20`,
                          color: tag.color,
                        }}
                      >
                        + {tag.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="my-4 border-t border-border" />

          {/* Active Deals */}
          <div>
            <div className="flex items-center justify-between gap-2 px-1">
              <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                <DollarSign className="h-3 w-3" />
                {tSidebar("deals")}
              </div>
              {canEdit && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-6 w-6 p-0 text-primary hover:bg-primary/10 hover:text-primary"
                  onClick={() => {
                    setEditingDeal(null);
                    setDealFormOpen(true);
                  }}
                  aria-label={tSidebar("newDeal")}
                >
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
            <div className="mt-2 space-y-2">
              {deals.length === 0 ? (
                <p className="px-1 text-xs text-muted-foreground">
                  {tSidebar("noDeals")}
                </p>
              ) : (
                deals.map((deal) => {
                  const dealStages = stages.filter(
                    (s) => s.pipeline_id === deal.pipeline_id,
                  );
                  return (
                    <div
                      key={deal.id}
                      className="rounded-lg bg-muted px-3 py-2"
                    >
                      <button
                        type="button"
                        disabled={!canEdit}
                        onClick={() => {
                          if (!canEdit) return;
                          setEditingDeal(deal);
                          setDealFormOpen(true);
                        }}
                        className={cn(
                          "w-full text-left",
                          canEdit && "cursor-pointer",
                          !canEdit && "cursor-default",
                        )}
                        title={canEdit ? tSidebar("editDeal") : undefined}
                      >
                        <p className="text-sm font-medium text-foreground">
                          {deal.title}
                        </p>
                        <div className="mt-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                          <span>{formatCurrency(deal.value)}</span>
                          {deal.stage && !canEdit && (
                            <span
                              className="rounded-full px-1.5 py-0.5 text-[10px]"
                              style={{
                                backgroundColor: `${deal.stage.color}20`,
                                color: deal.stage.color,
                              }}
                            >
                              {deal.stage.name}
                            </span>
                          )}
                        </div>
                      </button>
                      {canEdit && dealStages.length > 0 && (
                        <select
                          value={deal.stage_id}
                          disabled={updatingStageId === deal.id}
                          onChange={(e) =>
                            handleStageChange(deal.id, e.target.value)
                          }
                          onClick={(e) => e.stopPropagation()}
                          className="mt-2 h-7 w-full rounded-md border border-border bg-card px-1.5 text-[11px] text-foreground outline-none focus:border-primary"
                          aria-label={tSidebar("changeStage")}
                        >
                          {dealStages.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="my-4 border-t border-border" />

          {/* Appointments */}
          <div>
            <div className="flex items-center justify-between gap-2 px-1">
              <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                <CalendarDays className="h-3 w-3" />
                {tSidebar("appointments")}
              </div>
              {canEdit && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-6 w-6 p-0 text-primary hover:bg-primary/10 hover:text-primary"
                  onClick={() => {
                    setEditingAppointment(null);
                    setAppointmentFormOpen(true);
                  }}
                  aria-label={tSidebar("newAppointment")}
                >
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
            <div className="mt-2 space-y-2">
              {appointments.length === 0 ? (
                <p className="px-1 text-xs text-muted-foreground">
                  {tSidebar("noAppointments")}
                </p>
              ) : (
                appointments.map((appt) => (
                  <button
                    key={appt.id}
                    type="button"
                    disabled={!canEdit}
                    onClick={() => {
                      if (!canEdit) return;
                      setEditingAppointment(appt);
                      setAppointmentFormOpen(true);
                    }}
                    className={cn(
                      "w-full rounded-lg bg-muted px-3 py-2 text-left",
                      canEdit && "hover:bg-muted/80",
                    )}
                  >
                    <p className="text-sm font-medium text-foreground">
                      {tAppt(`types.${appt.type}`)}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {format(new Date(appt.starts_at), "MMM d, yyyy HH:mm")} ·{" "}
                      {appt.duration_minutes} min
                    </p>
                    {appt.location && (
                      <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                        {appt.location}
                      </p>
                    )}
                    {appt.deal && (
                      <p className="mt-0.5 truncate text-[11px] text-primary">
                        {appt.deal.title}
                      </p>
                    )}
                    <p className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                      {tAppt(`statuses.${appt.status}`)}
                    </p>
                  </button>
                ))
              )}
            </div>
          </div>

          <div className="my-4 border-t border-border" />

          {/* Notes */}
          <div>
            <div className="flex items-center gap-2 px-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              <StickyNote className="h-3 w-3" />
              {tSidebar("notes")}
            </div>
            <div className="mt-2">
              <div className="flex gap-2">
                <textarea
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  placeholder={tSidebar("addNotePlaceholder")}
                  rows={2}
                  className="flex-1 resize-none rounded-lg border border-border bg-muted px-3 py-2 text-xs text-foreground placeholder-muted-foreground outline-none focus:border-primary/50"
                />
                <Button
                  size="sm"
                  className="h-auto bg-primary px-2 hover:bg-primary/90"
                  onClick={handleAddNote}
                  disabled={!newNote.trim() || addingNote}
                >
                  <Plus className="h-3 w-3" />
                </Button>
              </div>

              <div className="mt-2 space-y-2">
                {notes.map((note) => (
                  <div
                    key={note.id}
                    className="rounded-lg bg-muted px-3 py-2"
                  >
                    <p className="whitespace-pre-wrap text-xs text-muted-foreground">
                      {note.note_text}
                    </p>
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      {format(new Date(note.created_at), "MMM d, yyyy HH:mm")}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </ScrollArea>

      <InboxDealForm
        open={dealFormOpen}
        onOpenChange={(open) => {
          setDealFormOpen(open);
          if (!open) setEditingDeal(null);
        }}
        contactId={contact.id}
        conversationId={conversationId}
        deal={editingDeal}
        onSaved={fetchContactData}
      />

      <AppointmentForm
        open={appointmentFormOpen}
        onOpenChange={(open) => {
          setAppointmentFormOpen(open);
          if (!open) setEditingAppointment(null);
        }}
        contactId={contact.id}
        conversationId={conversationId}
        appointment={editingAppointment}
        onSaved={fetchContactData}
      />
    </div>
  );
}
