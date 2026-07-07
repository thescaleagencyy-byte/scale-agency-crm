import { CLIENT_INDUSTRY } from './features'

/**
 * Lead status lifecycle, keyed by industry — mirrors the pattern in
 * industry-terms.ts. The DB constraint (leads_status_check) accepts
 * the union of every branch below; each deployment's UI only ever
 * shows and writes its own subset, so different clients on the same
 * template never see each other's stage names.
 *
 * Rental clients need the "quote given" vs "equipment is actually
 * out on site" distinction that a generic new/called/won/lost
 * pipeline collapses into one bucket — see migration 049.
 */
export interface LeadStatusMeta {
  id: string
  label: string
  className: string
}

const RENTAL_STATUSES: readonly LeadStatusMeta[] = [
  { id: 'new',       label: 'New',       className: 'bg-blue-500/15 text-blue-600 border-blue-500/30' },
  { id: 'quoted',    label: 'Quoted',    className: 'bg-yellow-500/15 text-yellow-600 border-yellow-500/30' },
  { id: 'confirmed', label: 'Confirmed', className: 'bg-cyan-500/15 text-cyan-600 border-cyan-500/30' },
  { id: 'on_rent',   label: 'On Rent',   className: 'bg-green-500/15 text-green-600 border-green-500/30' },
  { id: 'returned',  label: 'Returned',  className: 'bg-muted text-muted-foreground border-border' },
  { id: 'lost',      label: 'Lost',      className: 'bg-red-500/15 text-red-600 border-red-500/30' },
]

const GENERIC_STATUSES: readonly LeadStatusMeta[] = [
  { id: 'new',    label: 'New',    className: 'bg-blue-500/15 text-blue-600 border-blue-500/30' },
  { id: 'called', label: 'Called', className: 'bg-yellow-500/15 text-yellow-600 border-yellow-500/30' },
  { id: 'won',    label: 'Won',    className: 'bg-green-500/15 text-green-600 border-green-500/30' },
  { id: 'lost',   label: 'Lost',   className: 'bg-red-500/15 text-red-600 border-red-500/30' },
]

export function getLeadStatuses(): readonly LeadStatusMeta[] {
  const ind = CLIENT_INDUSTRY.toLowerCase()
  if (ind.includes('logistic') || ind.includes('transport') || ind.includes('car') || ind.includes('wheel')) {
    return RENTAL_STATUSES
  }
  return GENERIC_STATUSES
}
