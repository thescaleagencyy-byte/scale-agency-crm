-- Won/lost reason tracking on deals
ALTER TABLE deals
  ADD COLUMN IF NOT EXISTS close_reason TEXT,
  ADD COLUMN IF NOT EXISTS close_reason_notes TEXT,
  ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;

-- Stage probability for revenue forecasting (0-100)
ALTER TABLE pipeline_stages
  ADD COLUMN IF NOT EXISTS probability INTEGER NOT NULL DEFAULT 20
  CHECK (probability BETWEEN 0 AND 100);

-- Set sensible defaults by position (overridable by user)
-- position 0 = 20%, 1 = 40%, 2 = 60%, 3 = 80%
UPDATE pipeline_stages SET probability = CASE
  WHEN position = 0 THEN 20
  WHEN position = 1 THEN 40
  WHEN position = 2 THEN 60
  WHEN position = 3 THEN 80
  ELSE 50
END;
