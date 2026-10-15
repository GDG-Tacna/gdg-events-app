import {
  ArrowBigUp,
  CameraOff,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Copy,
  CircleAlert,
  CircleCheck,
  CircleHelp,
  CircleX,
  Download,
  ExternalLink,
  Gift,
  House,
  KeyRound,
  Lock,
  RadioTower,
  LoaderCircle,
  LogIn,
  LogOut,
  Map as MapIcon,
  MapPin,
  QrCode,
  RefreshCw,
  Settings,
  Share,
  SquarePlus,
  Target,
  Trophy,
  UsersRound,
  WifiOff,
  X,
  Award,
  CalendarDays,
  Coins,
  Flag,
  Gamepad2,
  Medal,
  Mic,
  MonitorPlay,
  PiggyBank,
  Store,
  Search,
  Play,
  GripVertical,
  Pencil,
  Plus,
  Coffee,
  DoorOpen,
  ImageIcon,
  Upload,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/shared/lib/utils";

/** Line icons for the interface (Design System). Pixel art is never used as a UI icon. */
const ICONS = {
  login: LogIn,
  alert: CircleAlert,
  loading: LoaderCircle,
  close: X,
  refresh: RefreshCw,
  share: Share,
  "plus-square": SquarePlus,
  "wifi-off": WifiOff,
  check: CircleCheck,
  "camera-off": CameraOff,
  qr: QrCode,
  home: House,
  map: MapIcon,
  target: Target,
  "map-pin": MapPin,
  question: CircleHelp,
  key: KeyRound,
  lock: Lock,
  transmission: RadioTower,
  failed: CircleX,
  trophy: Trophy,
  left: ChevronLeft,
  right: ChevronRight,
  up: ChevronUp,
  down: ChevronDown,
  jump: ArrowBigUp,
  users: UsersRound,
  external: ExternalLink,
  settings: Settings,
  logout: LogOut,
  download: Download,
  gift: Gift,
  award: Award,
  calendar: CalendarDays,
  copy: Copy,
  coins: Coins,
  flag: Flag,
  gamepad: Gamepad2,
  medal: Medal,
  mic: Mic,
  stage: MonitorPlay,
  "piggy-bank": PiggyBank,
  store: Store,
  coffee: Coffee,
  door: DoorOpen,
  search: Search,
  play: Play,
  grip: GripVertical,
  edit: Pencil,
  plus: Plus,
  image: ImageIcon,
  upload: Upload,
  trash: Trash2,
} as const satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof ICONS;

export interface IconProps {
  name: IconName;
  /** Pixels; 22 by default, 20 inside buttons. */
  size?: number;
  /** Accessible name. Without it the icon is decorative and hidden from assistive tech. */
  title?: string;
  className?: string;
}

export function Icon({ name, size = 22, title, className }: IconProps) {
  const Component = ICONS[name];
  return (
    <Component
      width={size}
      height={size}
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      aria-label={title}
      role={title ? "img" : undefined}
      className={cn("shrink-0", name === "loading" && "animate-spin", className)}
    />
  );
}
