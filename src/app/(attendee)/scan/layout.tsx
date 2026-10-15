import { AttendeeShell } from "@/app-shell/AttendeeShell";

export default function ScanLayout({ children }: LayoutProps<"/scan">) {
  return <AttendeeShell>{children}</AttendeeShell>;
}
