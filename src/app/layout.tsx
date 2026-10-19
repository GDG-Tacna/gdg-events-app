import type { Metadata, Viewport } from "next";
import { Inter, Space_Grotesk, Tiny5 } from "next/font/google";
import { PwaChrome } from "@/app-shell/PwaChrome";
import { AnalyticsBoot } from "@/features/analytics";
import { AuthProvider } from "@/app-shell/providers/auth-provider";
import { PwaProvider } from "@/app-shell/providers/pwa-provider";
import { ThemeProvider } from "@/app-shell/providers/theme-provider";
import { copy } from "@/shared/copy/es";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const tiny5 = Tiny5({
  variable: "--font-tiny5",
  subsets: ["latin"],
  weight: "400",
});

export const metadata: Metadata = {
  title: copy.brand.name,
  description: copy.brand.description,
};

export const viewport: Viewport = {
  themeColor: "#0a0f24",
  viewportFit: "cover",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es"
      className={`${spaceGrotesk.variable} ${inter.variable} ${tiny5.variable} h-full antialiased`}
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
