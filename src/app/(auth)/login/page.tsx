"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UsersRound } from "lucide-react";
import { CLIENT_NAME, APP_NAME, PRIMARY_COLOR } from "@/lib/features";

const CLIENT_LOGO = CLIENT_NAME
  ? `/clients/${CLIENT_NAME.toLowerCase().replace(/\s+/g, '')}.png`
  : "/branding.jpeg";
const LOGO_ALT = APP_NAME;

const c = PRIMARY_COLOR; // shorthand for inline styles

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginPageInner />
    </Suspense>
  );
}

function LoginPageInner() {
  const searchParams = useSearchParams();
  const inviteToken = searchParams.get("invite");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    router.push(inviteToken ? `/join/${encodeURIComponent(inviteToken)}` : "/dashboard");
  };

  return (
    <div className="flex min-h-screen bg-[#080808]">

      {/* ── Left panel – brand ── */}
      <div className="relative hidden lg:flex lg:w-[55%] flex-col items-center justify-center overflow-hidden p-12">

        {/* Glow orbs */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute top-[-10%] left-[-10%] h-[500px] w-[500px] rounded-full opacity-[0.12] blur-[120px]" style={{ background: c }} />
          <div className="absolute bottom-[-5%] right-[-5%] h-[400px] w-[400px] rounded-full opacity-[0.08] blur-[100px]" style={{ background: c }} />
          <div className="absolute top-[40%] left-[55%] h-[250px] w-[250px] rounded-full opacity-[0.06] blur-[80px]" style={{ background: c }} />
        </div>

        {/* Subtle grid overlay */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage:
              "linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)",
            backgroundSize: "60px 60px",
          }}
        />

        {/* Content */}
        <div className="relative z-10 flex flex-col items-center text-center">
          <Image
            src={CLIENT_LOGO}
            alt={LOGO_ALT}
            width={180}
            height={180}
            priority
            className="rounded-2xl object-contain mb-8 ring-1 ring-white/10 shadow-2xl"
            style={{ boxShadow: `0 25px 50px ${c}1a` }}
          />
          <h1 className="text-4xl font-bold text-white tracking-tight leading-tight">
            {CLIENT_NAME ? `${CLIENT_NAME}` : 'Scale smarter.'}<br />
            <span style={{ color: c }}>
              {CLIENT_NAME ? 'WhatsApp CRM' : 'Close faster.'}
            </span>
          </h1>
          <p className="mt-4 text-base text-white/40 max-w-sm leading-relaxed">
            Your WhatsApp CRM — built for teams that move fast and convert faster.
          </p>

          {/* Stat pills */}
          <div className="mt-10 flex items-center gap-4 flex-wrap justify-center">
            {[
              { value: "100%", label: "WhatsApp native" },
              { value: "Real-time", label: "live inbox" },
              { value: "n8n", label: "automation ready" },
            ].map((s) => (
              <div
                key={s.label}
                className="rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-sm backdrop-blur-sm"
              >
                <span className="font-semibold" style={{ color: c }}>{s.value}</span>
                <span className="ml-1.5 text-white/50">{s.label}</span>
              </div>
            ))}
          </div>

          {/* Built by */}
          <p className="mt-10 text-xs text-white/20">
            Built by{" "}
            <span className="text-white/40 font-medium">The Scale Agency</span>
          </p>
        </div>
      </div>

      {/* ── Right panel – form ── */}
      <div className="flex w-full lg:w-[45%] items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">

          {/* Mobile logo */}
          <div className="flex justify-center mb-8 lg:hidden">
            <Image
              src={CLIENT_LOGO}
              alt={LOGO_ALT}
              width={80}
              height={80}
              priority
              className="rounded-xl object-contain ring-1 ring-white/10"
            />
          </div>

          {inviteToken ? (
            <div className="mb-6 flex items-center gap-3">
              <div
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1"
                style={{ background: `${c}1a`, borderColor: `${c}33` }}
              >
                <UsersRound className="h-5 w-5" style={{ color: c }} />
              </div>
              <div>
                <p className="text-sm font-semibold text-white">You&apos;re invited</p>
                <p className="text-xs text-white/40">Sign in to accept the invitation.</p>
              </div>
            </div>
          ) : (
            <div className="mb-8">
              <h2 className="text-2xl font-bold text-white">Welcome back</h2>
              <p className="mt-1 text-sm text-white/40">Sign in to your account to continue.</p>
            </div>
          )}

          <form onSubmit={handleLogin} className="flex flex-col gap-4">
            {error && (
              <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                {error}
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email" className="text-xs font-medium text-white/50 uppercase tracking-wider">
                Email
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="h-11 border-white/10 bg-white/5 text-white placeholder:text-white/20 rounded-xl"
                style={{ ['--tw-ring-color' as string]: `${c}1a` }}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="password" className="text-xs font-medium text-white/50 uppercase tracking-wider">
                  Password
                </Label>
                <Link href="/forgot-password" className="text-xs transition-colors" style={{ color: `${c}b3` }}>
                  Forgot password?
                </Link>
              </div>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="h-11 border-white/10 bg-white/5 text-white placeholder:text-white/20 rounded-xl"
              />
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="mt-2 h-11 w-full rounded-xl font-semibold text-sm transition-all"
              style={{
                background: loading
                  ? `${c}4d`
                  : `linear-gradient(135deg, ${c} 0%, ${c}cc 100%)`,
                color: "#080808",
                boxShadow: loading ? "none" : `0 0 24px ${c}4d`,
              }}
            >
              {loading ? "Signing in..." : "Sign in"}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-white/30">
            Don&apos;t have an account?{" "}
            <Link
              href={inviteToken ? `/signup?invite=${encodeURIComponent(inviteToken)}` : "/signup"}
              className="transition-colors"
              style={{ color: `${c}b3` }}
            >
              Create account
            </Link>
          </p>

          {/* Built by — mobile */}
          <p className="mt-8 text-center text-xs text-white/20 lg:hidden">
            Built by <span className="text-white/40 font-medium">The Scale Agency</span>
          </p>
        </div>
      </div>
    </div>
  );
}
