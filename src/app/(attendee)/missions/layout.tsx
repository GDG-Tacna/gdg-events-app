import { AttendeeShell } from "@/app-shell/AttendeeShell";

export default function MissionsLayout({ children }: LayoutProps<"/missions">) {
  return <AttendeeShell>{children}</AttendeeShell>;
}
