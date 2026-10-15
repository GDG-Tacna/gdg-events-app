import { AttendeeShell } from "@/app-shell/AttendeeShell";

export default function MapLayout({ children }: LayoutProps<"/map">) {
  return <AttendeeShell>{children}</AttendeeShell>;
}
