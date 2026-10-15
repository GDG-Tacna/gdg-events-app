import { AttendeeShell } from "@/app-shell/AttendeeShell";

export default function NetworkLayout({ children }: LayoutProps<"/red">) {
  return <AttendeeShell>{children}</AttendeeShell>;
}
