import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import Link from 'next/link'
import {
  MessageSquare,
  GitBranch,
  Workflow,
  BarChart3,
  CreditCard,
  FileSignature,
  CheckCircle2,
} from 'lucide-react'
import { FEATURE_GATING_ENABLED } from '@/lib/features'

// Client deployments (AshWheelz, Sultan, Qissah) are invite-only,
// white-labeled tools for one specific business's team — they have no
// public marketing surface, so `/` keeps redirecting straight into the
// app exactly as before. Only Scale Agency's own (unrestricted)
// deployment gets a real landing page here.
export const metadata: Metadata = {
  robots: { index: true, follow: true },
}

const FEATURES = [
  { icon: MessageSquare, title: 'WhatsApp inbox', desc: 'Team inbox for every conversation, official Meta API, no ban risk.' },
  { icon: GitBranch, title: 'Pipelines & leads', desc: 'Track deals from first message to won, with lead scoring built in.' },
  { icon: Workflow, title: 'Automations & flows', desc: 'Drip campaigns, booking, automated replies — visually built, no code.' },
  { icon: BarChart3, title: 'Analytics that matter', desc: 'Response time, resolution rate, revenue attributed to WhatsApp.' },
  { icon: FileSignature, title: 'Contracts built in', desc: 'Upload, send, and track agreements without leaving the CRM.' },
  { icon: CreditCard, title: 'Billing, sorted', desc: 'Plans, usage limits, and local payment methods for Pakistani teams.' },
]

export default function RootPage() {
  if (FEATURE_GATING_ENABLED) {
    redirect('/dashboard')
  }

  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between px-6 py-5 sm:px-10">
        <span className="font-display text-lg font-bold text-foreground">the scale agency™</span>
        <nav className="flex items-center gap-4 text-sm">
          <Link href="/pricing" className="text-muted-foreground hover:text-foreground transition-colors">Pricing</Link>
          <Link href="/login" className="text-muted-foreground hover:text-foreground transition-colors">Sign in</Link>
          <Link
            href="/signup"
            className="rounded-lg bg-primary px-4 py-2 font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Get started
          </Link>
        </nav>
      </header>

      <section className="mx-auto max-w-4xl px-6 pt-16 pb-20 text-center sm:pt-24">
        <h1 className="font-display text-4xl font-bold tracking-tight text-foreground sm:text-6xl">
          Scale smarter. <span className="text-primary">Close faster.</span>
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-lg text-muted-foreground">
          Your WhatsApp CRM — built for teams that move fast and convert faster. Official Meta API,
          zero ban risk, live in minutes.
        </p>
        <div className="mt-8 flex items-center justify-center gap-3">
          <Link
            href="/signup"
            className="rounded-lg bg-primary px-6 py-3 font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Start free
          </Link>
          <Link
            href="/pricing"
            className="rounded-lg border border-border px-6 py-3 font-semibold text-foreground hover:bg-muted transition-colors"
          >
            See pricing
          </Link>
        </div>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-primary" />100% WhatsApp native</span>
          <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-primary" />Real-time inbox</span>
          <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-primary" />n8n automation ready</span>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-6 pb-24">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-xl border border-border bg-card p-5">
              <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                <f.icon className="h-4.5 w-4.5 text-primary" />
              </div>
              <p className="text-sm font-semibold text-foreground">{f.title}</p>
              <p className="mt-1 text-xs text-muted-foreground">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-border px-6 py-8 text-center text-xs text-muted-foreground">
        Powered by The Scale Agency
      </footer>
    </div>
  )
}
