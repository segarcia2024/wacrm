-- ============================================================
-- REVIO CRM — Aplicar inventario de vehículos (046 + 047)
-- Pegar completo en: Supabase Dashboard → SQL Editor → Run
-- Proyecto: https://supabase.com/dashboard/project/bhczfxjcmsuapujprgfd/sql/new
-- Idempotente: seguro re-ejecutar.
-- ============================================================

-- ---- 046: vehicles + deals.vehicle_id ----
CREATE TABLE IF NOT EXISTS vehicles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plate TEXT NOT NULL,
  make TEXT NOT NULL,
  model TEXT NOT NULL,
  year INTEGER NOT NULL
    CHECK (year >= 1950 AND year <= 2100),
  price BIGINT NOT NULL DEFAULT 0 CHECK (price >= 0),
  mileage INTEGER CHECK (mileage IS NULL OR mileage >= 0),
  status TEXT NOT NULL DEFAULT 'available'
    CHECK (status IN ('available', 'reserved', 'sold')),
  notes TEXT,
  sold_at TIMESTAMPTZ,
  sold_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  buyer_contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  sold_deal_id UUID REFERENCES deals(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT vehicles_plate_account_unique UNIQUE (account_id, plate)
);

CREATE INDEX IF NOT EXISTS idx_vehicles_account_status
  ON vehicles (account_id, status);
CREATE INDEX IF NOT EXISTS idx_vehicles_account_make_model
  ON vehicles (account_id, make, model);
CREATE INDEX IF NOT EXISTS idx_vehicles_account_plate
  ON vehicles (account_id, plate);

DROP TRIGGER IF EXISTS set_updated_at ON vehicles;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON vehicles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS vehicles_select ON vehicles;
DROP POLICY IF EXISTS vehicles_insert ON vehicles;
DROP POLICY IF EXISTS vehicles_update ON vehicles;
DROP POLICY IF EXISTS vehicles_delete ON vehicles;

CREATE POLICY vehicles_select ON vehicles FOR SELECT
  USING (is_account_member(account_id));

CREATE POLICY vehicles_insert ON vehicles FOR INSERT
  WITH CHECK (is_account_member(account_id, 'admin'));

CREATE POLICY vehicles_update ON vehicles FOR UPDATE
  USING (is_account_member(account_id, 'admin'));

CREATE POLICY vehicles_delete ON vehicles FOR DELETE
  USING (is_account_member(account_id, 'admin'));

ALTER TABLE deals
  ADD COLUMN IF NOT EXISTS vehicle_id UUID REFERENCES vehicles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_deals_vehicle_id
  ON deals (vehicle_id)
  WHERE vehicle_id IS NOT NULL;

-- ---- 047: won → sold trigger ----
CREATE OR REPLACE FUNCTION public.mark_vehicle_sold_on_deal_won()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_seller UUID;
BEGIN
  IF NEW.status = 'won'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'won')
     AND NEW.vehicle_id IS NOT NULL THEN

    v_seller := NEW.assigned_to;
    IF v_seller IS NULL THEN
      SELECT p.id INTO v_seller
      FROM profiles p
      WHERE p.user_id = NEW.user_id
      LIMIT 1;
    END IF;

    UPDATE vehicles
    SET
      status = 'sold',
      sold_at = COALESCE(sold_at, NOW()),
      sold_by = v_seller,
      buyer_contact_id = NEW.contact_id,
      sold_deal_id = NEW.id,
      updated_at = NOW()
    WHERE id = NEW.vehicle_id;

    UPDATE deals
    SET
      status = 'lost',
      updated_at = NOW()
    WHERE vehicle_id = NEW.vehicle_id
      AND id IS DISTINCT FROM NEW.id
      AND status = 'open';
  END IF;

  IF TG_OP = 'UPDATE'
     AND OLD.status = 'won'
     AND NEW.status IS DISTINCT FROM 'won'
     AND COALESCE(NEW.vehicle_id, OLD.vehicle_id) IS NOT NULL THEN

    UPDATE vehicles
    SET
      status = 'available',
      sold_at = NULL,
      sold_by = NULL,
      buyer_contact_id = NULL,
      sold_deal_id = NULL,
      updated_at = NOW()
    WHERE id = COALESCE(NEW.vehicle_id, OLD.vehicle_id)
      AND sold_deal_id = OLD.id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS deals_mark_vehicle_sold ON deals;
CREATE TRIGGER deals_mark_vehicle_sold
  AFTER INSERT OR UPDATE OF status, vehicle_id, assigned_to, contact_id
  ON deals
  FOR EACH ROW
  EXECUTE FUNCTION public.mark_vehicle_sold_on_deal_won();

-- Verificación
SELECT
  to_regclass('public.vehicles') AS vehicles_table,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'deals' AND column_name = 'vehicle_id'
  ) AS has_vehicle_id,
  EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'deals_mark_vehicle_sold'
  ) AS has_trigger;
