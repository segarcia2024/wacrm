'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import {
  CRM11_FLAGS,
  type Crm11Flag,
  type FeatureFlags,
} from '@/lib/crm11/feature-flags';
import { SettingsPanelHead } from '@/components/settings/settings-panel-head';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

const FLAG_LABELS: Record<Crm11Flag, { title: string; desc: string }> = {
  crm11_dashboard: {
    title: 'Panel comercial 1.1',
    desc: 'Tarjetas corregidas, filtros por periodo/asesor/sede.',
  },
  crm11_inbox_ops: {
    title: 'Bandeja operativa',
    desc: 'Filtros SLA, estados operativos y botón Resolver.',
  },
  crm11_funnel: {
    title: 'Embudo mejorado',
    desc: 'Etapas nuevas solo para negocios nuevos; vista históricos.',
  },
  crm11_sla: {
    title: 'Alertas SLA',
    desc: 'Notificaciones a 5/10/15 min sin reasignar.',
  },
  crm11_locations: {
    title: 'Sedes',
    desc: 'Filtros y asignación por sede (opcional).',
  },
  crm11_required_fields: {
    title: 'Campos obligatorios',
    desc: 'Bloquear movimientos incompletos (después de advertencias).',
  },
};

export function Crm11Settings() {
  const { accountId, canEditSettings, refreshProfile } = useAuth();
  const [flags, setFlags] = useState<FeatureFlags>({});
  const [locations, setLocations] = useState<
    Array<{ id: string; name: string; is_active: boolean }>
  >([]);
  const [newLocation, setNewLocation] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!accountId) return;
    const db = createClient();
    setLoading(true);
    const { data: acc } = await db
      .from('accounts')
      .select('feature_flags')
      .eq('id', accountId)
      .maybeSingle();
    setFlags((acc?.feature_flags as FeatureFlags) ?? {});
    const { data: locs } = await db
      .from('locations')
      .select('id, name, is_active')
      .eq('account_id', accountId)
      .order('name');
    setLocations((locs as typeof locations) ?? []);
    setLoading(false);
  }, [accountId]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleFlag = async (flag: Crm11Flag, value: boolean) => {
    if (!accountId || !canEditSettings) return;
    setSaving(true);
    const next = { ...flags, [flag]: value };
    const db = createClient();
    const { error } = await db
      .from('accounts')
      .update({ feature_flags: next })
      .eq('id', accountId);
    setSaving(false);
    if (error) {
      toast.error('No se pudo guardar el flag');
      console.error(error);
      return;
    }
    setFlags(next);
    await refreshProfile();
    toast.success(value ? `${FLAG_LABELS[flag].title} activado` : 'Desactivado');
  };

  const addLocation = async () => {
    if (!accountId || !newLocation.trim() || !canEditSettings) return;
    const db = createClient();
    const { error } = await db.from('locations').insert({
      account_id: accountId,
      name: newLocation.trim(),
    });
    if (error) {
      toast.error(error.message.includes('unique')
        ? 'Ya existe una sede con ese nombre'
        : 'No se pudo crear la sede');
      return;
    }
    setNewLocation('');
    await load();
    toast.success('Sede creada');
  };

  if (!canEditSettings) {
    return (
      <div className="rounded-lg border border-border p-6 text-sm text-muted-foreground">
        Solo administradores pueden gestionar CRM 1.1.
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <SettingsPanelHead
        title="CRM 1.1 — activación gradual"
        description="Activa cada mejora por separado. Desactivar un flag vuelve al comportamiento anterior sin borrar datos."
      />

      {loading ? (
        <p className="text-sm text-muted-foreground">Cargando…</p>
      ) : (
        <ul className="space-y-3">
          {CRM11_FLAGS.map((flag) => (
            <li
              key={flag}
              className="flex items-start justify-between gap-4 rounded-lg border border-border p-4"
            >
              <div>
                <p className="text-sm font-medium text-foreground">
                  {FLAG_LABELS[flag].title}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {FLAG_LABELS[flag].desc}
                </p>
                <code className="mt-1 block text-[10px] text-muted-foreground">
                  {flag}
                </code>
              </div>
              <button
                type="button"
                disabled={saving}
                onClick={() => toggleFlag(flag, !flags[flag])}
                className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                  flags[flag] ? 'bg-primary' : 'bg-muted'
                }`}
                aria-pressed={!!flags[flag]}
              >
                <span
                  className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                    flags[flag] ? 'translate-x-5' : ''
                  }`}
                />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground">Sedes</h3>
        <p className="text-xs text-muted-foreground">
          Opcionales. Los registros históricos quedan sin sede hasta asignarlos.
        </p>
        <ul className="space-y-1">
          {locations.map((l) => (
            <li
              key={l.id}
              className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm"
            >
              <span>{l.name}</span>
              <span className="text-xs text-muted-foreground">
                {l.is_active ? 'Activa' : 'Inactiva'}
              </span>
            </li>
          ))}
          {locations.length === 0 && (
            <li className="text-xs text-muted-foreground">Aún no hay sedes.</li>
          )}
        </ul>
        <div className="flex gap-2">
          <Input
            value={newLocation}
            onChange={(e) => setNewLocation(e.target.value)}
            placeholder="Nombre de la sede"
            className="max-w-xs"
          />
          <Button type="button" onClick={() => void addLocation()} size="sm">
            Agregar sede
          </Button>
        </div>
      </div>
    </div>
  );
}
