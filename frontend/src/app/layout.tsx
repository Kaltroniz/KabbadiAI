import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { LanguageProvider } from "@/contexts/LanguageContext";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "KabadiAI - E-Waste Appraisal",
  description: "Know what your e-waste is, what it's worth, and where it should go.",
  manifest: "/manifest.json",
  icons: {
    apple: "/icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#0f172a",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <LanguageProvider>
          <div className="min-h-screen max-w-md mx-auto relative overflow-hidden bg-[url('/bg-mesh.svg')] bg-cover bg-center">
            {children}
          </div>
        </LanguageProvider>
      </body>
    </html>
  );
}
