import { AttendeeShell } from "@/app-shell/AttendeeShell";

export default function OdysseyLayout({ children }: LayoutProps<"/odyssey">) {
  return <AttendeeShell>{children}</AttendeeShell>;
}
