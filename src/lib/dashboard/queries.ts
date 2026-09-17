import type { SupabaseClient } from '@supabase/supabase-js'
import {
  daysAgoStart,
  DOW_SHORT_MON_FIRST,
  lastNDayKeys,
  localDayKey,
  mondayIndex,
  startOfLocalDay,
} from './date-utils'
import type {
  ActivityItem,
  ConversationsSeriesPoint,
  DashboardFilters,
  MetricsBundle,
  PipelineDonutData,
  PipelineStageSlice,
  ResponseTimeBucket,
  ResponseTimeSummary,
} from './types'

type DB = SupabaseClient

function periodBounds(filters?: DashboardFilters): { from: Date; to: Date } {
  const now = new Date()
  const today = startOfLocalDay(now)
  const period = filters?.period ?? 'today'
  if (period === 'custom' && filters?.from && filters?.to) {
    return { from: new Date(filters.from), to: new Date(filters.to) }
  }
  if (period === 'yesterday') {
    const from = daysAgoStart(1)
    return { from, to: today }
  }
  if (period === 'last7') {
    return { from: daysAgoStart(6), to: new Date(now.getTime() + 1) }
  }
  if (period === 'month') {
    const from = new Date(today.getFullYear(), today.getMonth(), 1)
    return { from, to: new Date(now.getTime() + 1) }
  }
  // today
  return { from: today, to: new Date(now.getTime() + 1) }
}

