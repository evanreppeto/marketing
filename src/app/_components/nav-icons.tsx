import {
  Activity,
  BotMessageSquare,
  ChartSpline,
  Columns3,
  GalleryHorizontalEnd,
  Home,
  Images,
  Megaphone,
  Network,
  Send,
  Settings2,
  Target,
  UsersRound,
  type LucideIcon,
} from "lucide-react";

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
  | "brain"
  | "activity"
  | "opportunities";

const icons: Record<NavIconName, LucideIcon> = {
  activity: Activity,
  analytics: ChartSpline,
  arc: BotMessageSquare,
  board: Columns3,
  brain: Network,
  campaigns: Megaphone,
  crm: UsersRound,
  gallery: Images,
  home: Home,
  library: GalleryHorizontalEnd,
  opportunities: Target,
  outbox: Send,
  settings: Settings2,
};

export function NavIcon({ name, className = "h-5 w-5" }: { name: NavIconName; className?: string }) {
  const Icon = icons[name];

  return <Icon aria-hidden="true" className={className} strokeWidth={1.8} />;
}
