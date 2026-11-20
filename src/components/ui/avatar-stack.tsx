import { User } from "lucide-react"
import { cn } from "@/lib/utils"

interface StackAvatar {
  label: string
  title?: string
  className?: string
}

interface AvatarStackProps {
  avatars: StackAvatar[]
  size?: "sm" | "md"
  className?: string
}

// Overlapping initials avatars with a ring cut against the surface behind
// them — the reference's signature "avatar-stack-ring" trick already
// existed in globals.css but had no component using it. Renders each
// avatar as a plain initials circle since the app has no photo/upload
// field for contacts or team members yet.
export function AvatarStack({ avatars, size = "sm", className }: AvatarStackProps) {
  const dims = size === "sm" ? "h-5 w-5 text-[11px]" : "h-7 w-7 text-xs"

  return (
    <div className={cn("flex items-center", className)}>
      {avatars.map((a, i) => (
        <span
          key={i}
          title={a.title ?? a.label}
          className={cn(
            "avatar-stack-ring flex shrink-0 items-center justify-center rounded-full bg-muted font-medium text-foreground/70",
            dims,
            i > 0 && "-ml-2",
            a.className,
          )}
          style={{ zIndex: avatars.length - i }}
        >
          {initialOf(a.label) ?? <User className="h-[60%] w-[60%]" strokeWidth={1.75} aria-hidden />}
        </span>
      ))}
    </div>
  )
}

// A letter only when the name starts with one. Phone numbers and blanks
// get a neutral person glyph instead of a row of "9 9 1" discs.
function initialOf(label: string): string | null {
  const ch = label.trim().charAt(0)
  return /\p{L}/u.test(ch) ? ch.toUpperCase() : null
}
