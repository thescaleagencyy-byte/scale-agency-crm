-- Fix accounts SELECT policy to include memberships from account_memberships table.
-- Without this, the workspaces panel can only see the active account (profiles.account_id),
-- not other accounts the user belongs to via account_memberships.
DROP POLICY IF EXISTS accounts_select ON accounts;
CREATE POLICY accounts_select ON accounts FOR SELECT
  USING (
    is_account_member(id)
    OR EXISTS (
      SELECT 1 FROM account_memberships am
      WHERE am.account_id = id AND am.user_id = auth.uid()
    )
  );

-- Also allow INSERT so create_workspace RPC (SECURITY DEFINER) can insert rows.
-- The RPC already bypasses RLS via SECURITY DEFINER; this is a safety valve
-- for any direct admin inserts.
DROP POLICY IF EXISTS accounts_insert ON accounts;
CREATE POLICY accounts_insert ON accounts FOR INSERT
  WITH CHECK (owner_user_id = auth.uid());
