"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  CONVERSATION_SELECT,
  CONVERSATION_SELECT_LEGACY,
  CONVERSATION_LIST_LIMIT,
  isLostDealConversation,
  matchesContactFilters,
  normalizeConversations,
} from "@/lib/inbox/conversations";
import { matchesVehicleSearch } from "@/lib/vehicles/search";
import { contactPrimaryLabel } from "@/lib/contacts/display";
import { cn } from "@/lib/utils";
import type { Conversation, ConversationStatus, Tag } from "@/types";
import { Search, ChevronDown, X } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useTranslations } from "next-intl";
import { useAuth } from "@/hooks/use-auth";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";

interface ConversationListProps {
  activeConversationId: string | null;
  onSelect: (conversation: Conversation) => void;
  conversations: Conversation[];
  onConversationsLoaded: (conversations: Conversation[]) => void;
  /**
   * Increment to force the fetch effect below to refire. The parent
   * bumps this on realtime reconnect / tab visibility → visible so the
   * list catches up on any events sent while the WS was disconnected
   * or the tab was throttled. Optional so existing callers keep working.
   */
  resyncToken?: number;
}

const STATUS_COLORS: Record<ConversationStatus, string> = {
  open: "bg-primary",
  pending: "bg-amber-500",
  closed: "bg-muted-foreground",
};



type InboxFilter =
  | ConversationStatus
  | "all"
  | "unread"
  | "waiting_team"
  | "waiting_customer"
  | "sla_breached"
  | "follow_up_today";
type AssigneeFilter = "all" | "mine" | "unassigned";