function startOfMonth(): Date {
  const d = startOfLocalDay()
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

/** True open deals: status=open AND stage.outcome is open (or missing). */
function isTrulyOpenDeal(d: {
  status: string | null
  stage?: { outcome?: string | null } | { outcome?: string | null }[] | null
}): boolean {
  if (d.status !== 'open') return false
  const stage = Array.isArray(d.stage) ? d.stage[0] : d.stage
  const outcome = stage?.outcome ?? 'open'
  return outcome === 'open'
}

// --- 1. Metric cards ---------------------------------------------------

export async function loadMetrics(
  db: DB,
  filters?: DashboardFilters,
): Promise<MetricsBundle> {
  const todayStart = startOfLocalDay().toISOString()
  const yesterdayStart = daysAgoStart(1).toISOString()
  const monthStart = startOfMonth().toISOString()
  const { from: periodFrom, to: periodTo } = periodBounds(filters)

  const dealsQuery = db
    .from('deals')
    .select('id, value, status, assigned_to, location_id, stage_id, created_at, closed_at, updated_at, stage:pipeline_stages(outcome, name)')

  if (filters?.assigneeId) {
    dealsQuery.eq('assigned_to', filters.assigneeId)
  }
  if (filters?.locationId) {
    dealsQuery.eq('location_id', filters.locationId)
  }

  const [
    openConvCur,
    newConvToday,
    newConvYesterday,
    newContactsToday,
    newContactsYesterday,
    dealsRes,
    messagesToday,
    messagesYesterday,
    appointmentsRes,
    conversationsRes,
  ] = await Promise.all([
    db.from('conversations').select('id', { count: 'exact', head: true }).eq('status', 'open'),
    db
      .from('conversations')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'open')
      .gte('created_at', todayStart),
    db
      .from('conversations')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'open')
      .gte('created_at', yesterdayStart)
      .lt('created_at', todayStart),
    db
      .from('contacts')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', periodFrom.toISOString())
      .lt('created_at', periodTo.toISOString()),
    db
      .from('contacts')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', yesterdayStart)
      .lt('created_at', todayStart),
    dealsQuery,
    db
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('sender_type', 'agent')
      .gte('created_at', todayStart),
    db
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('sender_type', 'agent')
      .gte('created_at', yesterdayStart)
      .lt('created_at', todayStart),
    db
      .from('appointments')
      .select('id, status, starts_at, assigned_to, location_id')
      .gte('starts_at', todayStart)
      .lt('starts_at', daysAgoStart(-1).toISOString())
      .neq('status', 'cancelled'),
    db
      .from('conversations')
      .select('id, status, assigned_agent_id, last_message_at, operational_status')
      .in('status', ['open', 'pending'])
      .limit(500),
  ])

  type DealRow = {
    id: string
    value: number | null
    status: string | null
    assigned_to?: string | null
    location_id?: string | null
    closed_at?: string | null
    updated_at?: string | null
    created_at?: string
    stage?: { outcome?: string | null; name?: string | null } | { outcome?: string | null; name?: string | null }[] | null
  }

  const allDeals = (dealsRes.data ?? []) as DealRow[]
  const openDeals = allDeals.filter(isTrulyOpenDeal)
  const openDealsValue = openDeals.reduce((sum, d) => sum + (d.value ?? 0), 0)

  const wonThisMonth = allDeals.filter((d) => {
    if (d.status !== 'won') return false
    const at = d.closed_at ?? d.updated_at
    return at && at >= monthStart
  })

  const separations = openDeals.filter((d) => {
    const stage = Array.isArray(d.stage) ? d.stage[0] : d.stage
    const name = (stage?.name ?? '').toLowerCase()
    return name.includes('separad') || name.includes('deposit')
  })

  type Appt = { id: string; status: string; starts_at: string; assigned_to?: string | null; location_id?: string | null }
  let appointments = (appointmentsRes.data ?? []) as Appt[]
  if (filters?.assigneeId) {
    appointments = appointments.filter((a) => a.assigned_to === filters.assigneeId)
  }
  if (filters?.locationId) {
    appointments = appointments.filter((a) => a.location_id === filters.locationId)
  }

  const appointmentsToday = appointments.length
  const appointmentsUnconfirmed = appointments.filter(
    (a) => a.status === 'scheduled' || a.status === 'rescheduled',
  ).length

  // Conversation wait-state: approximate via operational_status when set;
  // otherwise leave waiting counts for inbox ops / SLA modules.
  type ConvRow = {
    id: string
    status: string
    assigned_agent_id: string | null
    operational_status: string | null
  }
  const convs = (conversationsRes.data ?? []) as ConvRow[]
  const waitingTeam = convs.filter(
    (c) =>
      c.operational_status === 'waiting_team' ||
      (!c.operational_status && c.status === 'open'),
  ).length
  const waitingCustomer = convs.filter(
    (c) => c.operational_status === 'waiting_customer',
  ).length
  const unassignedConversations = convs.filter((c) => !c.assigned_agent_id).length

  // SLA breached count from conversation_sla when available
  let slaBreached = 0
  {
    const slaRes = await db
      .from('conversation_sla')
      .select('id', { count: 'exact', head: true })
      .eq('breached', true)
      .is('first_agent_at', null)
    if (!slaRes.error) {
      slaBreached = slaRes.count ?? 0
    }
  }

  return {
    activeConversations: {
      current: openConvCur.count ?? 0,
      previous: (newConvToday.count ?? 0) - (newConvYesterday.count ?? 0),
    },
    newContactsToday: {
      current: newContactsToday.count ?? 0,
      previous: newContactsYesterday.count ?? 0,
    },
    openDealsValue,
    openDealsCount: openDeals.length,
    messagesSentToday: {
      current: messagesToday.count ?? 0,
      previous: messagesYesterday.count ?? 0,
    },
    waitingTeam,
    waitingCustomer,
    unassignedConversations,
    slaBreached,
    appointmentsToday,
    appointmentsUnconfirmed,
    activeDeals: openDeals.length,
    separations: separations.length,
    wonThisMonth: wonThisMonth.length,
    wonThisMonthValue: wonThisMonth.reduce((s, d) => s + (d.value ?? 0), 0),
  }
}

// --- 2. Conversations over time ---------------------------------------

export async function loadConversationsSeries(
  db: DB,
  rangeDays: number,
): Promise<ConversationsSeriesPoint[]> {
  const start = daysAgoStart(rangeDays - 1).toISOString()
  const { data, error } = await db
    .from('messages')
    .select('created_at, sender_type')
    .gte('created_at', start)
    .order('created_at', { ascending: true })
  if (error) throw error

  const keys = lastNDayKeys(rangeDays)
  const buckets = new Map<string, { incoming: number; outgoing: number }>()
  for (const k of keys) buckets.set(k, { incoming: 0, outgoing: 0 })

  for (const row of (data ?? []) as { created_at: string; sender_type: string }[]) {
    const key = localDayKey(row.created_at)
    const bucket = buckets.get(key)
    if (!bucket) continue
    if (row.sender_type === 'customer') bucket.incoming += 1
    else bucket.outgoing += 1
  }

  return keys.map((day) => ({ day, ...(buckets.get(day) ?? { incoming: 0, outgoing: 0 }) }))
}

// --- 3. Pipeline donut -------------------------------------------------

