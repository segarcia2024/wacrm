-- ============================================================
-- When a deal is marked won, mark its linked vehicle as sold
-- (seller + buyer) and close competing open deals for that car.
-- SECURITY DEFINER so agents (no vehicles UPDATE RLS) can still
-- complete the sale via deal status change.
-- ============================================================

CREATE OR REPLACE FUNCTION public.mark_vehicle_sold_on_deal_won()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_seller UUID;
BEGIN
  -- Deal newly won with a linked vehicle → sold in inventory
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

    -- Competing open deals on the same vehicle → lost
    UPDATE deals
    SET
      status = 'lost',
      updated_at = NOW()
    WHERE vehicle_id = NEW.vehicle_id
      AND id IS DISTINCT FROM NEW.id
      AND status = 'open';
  END IF;

  -- Reopen / un-win: restore stock if this deal was the sale record
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