export function ConversationList({
  activeConversationId,
  onSelect,
  conversations,
  onConversationsLoaded,
  resyncToken = 0,
}: ConversationListProps) {
  const t = useTranslations("Inbox.conversationList");
  const { user, canViewAllConversations, hasCrm11Feature } = useAuth();
  const inboxOps = hasCrm11Feature("crm11_inbox_ops");

  const FILTER_OPTIONS: { label: string; value: InboxFilter }[] = useMemo(() => {
    const base: { label: string; value: InboxFilter }[] = [
      { label: t("filterAll"), value: "all" },
      { label: t("filterUnread"), value: "unread" },
      { label: t("filterOpen"), value: "open" },
      { label: t("filterPending"), value: "pending" },
      { label: t("filterClosed"), value: "closed" },
    ];
    if (inboxOps) {
      base.push(
        { label: t("filterWaitingTeam"), value: "waiting_team" },
        { label: t("filterWaitingCustomer"), value: "waiting_customer" },
        { label: t("filterSlaBreached"), value: "sla_breached" },
        { label: t("filterFollowUpToday"), value: "follow_up_today" },
      );
    }
    return base;
  }, [t, inboxOps]);

  const ASSIGNEE_OPTIONS: { label: string; value: AssigneeFilter }[] = useMemo(
    () => [
      { label: t("filterAssigneeAll"), value: "all" },
      { label: t("filterAssigneeMine"), value: "mine" },
      { label: t("filterAssigneeUnassigned"), value: "unassigned" },
    ],
    [t],
  );

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<InboxFilter>("all");
  const [assigneeFilter, setAssigneeFilter] = useState<AssigneeFilter>("all");
  const [loading, setLoading] = useState(true);
  // Contact-based filters (issue #272). Tags use OR logic (a conversation
  // matches if its contact carries any selected tag), consistent with
  // Broadcast audience filtering. Company is an exact match on the field.
  const [tags, setTags] = useState<Tag[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [selectedCompany, setSelectedCompany] = useState<string | null>(null);

  // Keep the latest callback in a ref so the fetch effect below can
  // have a stable, empty-dep identity. Previously the fetch useCallback
  // depended on `onConversationsLoaded`, which depends on the parent's
  // `deepLinkConvId` — so every URL change (including one the parent
  // triggered via router.replace after a click) caused a fresh
  // conversations fetch. That extra refetch was the trigger for the
  // deep-link auto-select running a second time and wiping the active
  // thread's messages.
  // Mutation lives in an effect (not render) per React 19's refs rule;
  // the fetch runs once on mount so it's fine to read the slightly
  // older value — the very next render updates the ref for any
  // subsequent async completion.
  const onConversationsLoadedRef = useRef(onConversationsLoaded);
  useEffect(() => {
    onConversationsLoadedRef.current = onConversationsLoaded;
  });

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    (async () => {
      const first = await supabase
        .from("conversations")
        .select(CONVERSATION_SELECT)
        .order("last_message_at", { ascending: false })
        .limit(CONVERSATION_LIST_LIMIT);
      let data: unknown = first.data;
      let error = first.error;

      // Inventory join may fail before migration 046 — retry without vehicles.
      if (error) {
        const fallback = await supabase
          .from("conversations")
          .select(CONVERSATION_SELECT_LEGACY)
          .order("last_message_at", { ascending: false })
          .limit(CONVERSATION_LIST_LIMIT);
        data = fallback.data;
        error = fallback.error;
      }

      if (cancelled) return;

      if (error) {
        // Supabase errors have non-enumerable properties — log fields explicitly
        console.error("Failed to fetch conversations:", {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code,
        });
        setLoading(false);
        return;
      }

      onConversationsLoadedRef.current(normalizeConversations(data ?? []));
      setLoading(false);

      // Hydrate SLA breach flags (best-effort; ignore if table missing)
      try {
        const ids = (Array.isArray(data) ? data : []).map(
          (c: { id?: string }) => c.id,
        ).filter(Boolean) as string[];
        if (ids.length > 0) {
          const { data: sla } = await supabase
            .from("conversation_sla")
            .select("conversation_id, breached, first_agent_at")
            .in("conversation_id", ids.slice(0, 200))
            .eq("breached", true)
            .is("first_agent_at", null);
          if (sla && sla.length > 0) {
            const breached = new Set(
              sla.map((s: { conversation_id: string }) => s.conversation_id),
            );
            onConversationsLoadedRef.current(
              normalizeConversations(data ?? []).map((c) =>
                breached.has(c.id) ? { ...c, slaBreached: true } : c,
              ),
            );
          }
        }
      } catch {
        /* pre-054 schema */
      }
    })();

    return () => {
      cancelled = true;
    };
    // `resyncToken` is included so the parent can force a refetch when
    // the realtime channel reconnects or the tab regains focus — catches
    // up on any events sent while the WS was disconnected or throttled.
  }, [resyncToken]);

  // Tag definitions for the filter picker — loaded once so labels/colours
  // stay stable regardless of which conversations happen to be loaded.
  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from("tags").select("*").order("name");
      if (!cancelled && data) setTags(data as Tag[]);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Company options are derived from the loaded conversations — there's no
  // separate companies table, and only companies with a live conversation
  // are worth offering as an inbox filter.
  const companies = useMemo(() => {
    const set = new Set<string>();
    for (const c of conversations) {
      const co = c.contact?.company?.trim();
      if (co) set.add(co);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [conversations]);

  const tagsById = useMemo(() => {
    const m = new Map<string, Tag>();
    for (const t of tags) m.set(t.id, t);
    return m;
  }, [tags]);

  const filtered = useMemo(() => {
    let result = conversations;

    // Agents/viewers never see threads whose linked deal was marked lost;
    // admins keep them (notes / history).
    if (!canViewAllConversations) {
      result = result.filter((c) => !isLostDealConversation(c));
    }

    if (filter === "unread") {
      result = result.filter((c) => c.unread_count > 0);
    } else if (filter === "waiting_team") {
      result = result.filter(
        (c) =>
          c.operational_status === "waiting_team" ||
          (!c.operational_status && c.status === "open"),
      );
    } else if (filter === "waiting_customer") {
      result = result.filter((c) => c.operational_status === "waiting_customer");
    } else if (filter === "sla_breached") {
      result = result.filter((c) => c.slaBreached);
    } else if (filter === "follow_up_today") {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      result = result.filter((c) => {
        const at = c.openDealSummary?.nextActionAt;
        if (!at) return false;
        const d = new Date(at);
        return d >= today && d < tomorrow;
      });
    } else if (filter !== "all") {
      result = result.filter((c) => c.status === filter);
    }

    if (assigneeFilter === "mine" && user?.id) {
      result = result.filter((c) => c.assigned_agent_id === user.id);
    } else if (assigneeFilter === "unassigned") {
      result = result.filter((c) => !c.assigned_agent_id);
    }

    // Contact-based filters (tags via OR logic, exact company match).
    if (selectedTagIds.length > 0 || selectedCompany !== null) {
      result = result.filter((c) =>
        matchesContactFilters(c, {
          tagIds: selectedTagIds,
          company: selectedCompany,
        })
      );
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((c) => {
        const name = c.contact?.name?.toLowerCase() ?? "";
        const phone = c.contact?.phone?.toLowerCase() ?? "";
        const username = c.contact?.username?.toLowerCase() ?? "";
        const bsuid = c.contact?.bsuid?.toLowerCase() ?? "";
        const waId = c.contact?.wa_id?.toLowerCase() ?? "";
        const lastMsg = c.last_message_text?.toLowerCase() ?? "";
        const qBare = q.replace(/^@+/, "");
        return (
          name.includes(q) ||
          phone.includes(q) ||
          username.includes(qBare) ||
          `@${username}`.includes(q) ||
          bsuid.toLowerCase().includes(q) ||
          waId.includes(q) ||
          lastMsg.includes(q) ||
          matchesVehicleSearch(c.linkedVehicles, q)
        );
      });
    }

    return result;
  }, [
    conversations,
    filter,
    assigneeFilter,
    search,
    selectedTagIds,
    selectedCompany,
    user?.id,
    canViewAllConversations,
  ]);

  const toggleTag = useCallback((id: string) => {
    setSelectedTagIds((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]
    );
  }, []);

  const clearContactFilters = useCallback(() => {
    setSelectedTagIds([]);
    setSelectedCompany(null);
  }, []);

  const hasContactFilters = selectedTagIds.length > 0 || selectedCompany !== null;

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setSearch(e.target.value);
    },
    []
  );

  const handleSelect = useCallback(
    (conv: Conversation) => {
      onSelect(conv);
    },
    [onSelect]
  );

  const activeFilter = FILTER_OPTIONS.find((o) => o.value === filter);
  const activeAssigneeFilter = ASSIGNEE_OPTIONS.find(
    (o) => o.value === assigneeFilter,
  );

  return (
    // w-full on mobile so the list occupies the whole viewport when it's
    // the single pane showing; fixed 320px on desktop where it shares the
    // row with the thread + contact sidebar.
    <div className="flex h-full min-h-0 w-full flex-col border-r border-border bg-card pb-[env(safe-area-inset-bottom,0px)] lg:w-80 lg:pb-0">
      {/* Search + Filter */}
      <div className="space-y-2 border-b border-border p-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={handleSearchChange}
            placeholder={t("searchPlaceholder")}
            className="border-border bg-muted pl-9 text-sm text-foreground placeholder-muted-foreground focus:border-primary/50"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger className="inline-flex items-center justify-center h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground rounded-md hover:bg-muted">
                {activeFilter?.label ?? t("filterAll")}
                <ChevronDown className="h-3 w-3" />
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              className="border-border bg-popover"
            >
              {FILTER_OPTIONS.map((opt) => (
                <DropdownMenuItem
                  key={opt.value}
                  onClick={() => setFilter(opt.value)}
                  className={cn(
                    "text-sm",
                    filter === opt.value
                      ? "text-primary"
                      : "text-popover-foreground"
                  )}
                >
                  {opt.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger
              className={cn(
                "inline-flex items-center justify-center h-7 gap-1 px-2 text-xs rounded-md hover:bg-muted",
                assigneeFilter !== "all"
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {activeAssigneeFilter?.label ?? t("filterAssigneeAll")}
              <ChevronDown className="h-3 w-3" />
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              className="border-border bg-popover"
            >
              {ASSIGNEE_OPTIONS.map((opt) => (
                <DropdownMenuItem
                  key={opt.value}
                  onClick={() => setAssigneeFilter(opt.value)}
                  className={cn(
                    "text-sm",
                    assigneeFilter === opt.value
                      ? "text-primary"
                      : "text-popover-foreground",
                  )}
                >
                  {opt.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {tags.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger
                className={cn(
                  "inline-flex items-center justify-center h-7 gap-1 px-2 text-xs rounded-md hover:bg-muted",
                  selectedTagIds.length > 0
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {t("tags")}
                {selectedTagIds.length > 0 && (
                  <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
                    {selectedTagIds.length}
                  </span>
                )}
                <ChevronDown className="h-3 w-3" />
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                className="max-h-64 w-56 border-border bg-popover"
              >
                {tags.map((t) => (
                  <DropdownMenuCheckboxItem
                    key={t.id}
                    checked={selectedTagIds.includes(t.id)}
                    onCheckedChange={() => toggleTag(t.id)}
                    className="text-sm text-popover-foreground"
                  >
                    <span className="flex items-center gap-2">
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: t.color }}
                      />
                      <span className="truncate">{t.name}</span>
                    </span>
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {companies.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger
                className={cn(
                  "inline-flex max-w-40 items-center justify-center h-7 gap-1 px-2 text-xs rounded-md hover:bg-muted",
                  selectedCompany
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <span className="truncate">{selectedCompany ?? t("company")}</span>
                <ChevronDown className="h-3 w-3 shrink-0" />
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                className="max-h-64 w-56 border-border bg-popover"
              >
                <DropdownMenuItem
                  onClick={() => setSelectedCompany(null)}
                  className={cn(
                    "text-sm",
                    selectedCompany === null
                      ? "text-primary"
                      : "text-popover-foreground"
                  )}
                >
                  {t("allCompanies")}
                </DropdownMenuItem>
                {companies.map((co) => (
                  <DropdownMenuItem
                    key={co}
                    onClick={() => setSelectedCompany(co)}
                    className={cn(
                      "text-sm",
                      selectedCompany === co
                        ? "text-primary"
                        : "text-popover-foreground"
                    )}
                  >
                    <span className="truncate">{co}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        {hasContactFilters && (
          <div className="flex flex-wrap items-center gap-1">
            {selectedTagIds.map((id) => {
              const tag = tagsById.get(id);
              return (
                <button
                  key={id}
                  onClick={() => toggleTag(id)}
                  className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] text-foreground hover:bg-muted/70"
                >
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ backgroundColor: tag?.color ?? "var(--muted-foreground)" }}
                  />
                  <span className="max-w-24 truncate">{tag?.name ?? t("tags")}</span>
                  <X className="h-3 w-3" />
                </button>
              );
            })}
            {selectedCompany && (
              <button
                onClick={() => setSelectedCompany(null)}
                className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] text-foreground hover:bg-muted/70"
              >
                <span className="max-w-24 truncate">{selectedCompany}</span>
                <X className="h-3 w-3" />
              </button>
            )}
            <button
              onClick={clearContactFilters}
              className="px-1 text-[11px] text-muted-foreground hover:text-foreground"
            >
              {t("clearAll")}
            </button>
          </div>
        )}
      </div>

      {/* Conversation Items.
          `min-h-0` is load-bearing: a flex child defaults to
          min-height:auto, so without it this ScrollArea grows to fit
          every conversation instead of shrinking to the remaining
          space — the list then overflows and gets clipped by the
          parent's overflow-hidden with no scrollbar (issue #229). */}
      <ScrollArea className="min-h-0 flex-1">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <p className="text-sm text-muted-foreground">{t("noConversations")}</p>
          </div>
        ) : (
          <div className="flex flex-col">
            {filtered.map((conv) => (
              <ConversationItem
                key={conv.id}
                conversation={conv}
                isActive={conv.id === activeConversationId}
                onSelect={handleSelect}
                showLostBadge={
                  canViewAllConversations && isLostDealConversation(conv)
                }
                t={t}
              />
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

interface ConversationItemProps {
  conversation: Conversation;
  isActive: boolean;
  onSelect: (conversation: Conversation) => void;
  showLostBadge?: boolean;
  t: ReturnType<typeof useTranslations>;
}

function ConversationItem({
  conversation,
  isActive,
  onSelect,
  showLostBadge = false,
  t,
}: ConversationItemProps) {
  const contact = conversation.contact;
  const displayName = contactPrimaryLabel(contact, t("unknown"));
  const initials = displayName.charAt(0).toUpperCase();

  const handleClick = useCallback(() => {
    onSelect(conversation);
  }, [onSelect, conversation]);

  const timeAgo = conversation.last_message_at
    ? formatDistanceToNow(new Date(conversation.last_message_at), {
        addSuffix: false,
      })
    : "";

  return (
    <button
      onClick={handleClick}
      className={cn(
        "flex w-full items-start gap-3 px-3 py-3 text-left transition-colors hover:bg-muted/50",
        isActive && "border-l-2 border-primary bg-muted/70"
      )}
    >
      {/* Avatar */}
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-medium text-foreground">
        {contact?.avatar_url ? (
          <img
            src={contact.avatar_url}
            alt={displayName}
            className="h-10 w-10 rounded-full object-cover"
          />
        ) : (
          initials
        )}
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-sm font-medium text-foreground">
            {displayName}
          </span>
          <span className="shrink-0 text-[10px] text-muted-foreground">{timeAgo}</span>
        </div>
        <div className="mt-0.5 flex items-center justify-between gap-2">
          <p className="truncate text-xs text-muted-foreground">
            {conversation.last_message_text || t("noMessagesYet")}
          </p>
          <div className="flex shrink-0 items-center gap-1.5">
            {conversation.slaBreached && (
              <span className="rounded bg-amber-500/20 px-1 py-0.5 text-[9px] font-medium uppercase tracking-wide text-amber-400">
                SLA
              </span>
            )}
            {showLostBadge && (
              <span className="rounded bg-red-500/15 px-1 py-0.5 text-[9px] font-medium uppercase tracking-wide text-red-400">
                {t("lostBadge")}
              </span>
            )}
            {conversation.unread_count > 0 && (
              <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
                {conversation.unread_count}
              </span>
            )}
            <span
              className={cn(
                "h-2 w-2 rounded-full",
                STATUS_COLORS[conversation.status]
              )}
              title={conversation.status}
            />
          </div>
        </div>
        {(conversation.openDealSummary?.stageName ||
          conversation.openDealSummary?.nextAction ||
          conversation.openDealSummary?.assigneeName) && (
          <p className="mt-1 truncate text-[10px] text-muted-foreground/80">
            {[
              conversation.openDealSummary.assigneeName,
              conversation.openDealSummary.stageName,
              conversation.openDealSummary.nextAction,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        )}
      </div>
    </button>
  );
}
