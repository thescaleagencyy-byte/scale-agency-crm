// ============================================================
// GET /api/appointments/ics/[token]
//
// Public — no auth required. The token itself is the secret (see
// migration 059): Google/Apple Calendar "subscribe by URL" polls
// this on its own schedule, so it can't carry a session.
//
// Returns text/calendar (RFC 5545). Escaping follows the spec's
// TEXT value rules: backslash, comma, semicolon are escaped;
// newlines become literal `\n`.
// ============================================================

import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";

interface IcsRow {
  id: string;
  start_at: string;
  end_at: string;
  status: string;
  service_name: string | null;
  contact_name: string | null;
}

function getClientIp(request: Request): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  const xri = request.headers.get("x-real-ip");
  if (xri) return xri.trim();
  return "unknown";
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;")
    .replace(/\n/g, "\\n");
}

function toIcsDate(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function buildIcs(rows: IcsRow[]): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Scale Agency CRM//Appointments//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];
  for (const row of rows) {
    const summary = escapeIcsText(row.service_name ?? "Appointment");
    const description = escapeIcsText(
      [row.contact_name ? `With: ${row.contact_name}` : null, `Status: ${row.status}`]
        .filter(Boolean)
        .join("\n"),
    );
    lines.push(
      "BEGIN:VEVENT",
      `UID:${row.id}@scale-agency-crm`,
      `DTSTAMP:${toIcsDate(new Date().toISOString())}`,
      `DTSTART:${toIcsDate(row.start_at)}`,
      `DTEND:${toIcsDate(row.end_at)}`,
      `SUMMARY:${summary}`,
      `DESCRIPTION:${description}`,
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  // RFC 5545 requires CRLF line endings.
  return lines.join("\r\n");
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const ip = getClientIp(request);
  const limit = checkRateLimit(`ics:${ip}`, RATE_LIMITS.statusPeek);
  if (!limit.success) return rateLimitResponse(limit);

  const { token } = await params;
  if (!UUID_RE.test(token)) {
    return new Response("Not found", { status: 404 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_ics_feed", { p_token: token });

  if (error) {
    console.error("[GET /api/appointments/ics/[token]] rpc error:", error);
    return new Response("Server error", { status: 500 });
  }

  const ics = buildIcs((data ?? []) as IcsRow[]);
  return new Response(ics, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="appointments.ics"',
      "Cache-Control": "public, max-age=300",
    },
  });
}
