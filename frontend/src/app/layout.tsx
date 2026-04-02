import type { ReactNode } from "react";
import type { Metadata } from "next";

import { Providers } from "@/components/providers";
import { getMetadataBase, siteConfig } from "@/lib/seo";

import "./globals.css";

export const metadata: Metadata = {
  metadataBase: getMetadataBase(),
  applicationName: siteConfig.name,
  title: {
    default: siteConfig.name,
    template: `%s | ${siteConfig.name}`
  },
  description: siteConfig.description,
  keywords: siteConfig.keywords,
  category: "technology",
  alternates: {
    canonical: "/"
  },
  openGraph: {
    type: "website",
    siteName: siteConfig.name,
    title: siteConfig.name,
    description: siteConfig.description,
    url: "/"
  },
  twitter: {
    card: "summary_large_image",
    title: siteConfig.name,
    description: siteConfig.description
  }
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#17315c"
};

export default function RootLayout({
  children
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
