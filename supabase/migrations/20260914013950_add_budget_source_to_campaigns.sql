-- Add budget_source column to indicate if the budget is native campaign budget or aggregated from ad sets
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS budget_source text;
