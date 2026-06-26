interface LeadFields {
  service_type?: string | null;
  project_site?: string | null;
  duration?: string | null;
  quantity?: string | null;
  company?: string | null;
  customer_name?: string | null;
}

export interface ScoreResult {
  score: number;
  factors: Record<string, number>;
}

export function scoreLead(lead: LeadFields): ScoreResult {
  const factors: Record<string, number> = {};

  if (lead.customer_name?.trim()) factors.has_name = 10;
  if (lead.service_type?.trim()) factors.has_service_type = 20;
  if (lead.project_site?.trim()) factors.has_project_site = 15;
  if (lead.duration?.trim()) factors.has_duration = 15;
  if (lead.quantity?.trim()) factors.has_quantity = 15;
  if (lead.company?.trim()) factors.has_company = 25;

  const score = Math.min(100, Object.values(factors).reduce((a, b) => a + b, 0));
  return { score, factors };
}
