-- Multi-workspace allows one user to own multiple accounts.
-- The unique constraint idx_accounts_one_per_owner blocks this.
DROP INDEX IF EXISTS idx_accounts_one_per_owner;
