/**
 * Shared result shapes the dashboard components consume.
 */

export interface MetricDelta {
  current: number
  previous: number
}

export interface MetricsBundle {
  activeConversations: MetricDelta
  newContactsToday: MetricDelta
  /** Corrected: open status AND stage.outcome = open */
  openDealsValue: number
  openDealsCount: number
  messagesSentToday: MetricDelta
  /** CRM 1.1 extended cards (optional when flag off consumers ignore) */
  waitingTeam?: number
  slaBreached?: number
  appointmentsToday?: number
  appointmentsUnconfirmed?: number
  activeDeals?: number
  separations?: number
  wonThisMonth?: number
  wonThisMonthValue?: number
  waitingCustomer?: number
  unassignedConversations?: number
}

export type DashboardPeriod =
  | 'today'
  | 'yesterday'
  | 'last7'
  | 'month'
  | 'custom'

export interface DashboardFilters {
  period: DashboardPeriod
  from?: string // ISO
  to?: string // ISO
  assigneeId?: string | null
  locationId?: string | null
  channel?: 'whatsapp' | 'all'
}

export interface ConversationsSeriesPoint {
  day: string // YYYY-MM-DD local
  incoming: number
  outgoing: number
}

export interface PipelineStageSlice {
  id: string
  name: string
  color: string
  dealCount: number
  totalValue: number
  outcome?: 'open' | 'won' | 'lost'
}

export interface PipelineDonutData {
  stages: PipelineStageSlice[]
  totalValue: number
}

export interface ResponseTimeBucket {
  /** 0 = Mon … 6 = Sun (Monday-first). */
  dow: number
  /** Average first-response time in minutes. Null means no samples. */
  avgMinutes: number | null
  samples: number
}

export interface ResponseTimeSummary {
  buckets: ResponseTimeBucket[]
  thisWeekAvg: number | null
  lastWeekAvg: number | null
  medianMinutes?: number | null
  p90Minutes?: number | null
  withinTargetPct?: number | null
}

export type ActivityKind =
  | 'message'
  | 'deal'
  | 'broadcast'
  | 'automation'
  | 'contact'

export interface ActivityItem {
  id: string
  kind: ActivityKind
  /** Primary line of text rendered in the feed. Pre-formatted. */
  text: string
  /** ISO timestamp the item happened at, drives relative-time + sort. */
  at: string
  /** Optional deep-link for the whole row (not all items have a target). */
  href?: string
}
