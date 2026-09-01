// Deterministic per-contact avatar color. WhatsApp's Cloud API never
// exposes customer profile photos, so every contact without a
// manually-set avatar_url needs a fallback that's still distinct per
// contact — a shared brand logo (the previous fallback) made every
// contact in the inbox visually identical. Hashing the display name
// into a hue keeps the same contact the same color everywhere
// (list, thread header, sidebar) without needing to store anything.
export function avatarColorForName(name: string): { background: string; color: string } {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = (hash << 5) - hash + name.charCodeAt(i)
    hash |= 0
  }
  const hue = Math.abs(hash) % 360
  // Solid, mid-lightness fill with white text — reads correctly against
  // both the light floating panels and the near-black shell, unlike a
  // pale tint that would wash out on dark backgrounds.
  return {
    background: `hsl(${hue}, 45%, 42%)`,
    color: '#ffffff',
  }
}
