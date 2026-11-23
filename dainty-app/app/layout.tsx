import type { Metadata } from "next";
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

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://dainty-import-preorder.vercel.app")
  ),
  title: "Dainty Import | China Direct Factory Pre-orders & Sourcing",
  description:
    "Direct factory pre-orders from China in Nigerian Naira. Transparent air & sea cargo estimates, custom sizes and colors, and direct WhatsApp ordering.",
  applicationName: "Dainty Import",
  keywords: ["China sourcing", "pre-orders", "China factory sourcing", "Nigeria imports", "Dainty Import", "wholesale iPhone cases"],
  openGraph: {
    title: "Dainty Import | China Direct Factory Pre-orders",
    description:
      "Shop curated China factory products in Naira with clear air and sea shipping estimates.",
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
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
