import type { Metadata, Viewport } from "next";
import "./globals.css";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { GamificationProvider } from "@/contexts/GamificationContext";
import MobileBottomNav from "@/components/MobileBottomNav";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";

export const metadata: Metadata = {
  title: "KabadiAI – e-Waste Intelligence",
  description: "For kabadiwalas: know what your e-waste lot is, what it is worth, and where to deliver it safely.",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/icon-32.png?v=2", sizes: "32x32", type: "image/png" },
      { url: "/icon-16.png?v=2", sizes: "16x16", type: "image/png" },
      { url: "/icon-192.png?v=2", sizes: "192x192", type: "image/png" },
      { url: "/favicon.ico?v=2" },
    ],
    shortcut: "/icon-32.png?v=2",
    apple: "/apple-touch-icon.png?v=2",
  },
};

export const viewport: Viewport = {
  themeColor: "#00e5a0",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="hi">
      <head>
        <link rel="icon" type="image/png" sizes="32x32" href="/icon-32.png?v=2" />
        <link rel="icon" type="image/png" sizes="16x16" href="/icon-16.png?v=2" />
        <link rel="shortcut icon" href="/icon-32.png?v=2" />
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png?v=2" />
      </head>
      <body>
        <LanguageProvider>
          <AuthProvider>
            <GamificationProvider>
              {children}
              <MobileBottomNav />
              <ServiceWorkerRegister />
            </GamificationProvider>
          </AuthProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}
