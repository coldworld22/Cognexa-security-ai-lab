import type { ReactNode } from "react";
import type { Metadata } from "next";
import { IBM_Plex_Mono, Space_Grotesk } from "next/font/google";

import { APP_DESCRIPTION, APP_NAME } from "@/lib/branding";

import "./globals.css";

const headingFont = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-heading"
});

const monoFont = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono"
});

export const metadata: Metadata = {
  title: APP_NAME,
  applicationName: APP_NAME,
  description: APP_DESCRIPTION
};

export default function RootLayout({
  children
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${headingFont.variable} ${monoFont.variable} bg-[#e8ece3] text-ink antialiased`}>
        {children}
      </body>
    </html>
  );
}
