import { cn } from "@/lib/utils";
import { avatarColorForName } from "@/lib/contact-avatar";

interface ContactAvatarProps {
  name: string;
  avatarUrl?: string | null;
  className?: string;
}

/**
 * Shared contact avatar for the inbox (list row, thread header, contact
 * sidebar) — real avatar_url when set, otherwise a per-contact colored
 * initial so contacts stay visually distinct. See lib/contact-avatar.ts
 * for why this replaced a shared brand-logo fallback.
 */
export function ContactAvatar({ name, avatarUrl, className }: ContactAvatarProps) {
  const initial = (name || "?").charAt(0).toUpperCase();

  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        className={cn("rounded-full object-cover", className)}
      />
    );
  }

  const { background, color } = avatarColorForName(name);
  return (
    <div
      className={cn("flex items-center justify-center rounded-full font-semibold", className)}
      style={{ backgroundColor: background, color }}
    >
      {initial}
    </div>
  );
}
