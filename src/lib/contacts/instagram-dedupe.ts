import type { SupabaseClient } from "@supabase/supabase-js";
import type { ExistingContact } from "./dedupe";

/**
 * Find an existing contact in `accountId` whose instagram_id exactly
 * matches `instagramId`, or null. Unlike findExistingContact (phone),
 * this is a plain exact match — no normalization/fuzzy-suffix step,
 * since an IGSID has no formatting variants to reconcile.
 */
export async function findExistingInstagramContact(
  db: SupabaseClient,
  accountId: string,
  instagramId: string,
): Promise<ExistingContact | null> {
  if (!instagramId) return null;

  const { data, error } = await db
    .from("contacts")
    .select("*")
    .eq("account_id", accountId)
    .eq("instagram_id", instagramId)
    .maybeSingle();

  if (error || !data) return null;
  return data as ExistingContact;
}
