"use client"

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/use-auth'
import { formatCurrency } from '@/lib/currency'
import {
  MessageSquare,
  UserPlus,
  DollarSign,
  Calendar,
  AlertTriangle,
  Clock,
  Handshake,
  Trophy,
  Inbox,
} from 'lucide-react'

import {
  loadActivity,
  loadConversationsSeries,
  loadMetrics,
  loadPipelineDonut,
  loadResponseTime,
} from '@/lib/dashboard/queries'
import type {
  ActivityItem,
  ConversationsSeriesPoint,
  DashboardFilters,
  DashboardPeriod,
  MetricsBundle,
  PipelineDonutData,
  ResponseTimeSummary,
} from '@/lib/dashboard/types'

import { MetricCard } from '@/components/dashboard/metric-card'
import { SkeletonCard } from '@/components/dashboard/skeleton'
import { QuickActions } from '@/components/dashboard/quick-actions'
import { ConversationsChart } from '@/components/dashboard/conversations-chart'
import { PipelineDonut } from '@/components/dashboard/pipeline-donut'
import { ResponseTimeChart } from '@/components/dashboard/response-time-chart'
import { ActivityFeed } from '@/components/dashboard/activity-feed'

import { useTranslations } from 'next-intl'

type RangeDays = 7 | 30 | 90

