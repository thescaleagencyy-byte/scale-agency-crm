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
  Search,
  CheckCheck,
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
  { icon: MessageSquare, title: 'Team inbox', desc: 'Every WhatsApp chat in one place, on the official Meta API. Assign, reply, hand over.' },
  { icon: GitBranch, title: 'Leads and pipeline', desc: 'Each enquiry becomes a lead with a score, then a deal you can move to won.' },
  { icon: Workflow, title: 'Follow-ups that run themselves', desc: 'Drip messages, booking flows and replies to chats that went quiet.' },
  { icon: BarChart3, title: 'Numbers that matter', desc: 'First-reply time, resolution rate and revenue that came from WhatsApp.' },
  { icon: FileSignature, title: 'Contracts', desc: 'Upload, send and track agreements next to the customer they belong to.' },
  { icon: CreditCard, title: 'Local billing', desc: 'Plans, usage limits and JazzCash, Easypaisa or bank transfer.' },
]

export default function RootPage() {
  if (FEATURE_GATING_ENABLED) {
    redirect('/dashboard')
  }

  return (
    <div className="min-h-screen overflow-x-hidden">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5 sm:px-8">
        <Link href="/" className="flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon-round.png" alt="" className="h-7 w-7 rounded-full" />
          <span className="font-display text-base font-medium text-foreground">Scale OS</span>
        </Link>
        <nav className="flex items-center gap-5 text-sm">
          <Link href="/pricing" className="hidden text-muted-foreground transition-colors hover:text-foreground sm:inline">Pricing</Link>
          <Link href="/login" className="text-muted-foreground transition-colors hover:text-foreground">Sign in</Link>
          <Link
            href="/signup"
            className="rounded-lg bg-primary px-4 py-2 font-medium text-primary-foreground transition-colors hover:bg-primary-hover"
          >
            Get started
          </Link>
        </nav>
      </header>

      {/* Hero — split: words on the left, the product on the right */}
      <section className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-12 px-6 pb-20 pt-12 sm:px-8 lg:min-h-[min(calc(100vh-76px),820px)] lg:grid-cols-[11fr_13fr] lg:pb-24 lg:pt-4">
        <div>
          <p className="mb-4 text-sm text-muted-foreground">WhatsApp CRM by The Scale Agency</p>
          <h1 className="text-balance font-display text-[36px] font-medium leading-[1.08] tracking-tight text-foreground sm:text-[48px]">
            Every WhatsApp enquiry answered and followed up
          </h1>
          <p className="mt-5 max-w-md text-base leading-relaxed text-muted-foreground sm:text-lg">
            Scale OS gives your team one inbox for the business number, turns each chat into a lead, and
            follows up when a customer goes quiet.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              href="/signup"
              className="rounded-lg bg-primary px-6 py-3 font-medium text-primary-foreground transition-colors hover:bg-primary-hover"
            >
              Start free
            </Link>
            <Link
              href="/pricing"
              className="rounded-lg border border-border px-6 py-3 font-medium text-foreground transition-colors hover:bg-muted"
            >
              See pricing
            </Link>
          </div>
        </div>

        <ProductPreview />
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-24 sm:px-8">
        <h2 className="max-w-lg font-display text-2xl font-medium tracking-tight text-foreground sm:text-3xl">
          What your team gets on day one
        </h2>
        <div className="mt-10 grid grid-cols-1 gap-x-10 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="border-t border-border pt-5">
              <f.icon className="h-[18px] w-[18px] text-muted-foreground" strokeWidth={1.5} />
              <p className="mt-4 text-sm font-medium text-foreground">{f.title}</p>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-border px-6 py-8 text-center text-xs text-muted-foreground">
        Scale OS is built by The Scale Agency
      </footer>
    </div>
  )
}

// A static, code-built view of the real inbox: conversation list, one open
// chat, and the lead card the chat produced. Plausible data only.
const CHATS = [
  { name: 'Hamza Textiles', last: 'Rate for 500 meters?', time: '10:42', unread: 2, active: true },
  { name: 'Ayesha Malik', last: 'Bridal order — Friday ok?', time: '10:31', unread: 0, active: false },
  { name: 'Bilal Motors', last: 'Thanks, received the quote', time: '09:58', unread: 0, active: false },
  { name: '+92 321 4478 210', last: 'Location bhej dein please', time: '09:14', unread: 1, active: false },
]

