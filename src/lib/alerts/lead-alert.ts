// Real-time "a real lead needs you" ping — reuses the exact
// fire-and-forget webhook pattern already shipped in
// api/billing/request-upgrade/route.ts, extending the same n8n
// workflow (Upgrade Request Alert) with a second event type rather
// than standing up a new workflow. No new env vars.
//
// Delivery depends on that workflow's Format Alert node having a real
// admin number and Send-via-WhatsApp-API node having a real
// credential attached — both still placeholder as of this session.
// This function ships regardless; it just won't reach a phone until
// that n8n-side config is filled in.

export interface LeadAlertEvent {
  type: "qualified" | "escalated";
  accountName: string;
  contactName: string;
  contactPhone: string;
  conversationId: string;
}

export function triggerLeadAlert(event: LeadAlertEvent): void {
  const webhookUrl = process.env.N8N_UPGRADE_WEBHOOK_URL;
  const webhookSecret = process.env.N8N_UPGRADE_WEBHOOK_SECRET;
  if (!webhookUrl || !webhookSecret) return;

  fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-webhook-secret": webhookSecret },
    body: JSON.stringify({
      eventType: event.type === "qualified" ? "qualified_lead" : "escalation",
      accountName: event.accountName,
      contactName: event.contactName,
      contactPhone: event.contactPhone,
      conversationId: event.conversationId,
    }),
  }).catch((err) => {
    console.error("[triggerLeadAlert] webhook failed:", err);
  });
}
