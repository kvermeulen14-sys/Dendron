import {
  BookOpen,
  PencilLine,
  AlertCircle,
  Heart,
  Brain,
  Calendar,
  LayoutDashboard,
  Users,
  MessageCircle,
  LogOut,
  Plus,
  Check,
  Trash2,
  Upload,
  FlaskConical,
  Calculator,
  Globe,
  Landmark,
  Languages,
  Music,
  Dumbbell,
  Palette,
  ChevronLeft,
  ChevronRight,
  type LucideProps,
} from "lucide-react";

export const ICONS = {
  "book-open": BookOpen,
  "pencil-line": PencilLine,
  "alert-circle": AlertCircle,
  heart: Heart,
  brain: Brain,
  calendar: Calendar,
  dashboard: LayoutDashboard,
  users: Users,
  chat: MessageCircle,
  logout: LogOut,
  plus: Plus,
  check: Check,
  trash: Trash2,
  upload: Upload,
  flask: FlaskConical,
  calculator: Calculator,
  globe: Globe,
  history: Landmark,
  language: Languages,
  music: Music,
  sport: Dumbbell,
  art: Palette,
  "chevron-left": ChevronLeft,
  "chevron-right": ChevronRight,
} as const;

export type IconName = keyof typeof ICONS;

export const SUBJECT_ICON_OPTIONS: IconName[] = [
  "book-open",
  "calculator",
  "flask",
  "globe",
  "history",
  "language",
  "music",
  "sport",
  "art",
];

export function Icon({
  name,
  ...props
}: { name: string } & LucideProps) {
  const Cmp = ICONS[name as IconName] ?? BookOpen;
  return <Cmp {...props} />;
}
