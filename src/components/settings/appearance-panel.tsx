"use client";

import { Check, Moon, Palette, SunMoon, Sun } from "lucide-react";

import { useTheme } from "@/hooks/use-theme";
import { DEFAULT_THEME, MODES, THEMES, type Mode, type ThemeId } from "@/lib/themes";
import { CLIENT_NAME, FEATURE_GATING_ENABLED } from "@/lib/features";
import { cn } from "@/lib/utils";
import { SettingsPanelHead } from "./settings-panel-head";

const CLIENT_LOGO = CLIENT_NAME
  ? `/clients/${CLIENT_NAME.toLowerCase().replace(/\s+/g, "")}.png`
  : null;

/**
 * Appearance panel — light/dark mode + accent-color picker.
 *
 * Two independent controls: a mode toggle (light / dark) and the
 * accent grid. Either applies + persists immediately. No save button:
 * each change is a single attribute swap on <html>, there's nothing
 * to roll back.
 *
 * On a branded client deployment (NEXT_PUBLIC_FEATURES set) the accent
 * grid collapses to the deployment's own signature color — offering
 * five unrelated brand accents on someone else's white-labeled
 * dashboard reads as unfinished, not as a feature.
 *
 * Persistence: localStorage only (device-scoped). The boot script in
 * layout.tsx replays both choices before first paint on subsequent
 * loads.
 */
export function AppearancePanel() {
  const { theme, setTheme, mode, setMode } = useTheme();
  const signatureTheme = THEMES.find((t) => t.id === DEFAULT_THEME);
  const brandLocked = FEATURE_GATING_ENABLED && !!signatureTheme;

  return (
    <section className="max-w-3xl animate-in fade-in-50 duration-200">
      <SettingsPanelHead
        title="Appearance"
        description="Set the mode and accent colour used across the app. Saved to this device — try it, it changes live."
      />

      {brandLocked && (
        <div className="mb-8 flex items-center gap-4 rounded-xl border border-primary/25 bg-primary/5 p-4">
          {CLIENT_LOGO ? (
            <img
              src={CLIENT_LOGO}
              alt={CLIENT_NAME}
              className="h-12 w-12 shrink-0 rounded-lg border border-border bg-card object-contain p-1"
            />
          ) : (
            <span
              aria-hidden
              className="h-12 w-12 shrink-0 rounded-lg"
              style={{ background: signatureTheme!.swatch }}
            />
          )}
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">
              {CLIENT_NAME || "This workspace"}'s signature theme
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Your dashboard is branded to match {CLIENT_NAME || "your"} identity —
              set below, not picked from a generic palette.
            </p>
          </div>
        </div>
      )}

      <div className="space-y-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <SunMoon className="size-4 text-muted-foreground" />
          Mode
        </h3>

        <div
          role="radiogroup"
          aria-label="Color mode"
          className="grid max-w-md grid-cols-2 gap-3"
        >
          {MODES.map((m) => (
            <ModeCard
              key={m}
              mode={m}
              isActive={m === mode}
              onPick={() => setMode(m)}
            />
          ))}
        </div>
      </div>

      <div className="mt-8 space-y-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Palette className="size-4 text-muted-foreground" />
          Accent color
        </h3>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(brandLocked ? [signatureTheme!] : THEMES).map((t) => (
            <ThemeCard
              key={t.id}
              id={t.id}
              name={t.name}
              tagline={t.tagline}
              swatch={t.swatch}
              isActive={t.id === theme}
              onPick={() => setTheme(t.id)}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function ModeCard({
  mode,
  isActive,
  onPick,
}: {
  mode: Mode;
  isActive: boolean;
  onPick: () => void;
}) {
  const isLight = mode === "light";
  const Icon = isLight ? Sun : Moon;
  return (
    <button
      type="button"
      role="radio"
      onClick={onPick}
      aria-checked={isActive}
      aria-label={`Use ${mode} mode`}
      className={cn(
        "flex items-center gap-3 rounded-lg border bg-card p-4 text-left transition-colors",
        isActive
          ? "border-primary/60 ring-2 ring-primary/40"
          : "border-border hover:border-border hover:bg-muted/40",
      )}
    >
      <span
        aria-hidden
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-foreground"
      >
        <Icon className="h-4 w-4" />
      </span>
      <span className="flex-1 text-sm font-semibold capitalize text-foreground">
        {mode}
      </span>
      {isActive && (
        <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-medium text-primary">
          <Check className="h-3 w-3" />
          Active
        </span>
      )}
    </button>
  );
}

function ThemeCard({
  id,
  name,
  tagline,
  swatch,
  isActive,
  onPick,
}: {
  id: ThemeId;
  name: string;
  tagline: string;
  swatch: string;
  isActive: boolean;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      aria-pressed={isActive}
      aria-label={`Use ${name} theme`}
      className={cn(
        "flex flex-col gap-3 rounded-lg border bg-card p-4 text-left transition-colors",
        isActive
          ? "border-primary/60 ring-2 ring-primary/40"
          : "border-border hover:border-border hover:bg-muted/40",
      )}
    >
      <div className="flex items-center justify-between">
        <span
          aria-hidden
          className="h-8 w-8 shrink-0 rounded-full"
          style={{
            background: swatch,
            boxShadow: "inset 0 0 0 1px oklch(1 0 0 / 0.15)",
          }}
        />
        {isActive && (
          <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-medium text-primary">
            <Check className="h-3 w-3" />
            Active
          </span>
        )}
      </div>
      <div>
        <div className="text-sm font-semibold text-foreground">{name}</div>
        <div className="mt-1 text-xs leading-relaxed text-muted-foreground">
          {tagline}
        </div>
      </div>
      <div
        className="mt-1 flex h-2 overflow-hidden rounded-full"
        aria-hidden
      >
        <span className="flex-1" style={{ background: swatch }} />
        <span className="w-3 bg-muted-foreground/60" />
        <span className="w-3 bg-muted" />
        <span className="w-3 bg-card" />
      </div>
      <span className="sr-only">Theme id: {id}</span>
    </button>
  );
}
