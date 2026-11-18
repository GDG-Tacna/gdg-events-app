import type { Metadata, Viewport } from "next";
import { Google_Sans, Google_Sans_Code } from "next/font/google";
import { PwaChrome } from "@/app-shell/PwaChrome";
import { AnalyticsBoot } from "@/features/analytics";
import { AuthProvider } from "@/app-shell/providers/auth-provider";
import { PwaProvider } from "@/app-shell/providers/pwa-provider";
import { ThemeProvider } from "@/app-shell/providers/theme-provider";
import { copy } from "@/shared/copy/es";
import "./globals.css";

// Same faces as the DevFest Tacna site: Google Sans for text and titles, Google Sans Code for eyebrows and tags.
const googleSans = Google_Sans({
  variable: "--font-google-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const googleSansCode = Google_Sans_Code({
  variable: "--font-google-sans-code",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: copy.brand.name,
  description: copy.brand.description,
  applicationName: copy.brand.installName,
  // iPhones name the home screen icon after this, not after the manifest.
  appleWebApp: { title: copy.brand.installName },
};

export const viewport: Viewport = {
  themeColor: "#1e1e1e",
  viewportFit: "cover",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es"
      className={`${googleSans.variable} ${googleSansCode.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        <ThemeProvider>
          <AuthProvider>
            <PwaProvider>
              {children}
              <PwaChrome />
              <AnalyticsBoot />
            </PwaProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
