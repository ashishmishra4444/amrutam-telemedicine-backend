CREATE UNIQUE INDEX payments_one_pending_per_consultation
ON payments (consultation_id)
WHERE status = 'PENDING';