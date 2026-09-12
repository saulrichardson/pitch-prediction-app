import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Barlow_Condensed, Source_Sans_3 } from "next/font/google";
import "./globals.css";
import { SiteTelemetry } from "@/components/site-telemetry";
import { getSiteUrl, site } from "@/lib/site";

const display = Barlow_Condensed({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["500", "600", "700"]
});

const body = Source_Sans_3({
  subsets: ["latin"],
  variable: "--font-body",
  weight: ["400", "500", "600", "700"]
});

export const metadata: Metadata = {
  metadataBase: getSiteUrl(),
  title: site.name,
  description: site.description,
  alternates: {
    canonical: "/"
  },
  openGraph: {
    type: "website",
    url: "/",
    title: site.name,
    description: site.description,
    siteName: site.name
  },
  twitter: {
    card: "summary_large_image",
    title: site.name,
    description: site.description
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1
    }
  },
  icons: [{ rel: "icon", url: "/favicon.svg", type: "image/svg+xml" }]
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body>
        {children}
        <SiteTelemetry />
      </body>
    </html>
  );
}
