import type { Metadata } from "next";
import { Space_Grotesk } from "next/font/google";
import { GoogleAnalytics } from "@next/third-parties/google";
import "./globals.css";

/**
 * Google Analytics 4 measurement ID. Public by design: every visitor's
 * browser sees it. NEXT_PUBLIC_GA_ID overrides it. Loads only in production
 * builds, so local development never shows up as visitors.
 */
const GA_ID =
  process.env.NODE_ENV === "production"
    ? process.env.NEXT_PUBLIC_GA_ID || "G-KKW2HEXNQT"
    : null;

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Flights Overhead",
  description:
    "An arrivals board for the aircraft passing over your house: what it is, and where it came from.",
};

/**
 * Resolves the theme to a concrete `data-theme` value before first paint:
 * a saved choice wins, otherwise dark. Runs synchronously so there is no
 * flash of the wrong palette.
 */
const themeInit = `(function(){try{var s=localStorage.getItem('fo.theme');document.documentElement.dataset.theme=(s==='light')?'light':'dark';}catch(e){document.documentElement.dataset.theme='dark';}})();`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={spaceGrotesk.variable}
    >
      <body>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
        {children}
      </body>
      {GA_ID && <GoogleAnalytics gaId={GA_ID} />}
    </html>
  );
}
