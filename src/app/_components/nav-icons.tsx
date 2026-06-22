import {
  Activity,
  Building2,
  Brain,
  ChartSpline,
  Columns3,
  Contact,
  GalleryHorizontalEnd,
  Gauge,
  Home,
  Images,
  Megaphone,
  Send,
  Settings2,
  Target,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import Image from "next/image";

export type NavIconName =
  | "home"
  | "campaigns"
  | "crm"
  | "outbox"
  | "gallery"
  | "library"
  | "arc"
  | "settings"
  | "board"
  | "analytics"
  | "brand"
  | "brain"
  | "activity"
  | "opportunities"
  | "personas"
  | "usage";

const icons: Record<Exclude<NavIconName, "arc">, LucideIcon> = {
  activity: Activity,
  analytics: ChartSpline,
  brand: Building2,
  board: Columns3,
  brain: Brain,
  campaigns: Megaphone,
  crm: UsersRound,
  gallery: Images,
  home: Home,
  library: GalleryHorizontalEnd,
  opportunities: Target,
  outbox: Send,
  personas: Contact,
  settings: Settings2,
  usage: Gauge,
};

export function NavIcon({ name, className = "h-5 w-5" }: { name: NavIconName; className?: string }) {
  if (name === "arc") {
    return <Image alt="" aria-hidden="true" className={`${className} object-contain`} draggable={false} height={256} src="/brand/nav-icons/arc-icon.png" width={256} />;
  }

  const Icon = icons[name];

  return <Icon aria-hidden="true" className={className} strokeWidth={1.8} />;
}
