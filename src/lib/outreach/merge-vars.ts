interface MergeSource {
  name?: string | null
  company?: string | null
}

// Trivial {{first_name}} / {{company}} substitution — no templating
// engine needed for two variables. Missing values fall back to
// something that still reads as a sentence rather than a blank.
export function applyMergeVars(template: string, prospect: MergeSource): string {
  const firstName = prospect.name?.trim().split(/\s+/)[0] || 'there'
  const company = prospect.company?.trim() || 'your business'
  return template
    .replaceAll('{{first_name}}', firstName)
    .replaceAll('{{company}}', company)
}