function ProductPreview() {
  return (
    <div className="relative" aria-hidden>
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-elevated">
        {/* window bar */}
        <div className="flex h-10 items-center gap-1.5 border-b border-border px-4">
          <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/25" />
          <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/25" />
          <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/25" />
          <span className="ml-3 text-xs text-muted-foreground">Inbox</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-[220px_1fr]">
          {/* conversation list */}
          <div className="hidden border-r border-border sm:block">
            <div className="p-3">
              <div className="flex h-8 items-center gap-2 rounded-lg bg-muted px-2.5 text-xs text-muted-foreground">
                <Search className="h-3.5 w-3.5" strokeWidth={1.5} />
                Search
              </div>
            </div>
            <ul className="px-2 pb-3">
              {CHATS.map((c) => (
                <li
                  key={c.name}
                  className={`flex items-start gap-2.5 rounded-lg px-2.5 py-2.5 ${c.active ? 'bg-muted' : ''}`}
                >
                  <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted-foreground/15 text-[11px] font-medium text-foreground/70">
                    {/^[A-Za-z]/.test(c.name) ? c.name[0] : '#'}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-xs font-medium text-foreground">{c.name}</span>
                      <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">{c.time}</span>
                    </span>
                    <span className="mt-0.5 flex items-center justify-between gap-2">
                      <span className="truncate text-[11px] text-muted-foreground">{c.last}</span>
                      {c.unread > 0 && (
                        <span className="flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-primary px-1 text-[11px] font-medium tabular-nums text-primary-foreground">
                          {c.unread}
                        </span>
                      )}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* open chat */}
          <div className="flex min-h-[360px] flex-col">
            <div className="flex items-center justify-between border-b border-border px-5 py-3">
              <div>
                <p className="text-sm font-medium text-foreground">Hamza Textiles</p>
                <p className="text-[11px] text-muted-foreground">+92 300 5512 087</p>
              </div>
              <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                Assigned to Mahnoor
              </span>
            </div>

            <div className="flex flex-1 flex-col gap-2.5 px-5 py-5">
              <Bubble side="in" time="10:38">Assalam o alaikum, lawn print available hai?</Bubble>
              <Bubble side="out" time="10:39">Walaikum salam. Yes, 6 designs in stock. Sending the catalogue now</Bubble>
              <Bubble side="in" time="10:42">Rate for 500 meters?</Bubble>
              <Bubble side="out" time="10:43">PKR 170 per meter for 500+, so PKR 85,000. Delivery in 3 days</Bubble>
            </div>

            {/* the moment: the lead this chat just became */}
            <div className="mx-5 mb-5 flex items-center justify-between gap-4 rounded-xl border border-border bg-background px-4 py-3">
              <div className="min-w-0">
                <p className="text-[11px] text-muted-foreground">Lead created from this chat</p>
                <p className="mt-0.5 truncate text-sm font-medium text-foreground">Lawn print, 500 m</p>
              </div>
              <div className="shrink-0 text-right">
                <p className="font-display text-lg font-medium tabular-nums text-foreground">PKR 85,000</p>
                <p className="text-[11px] text-muted-foreground">Score 82 · Quote sent</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function Bubble({ side, time, children }: { side: 'in' | 'out'; time: string; children: React.ReactNode }) {
  const out = side === 'out'
  return (
    <div className={`flex ${out ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[78%] rounded-2xl px-3.5 py-2 text-[13px] leading-snug ${
          out ? 'rounded-br-md bg-primary/15 text-foreground' : 'rounded-bl-md bg-muted text-foreground'
        }`}
      >
        {children}
        <span className="ml-2 inline-flex translate-y-0.5 items-center gap-0.5 text-[11px] tabular-nums text-muted-foreground">
          {time}
          {out && <CheckCheck className="h-3 w-3 text-primary" strokeWidth={2} />}
        </span>
      </div>
    </div>
  )
}