export default function DashboardPage() {
  const t = useTranslations('Dashboard.page')
  const { defaultCurrency, hasCrm11Feature, accountId } = useAuth()
  const crm11 = hasCrm11Feature('crm11_dashboard')

  const [filters, setFilters] = useState<DashboardFilters>({
    period: 'today',
    channel: 'whatsapp',
  })
  const [agents, setAgents] = useState<Array<{ id: string; full_name: string | null }>>([])
  const [locations, setLocations] = useState<Array<{ id: string; name: string }>>([])

  const [metrics, setMetrics] = useState<MetricsBundle | null>(null)
  const [metricsLoading, setMetricsLoading] = useState(true)

  const [range, setRange] = useState<RangeDays>(30)
  const [series, setSeries] = useState<Record<RangeDays, ConversationsSeriesPoint[] | null>>({
    7: null,
    30: null,
    90: null,
  })
  const [seriesLoading, setSeriesLoading] = useState(true)

  const [pipeline, setPipeline] = useState<PipelineDonutData | null>(null)
  const [pipelineLoading, setPipelineLoading] = useState(true)

  const [responseTime, setResponseTime] = useState<ResponseTimeSummary | null>(null)
  const [responseTimeLoading, setResponseTimeLoading] = useState(true)

  const [activity, setActivity] = useState<ActivityItem[] | null>(null)
  const [activityLoading, setActivityLoading] = useState(true)

  useEffect(() => {
    if (!accountId) return
    const db = createClient()
    void db
      .from('profiles')
      .select('id, full_name')
      .eq('account_id', accountId)
      .then(({ data }) => setAgents((data as typeof agents) ?? []))
    if (hasCrm11Feature('crm11_locations')) {
      void db
        .from('locations')
        .select('id, name')
        .eq('account_id', accountId)
        .eq('is_active', true)
        .then(({ data }) => setLocations((data as typeof locations) ?? []))
    }
  }, [accountId, hasCrm11Feature])

  const loadAll = useCallback(() => {
    const db = createClient()

    void loadMetrics(db, filters)
      .then((m) => setMetrics(m))
      .catch((err) => console.error('[dashboard] metrics failed:', err))
      .finally(() => setMetricsLoading(false))

    void loadConversationsSeries(db, 30)
      .then((s) => setSeries((prev) => ({ ...prev, 30: s })))
      .catch((err) => console.error('[dashboard] series failed:', err))
      .finally(() => setSeriesLoading(false))

    void loadPipelineDonut(db)
      .then((p) => setPipeline(p))
      .catch((err) => console.error('[dashboard] pipeline failed:', err))
      .finally(() => setPipelineLoading(false))

    void loadResponseTime(db)
      .then((r) => setResponseTime(r))
      .catch((err) => console.error('[dashboard] response time failed:', err))
      .finally(() => setResponseTimeLoading(false))

    void loadActivity(db, 50)
      .then((a) => setActivity(a))
      .catch((err) => console.error('[dashboard] activity failed:', err))
      .finally(() => setActivityLoading(false))
  }, [filters])

  useEffect(() => {
    setMetricsLoading(true)
    loadAll()
  }, [loadAll])

  const handleRangeChange = useCallback(
    (r: RangeDays) => {
      setRange(r)
      if (series[r] !== null) return
      setSeriesLoading(true)
      const db = createClient()
      loadConversationsSeries(db, r)
        .then((s) => setSeries((prev) => ({ ...prev, [r]: s })))
        .catch((err) => console.error('[dashboard] series failed:', err))
        .finally(() => setSeriesLoading(false))
    },
    [series],
  )

  const periods: { id: DashboardPeriod; label: string }[] = [
    { id: 'today', label: t('filterToday') },
    { id: 'yesterday', label: t('filterYesterday') },
    { id: 'last7', label: t('filterLast7') },
    { id: 'month', label: t('filterMonth') },
  ]

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t('title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('description')}
          </p>
        </div>
        {crm11 && (
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-md border border-border p-0.5">
              {periods.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setFilters((f) => ({ ...f, period: p.id }))}
                  className={`rounded px-2.5 py-1 text-xs font-medium ${
                    filters.period === p.id
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <select
              className="h-8 rounded-md border border-border bg-background px-2 text-xs"
              value={filters.assigneeId ?? ''}
              onChange={(e) =>
                setFilters((f) => ({
                  ...f,
                  assigneeId: e.target.value || null,
                }))
              }
            >
              <option value="">{t('filterAllAgents')}</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.full_name || a.id.slice(0, 8)}
                </option>
              ))}
            </select>
            {locations.length > 0 && (
              <select
                className="h-8 rounded-md border border-border bg-background px-2 text-xs"
                value={filters.locationId ?? ''}
                onChange={(e) =>
                  setFilters((f) => ({
                    ...f,
                    locationId: e.target.value || null,
                  }))
                }
              >
                <option value="">{t('filterAllLocations')}</option>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {metricsLoading || !metrics ? (
          Array.from({ length: crm11 ? 8 : 4 }).map((_, i) => <SkeletonCard key={i} />)
        ) : (
          <>
            <MetricCard
              title={t('newContactsToday')}
              value={metrics.newContactsToday.current.toLocaleString()}
              icon={UserPlus}
              delta={{
                sign:
                  metrics.newContactsToday.current - metrics.newContactsToday.previous,
                label: deltaLabel(
                  metrics.newContactsToday.current - metrics.newContactsToday.previous,
                  t('vsYesterday'),
                  t('noChange', { suffix: t('vsYesterday') }),
                ),
              }}
            />
            {crm11 ? (
              <>
                <MetricCard
                  title={t('waitingTeam')}
                  value={(metrics.waitingTeam ?? 0).toLocaleString()}
                  icon={Inbox}
                  subtitle={t('waitingTeamHint')}
                />
                <MetricCard
                  title={t('slaBreached')}
                  value={(metrics.slaBreached ?? 0).toLocaleString()}
                  icon={AlertTriangle}
                  subtitle={t('slaBreachedHint')}
                />
                <MetricCard
                  title={t('appointmentsToday')}
                  value={(metrics.appointmentsToday ?? 0).toLocaleString()}
                  icon={Calendar}
                  subtitle={t('appointmentsUnconfirmed', {
                    count: metrics.appointmentsUnconfirmed ?? 0,
                  })}
                />
                <MetricCard
                  title={t('activeDeals')}
                  value={(metrics.activeDeals ?? metrics.openDealsCount).toLocaleString()}
                  icon={Handshake}
                  subtitle={formatCurrency(metrics.openDealsValue, defaultCurrency)}
                />
                <MetricCard
                  title={t('separations')}
                  value={(metrics.separations ?? 0).toLocaleString()}
                  icon={Clock}
                />
                <MetricCard
                  title={t('wonThisMonth')}
                  value={(metrics.wonThisMonth ?? 0).toLocaleString()}
                  icon={Trophy}
                  subtitle={formatCurrency(metrics.wonThisMonthValue ?? 0, defaultCurrency)}
                />
                <MetricCard
                  title={t('activeConversations')}
                  value={metrics.activeConversations.current.toLocaleString()}
                  icon={MessageSquare}
                />
              </>
            ) : (
              <>
                <MetricCard
                  title={t('activeConversations')}
                  value={metrics.activeConversations.current.toLocaleString()}
                  icon={MessageSquare}
                  delta={{
                    sign: metrics.activeConversations.previous,
                    label: deltaLabel(
                      metrics.activeConversations.previous,
                      t('newTodayVsYesterday'),
                      t('noChange', { suffix: t('newTodayVsYesterday') }),
                    ),
                  }}
                />
                <MetricCard
                  title={t('openDealsValue')}
                  value={formatCurrency(metrics.openDealsValue, defaultCurrency)}
                  icon={DollarSign}
                  subtitle={t('openDeals', { count: metrics.openDealsCount })}
                />
                <MetricCard
                  title={t('messagesSentToday')}
                  value={metrics.messagesSentToday.current.toLocaleString()}
                  icon={MessageSquare}
                  delta={{
                    sign:
                      metrics.messagesSentToday.current -
                      metrics.messagesSentToday.previous,
                    label: deltaLabel(
                      metrics.messagesSentToday.current -
                        metrics.messagesSentToday.previous,
                      t('vsYesterday'),
                      t('noChange', { suffix: t('vsYesterday') }),
                    ),
                  }}
                />
              </>
            )}
          </>
        )}
      </div>

      <QuickActions />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <div className="h-full lg:col-span-3">
          <ConversationsChart
            series={series}
            loading={seriesLoading}
            range={range}
            onRangeChange={handleRangeChange}
          />
        </div>
        <div className="h-full lg:col-span-2">
          <PipelineDonut
            data={pipeline}
            loading={pipelineLoading}
            currency={defaultCurrency}
          />
        </div>
      </div>

      <ResponseTimeChart data={responseTime} loading={responseTimeLoading} />

      <ActivityFeed items={activity} loading={activityLoading} />
    </div>
  )
}

function deltaLabel(delta: number, suffix: string, noChangeLabel: string): string {
  if (delta === 0) return noChangeLabel
  const sign = delta > 0 ? '+' : ''
  return `${sign}${delta.toLocaleString()} ${suffix}`
}
