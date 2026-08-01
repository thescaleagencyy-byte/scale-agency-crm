import { useEffect, useRef, useState } from 'react'

/**
 * Animates a number from its previous value up to `target` over `duration`ms
 * using an ease-out curve. Used for KPI tiles so numbers feel like they're
 * arriving, not just appearing — one of the small motion details that
 * separates a "designed" dashboard from a static template.
 *
 * Skips the animation entirely under prefers-reduced-motion, and on the
 * very first paint (starting from 0 on load looks like a glitch, not a
 * flourish — only re-counts happen on subsequent value changes... except
 * we do still want the initial load to feel alive, so first mount counts
 * too, just once).
 */
export function useCountUp(target: number, duration = 700): number {
  const [value, setValue] = useState(0)
  const fromRef = useRef(0)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    const reduceMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

    if (reduceMotion || !Number.isFinite(target)) {
      setValue(target)
      return
    }

    const from = fromRef.current
    const delta = target - from
    if (delta === 0) return

    const start = performance.now()
    const tick = (now: number) => {
      const elapsed = now - start
      const t = Math.min(1, elapsed / duration)
      // Ease-out cubic — fast start, gentle settle.
      const eased = 1 - Math.pow(1 - t, 3)
      const current = from + delta * eased
      setValue(current)
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick)
      } else {
        fromRef.current = target
      }
    }
    rafRef.current = requestAnimationFrame(tick)

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target])

  return Math.round(value)
}
