import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Count outbound WhatsApp messages (agent + bot sends) for an account
 * since the start of the current calendar month. Used against
 * `PLAN_LIMITS[plan].monthlyMessages` — see @/lib/billing/plans.
 *
 * Filters through `conversations!inner(account_id)` because `messages`
 * itself has no `account_id` column (only `conversation_id`).
 */
export async function countMonthlyOutboundMessages(
  supabase: SupabaseClient,
  accountId: string,
): Promise<number> {
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const { count, error } = await supabase
    .from("messages")
    .select("id, conversation:conversations!inner(account_id)", {
      count: "exact",
      head: true,
    })
    .eq("conversation.account_id", accountId)
    .in("sender_type", ["agent", "bot"])
    .gte("created_at", startOfMonth.toISOString());

  if (error) throw error;
  return count ?? 0;
}

/** Current member count for an account, against `PLAN_LIMITS[plan].seats`. */
export async function countAccountSeats(
  supabase: SupabaseClient,
  accountId: string,
): Promise<number> {
  const { count, error } = await supabase
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("account_id", accountId);

  if (error) throw error;
  return count ?? 0;
}
