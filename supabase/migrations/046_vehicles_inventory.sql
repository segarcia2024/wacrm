-- ============================================================
-- VEHICLE INVENTORY — stock central por cuenta
-- ============================================================
-- Idempotent. Safe to re-run.
--
-- Policies:
--   SELECT  → cualquier miembro de la cuenta (asesores seleccionan luego)
--   WRITE   → admin+ (owner/admin cargan el inventario)
--
-- deals.vehicle_id es nullable y aditivo: el flujo actual (título texto)
-- no se rompe. El selector inbox/pipeline y el hook won→sold vienen después.

CREATE TABLE IF NOT EXISTS vehicles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plate TEXT NOT NULL,
  make TEXT NOT NULL,
  model TEXT NOT NULL,
  -- Upper bound validated in app (isValidVehicleYear); DB keeps a stable ceiling.
  year INTEGER NOT NULL
    CHECK (year >= 1950 AND year <= 2100),
  price BIGINT NOT NULL DEFAULT 0 CHECK (price >= 0),
  mileage INTEGER CHECK (mileage IS NULL OR mileage >= 0),
  status TEXT NOT NULL DEFAULT 'available'
    CHECK (status IN ('available', 'reserved', 'sold')),
  notes TEXT,
  -- Rellenados al marcar vendido (manual o futuro hook deal→won)
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

-- Link opcional deal → vehículo (sin romper deals existentes)
ALTER TABLE deals
  ADD COLUMN IF NOT EXISTS vehicle_id UUID REFERENCES vehicles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_deals_vehicle_id
  ON deals (vehicle_id)
  WHERE vehicle_id IS NOT NULL;
