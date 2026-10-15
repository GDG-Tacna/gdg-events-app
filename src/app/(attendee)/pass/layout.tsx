import { AttendeeShell } from "@/app-shell/AttendeeShell";

export default function PassLayout({ children }: LayoutProps<"/pass">) {
  return <AttendeeShell>{children}</AttendeeShell>;
}
