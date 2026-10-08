import type { Metadata, Viewport } from "next";
import "./globals.css";
import { LanguageProvider } from "@/contexts/LanguageContext";

export const metadata: Metadata = {
  title: "KabadiAI",
  description: "For kabadiwalas: know what your e-waste lot is, what it is worth, and where to deliver it safely.",
  manifest: "/manifest.json",
  icons: { apple: "/icon.png" },
};
export const viewport: Viewport = { themeColor: "#047857", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="hi">
      <body>
        <LanguageProvider>
          <div className="min-h-screen max-w-md mx-auto">{children}</div>
        </LanguageProvider>
      </body>
    </html>
  );
}