export async function loadPipelineDonut(db: DB): Promise<PipelineDonutData> {
  const [stagesRes, dealsRes] = await Promise.all([
    db
      .from('pipeline_stages')
      .select('id, name, color, pipeline_id, position, outcome')
      .order('position'),
    db
      .from('deals')
      .select('stage_id, value, status, stage:pipeline_stages(outcome)')
      .eq('status', 'open'),
  ])

  const stages =
    (stagesRes.data ?? []) as {
      id: string
      name: string
      color: string
      outcome?: string
    }[]

  type DealRow = {
    stage_id: string
    value: number | null
    status: string
    stage?: { outcome?: string | null } | { outcome?: string | null }[] | null
  }
  const deals = ((dealsRes.data ?? []) as DealRow[]).filter(isTrulyOpenDeal)

  const byStage = new Map<string, { count: number; total: number }>()
  for (const d of deals) {
    const row = byStage.get(d.stage_id) ?? { count: 0, total: 0 }
    row.count += 1
    row.total += d.value ?? 0
    byStage.set(d.stage_id, row)
  }

  const slices: PipelineStageSlice[] = stages
    .filter((s) => (s.outcome ?? 'open') === 'open')
    .map((s) => ({
      id: s.id,
      name: s.name,
      color: s.color || '#64748b',
      dealCount: byStage.get(s.id)?.count ?? 0,
      totalValue: byStage.get(s.id)?.total ?? 0,
      outcome: (s.outcome as 'open' | 'won' | 'lost') ?? 'open',
    }))
    .filter((s) => s.totalValue > 0 || s.dealCount > 0)

  return {
    stages: slices,
    totalValue: slices.reduce((sum, s) => sum + s.totalValue, 0),
  }
}

// --- 4. Response time by day of week ----------------------------------

function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)
  return sorted[Math.max(0, idx)]
}

export async function loadResponseTime(db: DB): Promise<ResponseTimeSummary> {
  const fourteenDaysAgo = daysAgoStart(13).toISOString()
  const { data, error } = await db
    .from('messages')
    .select('conversation_id, sender_type, created_at')
    .gte('created_at', fourteenDaysAgo)
    .order('conversation_id', { ascending: true })
    .order('created_at', { ascending: true })
  if (error) throw error

  const rows = (data ?? []) as {
    conversation_id: string
    sender_type: string
    created_at: string
  }[]

  interface Sample {
    customerAt: Date
    responseAt: Date
  }
  const samples: Sample[] = []

  let currentConv = ''
  let pendingCustomer: Date | null = null
  let seenAgent = false
  for (const row of rows) {
    if (row.conversation_id !== currentConv) {
      currentConv = row.conversation_id
      pendingCustomer = null
      seenAgent = false
    }
    const ts = new Date(row.created_at)
    // SLA: first customer → first HUMAN agent (exclude bot)
    if (row.sender_type === 'customer') {
      if (!pendingCustomer && !seenAgent) pendingCustomer = ts
    } else if (row.sender_type === 'agent' && pendingCustomer) {
      samples.push({ customerAt: pendingCustomer, responseAt: ts })
      pendingCustomer = null
      seenAgent = true
    } else if (row.sender_type === 'agent') {
      seenAgent = true
    }
  }

  const now = new Date()
  const thisWeekStart = daysAgoStart(mondayIndex(now))
  const lastWeekStart = daysAgoStart(mondayIndex(now) + 7)

  const byDow = new Map<number, number[]>()
  for (let i = 0; i < 7; i++) byDow.set(i, [])
  const thisWeekMins: number[] = []
  const lastWeekMins: number[] = []
  const allMins: number[] = []

  for (const s of samples) {
    const diffMin = (s.responseAt.getTime() - s.customerAt.getTime()) / 60_000
    if (diffMin < 0) continue
    allMins.push(diffMin)
    const dow = mondayIndex(s.customerAt)
    byDow.get(dow)!.push(diffMin)
    if (s.customerAt >= thisWeekStart) {
      thisWeekMins.push(diffMin)
    } else if (s.customerAt >= lastWeekStart && s.customerAt < thisWeekStart) {
      lastWeekMins.push(diffMin)
    }
  }

  const avg = (arr: number[]) =>
    arr.length === 0 ? null : arr.reduce((a, b) => a + b, 0) / arr.length

  const buckets: ResponseTimeBucket[] = Array.from({ length: 7 }, (_, dow) => {
    const samples = byDow.get(dow) ?? []
    return {
      dow,
      avgMinutes: avg(samples),
      samples: samples.length,
    }
  })

  void DOW_SHORT_MON_FIRST

  const sorted = [...allMins].sort((a, b) => a - b)
  const withinTarget =
    allMins.length === 0
      ? null
      : (allMins.filter((m) => m <= 5).length / allMins.length) * 100

  return {
    buckets,
    thisWeekAvg: avg(thisWeekMins),
    lastWeekAvg: avg(lastWeekMins),
    medianMinutes: percentile(sorted, 50),
    p90Minutes: percentile(sorted, 90),
    withinTargetPct: withinTarget,
  }
}

