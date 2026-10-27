CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE availability_slots
ADD CONSTRAINT availability_slots_no_overlapping_active_slots
EXCLUDE USING gist (
    doctor_id WITH =,
    tstzrange(starts_at, ends_at, '[)') WITH &&
)
WHERE (status <> 'BLOCKED');
