-- Make service_id optional on booking_slots so appointments can be
-- created without a service being defined first.
ALTER TABLE booking_slots ALTER COLUMN service_id DROP NOT NULL;
ALTER TABLE appointments ALTER COLUMN service_id DROP NOT NULL;
