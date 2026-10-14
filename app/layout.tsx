import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { GoogleAnalytics } from "@next/third-parties/google";
import "./globals.css";
import { NightSky } from "@/components/NightSky";
import { LoadingGate } from "@/components/LoadingGate";

/**
 * Google Analytics 4 measurement ID. Public by design: every visitor's
 * browser sees it. NEXT_PUBLIC_GA_ID overrides it. Loads only in production
 * builds, so local development never shows up as visitors.
 */
const GA_ID =
  process.env.NODE_ENV === "production"
    ? process.env.NEXT_PUBLIC_GA_ID || "G-KKW2HEXNQT"
    : null;

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Flights Overhead",
  description:
    "An arrivals board for the aircraft passing over your house: what it is, and where it came from.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={inter.variable}
    >
      <body>
        <NightSky />
        <LoadingGate>{children}</LoadingGate>
      </body>
      {GA_ID && <GoogleAnalytics gaId={GA_ID} />}
    </html>
  );
}
