import { X, StickyNote, Bell, MessageCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { AvatarStack } from '@/components/ui/avatar-stack';
import type { Lead } from '@/types';

interface LeadDetailPanelProps {
  lead: Lead;
  statusLabel: Record<string, string>;
  statusClass: Record<string, string>;
  statuses: Lead['status'][];
  updating: boolean;
  onClose: () => void;
  onStatusChange: (status: Lead['status']) => void;
  onOpenNotes: () => void;
  onOpenReminder: () => void;
}

// The dark detail pane from the reference image — sits beside the light
// list panel, always dark regardless of page mode (same trick the
// dashboard hero's messaging callout already uses: bg-zinc-900 +
// shadow-elevated, independent of light/dark mode toggle).
export function LeadDetailPanel({
  lead,
  statusLabel,
  statusClass,
  statuses,
  updating,
  onClose,
  onStatusChange,
  onOpenNotes,
  onOpenReminder,
}: LeadDetailPanelProps) {
  const factors = lead.score_factors ? Object.entries(lead.score_factors) : [];

  return (
    <div className="relative flex h-full flex-col overflow-hidden rounded-3xl bg-zinc-900 text-white shadow-elevated">
      <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-primary opacity-[0.14] blur-[60px]" />

      <div className="relative flex items-start justify-between gap-3 border-b border-white/10 p-5">
        <div className="flex items-center gap-3">
          <AvatarStack
            size="md"
            avatars={[{ label: lead.customer_name || lead.customer_phone || '?' }]}
          />
          <div>
            <p className="font-heading text-base font-semibold leading-tight">
              {lead.customer_name || 'Unnamed lead'}
            </p>
            <p className="text-xs text-white/50">{lead.customer_phone}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close lead detail"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white/50 hover:bg-white/10 hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="relative flex-1 space-y-5 overflow-y-auto p-5">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className={`text-xs ${statusClass[lead.status] ?? ''}`}>
            {statusLabel[lead.status] ?? lead.status}
          </Badge>
          <span className="rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white/80">
            Score {lead.score ?? 0}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
          <Field label="Service" value={lead.service_type} />
          <Field label="Site" value={lead.project_site} />
          <Field label="Duration" value={lead.duration} />
          <Field label="Quantity" value={lead.quantity} />
          <Field label="Company" value={lead.company} />
          <Field label="Source" value={lead.source?.replace(/_/g, ' ')} />
        </div>

        {factors.length > 0 && (
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/40">
              Score breakdown
            </p>
            <div className="space-y-1.5 rounded-2xl bg-white/5 p-3">
              {factors.map(([key, value]) => (
                <div key={key} className="flex items-center justify-between text-xs">
                  <span className="capitalize text-white/70">{key.replace(/_/g, ' ')}</span>
                  <span className="font-semibold tabular-nums">{value > 0 ? '+' : ''}{value}</span>
                </div>
              ))}
              <div className="mt-1.5 flex items-center justify-between border-t border-white/10 pt-1.5 text-xs font-bold">
                <span>Total</span>
                <span className="tabular-nums">{lead.score ?? 0}</span>
              </div>
            </div>
          </div>
        )}

        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/40">
            Captured
          </p>
          <p className="text-xs text-white/70">
            {new Date(lead.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}
          </p>
        </div>
      </div>

      <div className="relative shrink-0 space-y-3 border-t border-white/10 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onOpenNotes}
            className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium text-white/80 hover:bg-white/15"
          >
            <StickyNote className="h-3.5 w-3.5" />
            Notes
          </button>
          <button
            type="button"
            onClick={onOpenReminder}
            className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium text-white/80 hover:bg-white/15"
          >
            <Bell className="h-3.5 w-3.5" />
            Reminder
          </button>
          {lead.conversation_id && (
            <a
              href={`/inbox?c=${lead.conversation_id}`}
              className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium text-white/80 hover:bg-white/15"
            >
              <MessageCircle className="h-3.5 w-3.5" />
              Conversation
            </a>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {statuses.filter((s) => s !== lead.status).map((s) => (
            <button
              key={s}
              type="button"
              disabled={updating}
              onClick={() => onStatusChange(s)}
              className="inline-flex items-center gap-1 rounded-full bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-foreground transition-transform hover:scale-[1.03] active:scale-[0.98] disabled:opacity-50"
            >
              Mark {statusLabel[s]}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-white/40">{label}</p>
      <p className="mt-0.5 text-sm text-white/90">{value || '—'}</p>
    </div>
  );
}
