import { AttendeeShell } from "@/app-shell/AttendeeShell";

export default function AchievementsLayout({ children }: LayoutProps<"/achievements">) {
  return <AttendeeShell>{children}</AttendeeShell>;
}
