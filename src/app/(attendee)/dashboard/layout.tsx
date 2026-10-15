import { AttendeeShell } from "@/app-shell/AttendeeShell";

export default function DashboardLayout({ children }: LayoutProps<"/dashboard">) {
  return <AttendeeShell>{children}</AttendeeShell>;
}
