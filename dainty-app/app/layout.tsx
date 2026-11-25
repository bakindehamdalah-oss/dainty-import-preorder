import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://dainty-import-preorder.vercel.app")
  ),
  title: "Dainty Import | China Direct Factory Preorders & Sourcing",
  description:
    "Direct factory preorders from China. Transparent air & sea cargo estimates, custom sizes and colors, and direct WhatsApp ordering.",
  applicationName: "Dainty Import",
  keywords: ["China sourcing", "preorders", "China factory sourcing", "Nigeria imports", "Dainty Import", "wholesale iPhone cases"],
  openGraph: {
    title: "Dainty Import | China Direct Factory Preorders",
    description:
      "Shop curated China factory products with clear air and sea shipping estimates.",
    siteName: "Dainty Import",
    type: "website",
    locale: "en_NG",
  },
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/icon.png", type: "image/png" }
    ],
    apple: "/icon.png",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full w-full antialiased`}
    >
      <body className="min-h-full w-full max-w-full overflow-x-hidden flex flex-col bg-stone-50 text-stone-900">
        {children}
      </body>
    </html>
  );
}
