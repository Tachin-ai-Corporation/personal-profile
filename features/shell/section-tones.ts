import { AtSign, Mail, MapPin, Phone, ShieldCheck, UserRound, type LucideIcon } from "lucide-react"
import type { AnimatedIconTone } from "@/components/ui/animated-icon"
import type { ChipTone } from "@/components/ui/chip"
import type { ProfileSectionId } from "./anchors"

/**
 * The design refresh's color per Personal Profile Section (PROPOSAL;
 * DESIGN-SYSTEM.md "Accent tints and motion"): its header icon tile and title
 * accent, its container bar, table tints and header actions, and its Section
 * menu item all take this tone, so they never drift apart. Only opt-in
 * callers use it; `/account` doesn't.
 */
export const PROFILE_SECTION_TONES = {
  personal: "blue",
  phone: "teal",
  email: "teal",
  social: "teal",
  addresses: "mint",
  insurance: "blue",
} as const satisfies Record<ProfileSectionId | "insurance", AnimatedIconTone>

/** Each Section's icon: its header tile and its Section menu item. */
export const PROFILE_SECTION_ICONS: Readonly<Record<ProfileSectionId | "insurance", LucideIcon>> = {
  personal: UserRound,
  phone: Phone,
  email: Mail,
  social: AtSign,
  addresses: MapPin,
  insurance: ShieldCheck,
}

export interface ToneClasses {
  /** `SectionContainer accent`: the 4 px bar over the left border. */
  readonly containerBar: string
  /** `SectionHeader icon`: the short accent line under the title. */
  readonly titleAccent: string
  /**
   * `SectionHeader icon`: the header actions (Edit, Add …) get a tinted
   * outline and fill with the surface tint on hover. `!`: the scope must beat
   * the outline variant's own hover and dark border.
   */
  readonly headerActions: string
  /** `SectionTable` in an accented container: the column header row's fill and text. */
  readonly tableHeader: string
  /** `SectionTable` in an accented container: a read-view row's hover / focus-within fill. */
  readonly rowHover: string
  /** `SectionNav accent`: the current item's fill and 3 px bar. */
  readonly navCurrent: string
  /** `SectionNav accent`: an item's hover fill. */
  readonly navHover: string
  /** `SectionNav accent`: the icon (and Jump to's numbers) in the tone's hue, AA on every surface it sits on. */
  readonly navText: string
  /** `SectionNav accent`: the count pill (>= 4.67:1). */
  readonly navCount: string
  /** `SectionNav accent`: the current item's count pill, a step stronger than its fill (>= 5.45:1). */
  readonly navCountCurrent: string
}

/** Whole class names per tone, so Tailwind finds them in the source. */
export const TONE_CLASSES: Readonly<Record<AnimatedIconTone, ToneClasses>> = {
  blue: {
    containerBar: "before:bg-brand-primary",
    titleAccent: "after:bg-brand-primary",
    headerActions: "[&_button]:border-brand-primary/50! [&_button:hover]:bg-tint-blue-surface! [&_button:hover]:text-foreground!",
    tableHeader: "bg-tint-blue-surface text-tint-blue-strong-foreground",
    rowHover: "hover:bg-tint-blue-surface focus-within:bg-tint-blue-surface",
    navCurrent: "bg-tint-blue-strong before:bg-brand-primary",
    navHover: "hover:bg-tint-blue-surface",
    navText: "text-tint-blue-strong-foreground",
    navCount: "bg-tint-blue-strong text-tint-blue-strong-foreground",
    navCountCurrent: "bg-tint-blue-emphasis text-tint-blue-emphasis-foreground",
  },
  teal: {
    containerBar: "before:bg-brand-secondary",
    titleAccent: "after:bg-brand-secondary",
    headerActions: "[&_button]:border-brand-secondary/50! [&_button:hover]:bg-tint-teal-surface! [&_button:hover]:text-foreground!",
    tableHeader: "bg-tint-teal-surface text-tint-teal-strong-foreground",
    rowHover: "hover:bg-tint-teal-surface focus-within:bg-tint-teal-surface",
    navCurrent: "bg-tint-teal-strong before:bg-brand-secondary",
    navHover: "hover:bg-tint-teal-surface",
    navText: "text-tint-teal-strong-foreground",
    navCount: "bg-tint-teal-strong text-tint-teal-strong-foreground",
    navCountCurrent: "bg-tint-teal-emphasis text-tint-teal-emphasis-foreground",
  },
  mint: {
    containerBar: "before:bg-brand-tertiary",
    titleAccent: "after:bg-brand-tertiary",
    headerActions: "[&_button]:border-brand-tertiary/60! [&_button:hover]:bg-tint-mint-surface! [&_button:hover]:text-foreground!",
    tableHeader: "bg-tint-mint-surface text-tint-mint-strong-foreground",
    rowHover: "hover:bg-tint-mint-surface focus-within:bg-tint-mint-surface",
    navCurrent: "bg-tint-mint-strong before:bg-brand-tertiary",
    navHover: "hover:bg-tint-mint-surface",
    navText: "text-tint-mint-strong-foreground",
    navCount: "bg-tint-mint-strong text-tint-mint-strong-foreground",
    navCountCurrent: "bg-tint-mint-emphasis text-tint-mint-emphasis-foreground",
  },
}

/**
 * A non-primary label chip's tint (opt-in, `Chip tone`): Home mint, Work
 * teal, any other label (Other, a custom label, an insurance precedence) aqua.
 */
export function labelChipTone(label: string): ChipTone {
  const key = label.trim().toLowerCase()
  if (key === "home") return "mint"
  if (key === "work") return "teal"
  return "aqua"
}
