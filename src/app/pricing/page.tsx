import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import Link from 'next/link'
import { Check } from 'lucide-react'
import { PLAN_LIMITS, UNLIMITED } from '@/lib/billing/plans'
import { FEATURE_GATING_ENABLED } from '@/lib/features'

export const metadata: Metadata = {
  title: 'Pricing',
  robots: { index: true, follow: true },
}

function fmtLimit(n: number): string {
  return n === UNLIMITED ? 'Unlimited' : n.toLocaleString()
}

const PLAN_COPY: Record<string, { tagline: string; highlights: string[] }> = {
  free: {
    tagline: 'Try the CRM with your own WhatsApp number.',
    highlights: ['Inbox, contacts, pipelines', 'Basic automations', 'Community support'],
  },
  starter: {
    tagline: 'For a small team getting serious about WhatsApp.',
    highlights: ['Everything in Free', 'Contracts & e-sign', 'Booking & calendar feed'],
  },
  growth: {
    tagline: 'For teams running real volume across channels.',
    highlights: ['Everything in Starter', 'Analytics & AI insights', 'Priority support'],
  },
  enterprise: {
    tagline: 'Custom limits, dedicated support, tailored setup.',
    highlights: ['Everything in Growth', 'Unlimited seats & messages', 'Dedicated onboarding'],
  },
}

const PLAN_ORDER = ['free', 'starter', 'growth', 'enterprise'] as const

export default function PricingPage() {
  // Client deployments have no public marketing surface — same gate
  // as the root landing page.
  if (FEATURE_GATING_ENABLED) {
    redirect('/dashboard')
  }

  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between px-6 py-5 sm:px-10">
        <Link href="/" className="font-display text-lg font-bold text-foreground">the scale agency™</Link>
        <nav className="flex items-center gap-4 text-sm">
          <Link href="/login" className="text-muted-foreground hover:text-foreground transition-colors">Sign in</Link>
          <Link
            href="/signup"
            className="rounded-lg bg-primary px-4 py-2 font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Get started
          </Link>
        </nav>
      </header>

      <section className="mx-auto max-w-3xl px-6 pt-14 pb-10 text-center">
        <h1 className="font-display text-3xl font-bold tracking-tight text-foreground sm:text-5xl">Simple, honest pricing</h1>
        <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
          Start free. Pricing is quoted per business, not a fixed card charge — start a plan
          request from inside the app and we'll confirm your rate directly.
        </p>
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-24">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {PLAN_ORDER.map((id) => {
            const limits = PLAN_LIMITS[id]
            const copy = PLAN_COPY[id]
            const featured = id === 'growth'
            return (
              <div
                key={id}
                className={`rounded-2xl border p-6 flex flex-col ${
                  featured ? 'border-primary bg-primary/5' : 'border-border bg-card'
                }`}
              >
                <p className="text-sm font-semibold text-foreground capitalize">{id}</p>
                <p className="mt-1 text-xs text-muted-foreground min-h-[2.5rem]">{copy.tagline}</p>
                <p className="mt-4 text-2xl font-bold text-foreground">
                  {id === 'free' ? 'Free' : id === 'enterprise' ? 'Custom' : 'Contact us'}
                </p>
                <div className="mt-4 space-y-1.5 text-xs text-muted-foreground">
                  <p>{fmtLimit(limits.seats)} team seat{limits.seats === 1 ? '' : 's'}</p>
                  <p>{fmtLimit(limits.monthlyMessages)} WhatsApp messages / mo</p>
                </div>
                <ul className="mt-5 space-y-2 flex-1">
                  {copy.highlights.map((h) => (
                    <li key={h} className="flex items-start gap-2 text-xs text-foreground">
                      <Check className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
                      {h}
                    </li>
                  ))}
                </ul>
                <Link
                  href="/signup"
                  className={`mt-6 rounded-lg px-4 py-2.5 text-center text-sm font-semibold transition-colors ${
                    featured
                      ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                      : 'border border-border text-foreground hover:bg-muted'
                  }`}
                >
                  {id === 'free' ? 'Start free' : 'Get started'}
                </Link>
              </div>
            )
          })}
        </div>
        <p className="mt-8 text-center text-xs text-muted-foreground">
          Paid plans: request an upgrade from Settings → Billing once you're signed up. We'll confirm
          your price and send payment details (card, bank transfer, JazzCash, or Easypaisa).
        </p>
      </section>

      <footer className="border-t border-border px-6 py-8 text-center text-xs text-muted-foreground">
        Powered by The Scale Agency
      </footer>
    </div>
  )
}