// --- 5. Activity feed --------------------------------------------------

export async function loadActivity(db: DB, limit = 20): Promise<ActivityItem[]> {
  const [msgs, contacts, deals, broadcasts, autoLogs] = await Promise.all([
    db
      .from('messages')
      .select('id, content_text, sender_type, created_at, conversation_id, conversations(contact_id, contacts(name, phone))')
      .eq('sender_type', 'customer')
      .order('created_at', { ascending: false })
      .limit(10),
    db
      .from('contacts')
      .select('id, name, phone, created_at')
      .order('created_at', { ascending: false })
      .limit(10),
    db
      .from('deals')
      .select('id, title, updated_at, stage:pipeline_stages(name)')
      .order('updated_at', { ascending: false })
      .limit(10),
    db
      .from('broadcasts')
      .select('id, name, status, total_recipients, created_at')
      .order('created_at', { ascending: false })
      .limit(5),
    db
      .from('automation_logs')
      .select('id, trigger_event, status, created_at, automation:automations(name), contact:contacts(name, phone)')
      .order('created_at', { ascending: false })
      .limit(10),
  ])

  const items: ActivityItem[] = []

  for (const m of (msgs.data ?? []) as unknown as Array<{
    id: string
    content_text: string | null
    created_at: string
    conversation_id: string
    conversations:
      | { contact_id: string | null; contacts: { name: string | null; phone: string }[] | { name: string | null; phone: string } | null }[]
      | { contact_id: string | null; contacts: { name: string | null; phone: string }[] | { name: string | null; phone: string } | null }
      | null
  }>) {
    const conv = Array.isArray(m.conversations) ? m.conversations[0] : m.conversations
    const contact = Array.isArray(conv?.contacts) ? conv?.contacts[0] : conv?.contacts
    const who = contact?.name || contact?.phone || 'Desconocido'
    items.push({
      id: `msg-${m.id}`,
      kind: 'message',
      text: `Nuevo mensaje de ${who}`,
      at: m.created_at,
      href: `/inbox?c=${m.conversation_id}`,
    })
  }

  for (const c of (contacts.data ?? []) as Array<{ id: string; name: string | null; phone: string; created_at: string }>) {
    items.push({
      id: `contact-${c.id}`,
      kind: 'contact',
      text: `Nuevo cliente: ${c.name || c.phone}`,
      at: c.created_at,
      href: '/contacts',
    })
  }

  for (const d of (deals.data ?? []) as unknown as Array<{
    id: string
    title: string
    updated_at: string
    stage: { name: string }[] | { name: string } | null
  }>) {
    const stage = Array.isArray(d.stage) ? d.stage[0] : d.stage
    items.push({
      id: `deal-${d.id}`,
      kind: 'deal',
      text: stage?.name
        ? `Negocio "${d.title}" en ${stage.name}`
        : `Negocio "${d.title}" actualizado`,
      at: d.updated_at,
      href: '/pipelines',
    })
  }

  for (const b of (broadcasts.data ?? []) as Array<{
    id: string
    name: string
    status: string
    total_recipients: number | null
    created_at: string
  }>) {
    items.push({
      id: `broadcast-${b.id}`,
      kind: 'broadcast',
      text: `Envío masivo "${b.name}" (${b.status})`,
      at: b.created_at,
      href: `/broadcasts/${b.id}`,
    })
  }

  for (const a of (autoLogs.data ?? []) as unknown as Array<{
    id: string
    trigger_event: string
    status: string
    created_at: string
    automation: { name: string }[] | { name: string } | null
    contact: { name: string | null; phone: string }[] | { name: string | null; phone: string } | null
  }>) {
    const auto = Array.isArray(a.automation) ? a.automation[0] : a.automation
    const contact = Array.isArray(a.contact) ? a.contact[0] : a.contact
    const who = contact?.name || contact?.phone || ''
    items.push({
      id: `auto-${a.id}`,
      kind: 'automation',
      text: auto?.name
        ? `Automatización "${auto.name}"${who ? ` → ${who}` : ''} (${a.status})`
        : `Automatización (${a.status})`,
      at: a.created_at,
      href: '/automations',
    })
  }

  return items.sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, limit)
}
