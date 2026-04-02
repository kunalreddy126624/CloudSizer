import type { Metadata } from "next";

const DEFAULT_SITE_URL = "http://localhost:3000";

export const siteConfig = {
  name: "CloudSizer",
  shortName: "CloudSizer",
  description:
    "CloudSizer helps teams estimate ERP, CRM, and application workloads across AWS, Azure, GCP, and other cloud providers from one workspace.",
  keywords: [
    "cloud cost estimator",
    "multi-cloud sizing",
    "ERP cloud sizing",
    "CRM cloud calculator",
    "cloud architecture recommendations",
    "cloud pricing calculator",
    "AWS Azure GCP comparison"
  ]
};

export function getSiteUrl() {
  return process.env.NEXT_PUBLIC_SITE_URL ?? DEFAULT_SITE_URL;
}

export function getMetadataBase() {
  return new URL(getSiteUrl());
}

type BuildPageMetadataOptions = {
  title: string;
  description: string;
  path: string;
  keywords?: string[];
  index?: boolean;
};

export function buildPageMetadata({
  title,
  description,
  path,
  keywords = [],
  index = true
}: BuildPageMetadataOptions): Metadata {
  const canonicalUrl = new URL(path, getMetadataBase()).toString();
  const fullTitle = `${title} | ${siteConfig.name}`;

  return {
    title,
    description,
    keywords: [...siteConfig.keywords, ...keywords],
    alternates: {
      canonical: canonicalUrl
    },
    openGraph: {
      type: "website",
      url: canonicalUrl,
      title: fullTitle,
      description,
      siteName: siteConfig.name
    },
    twitter: {
      card: "summary_large_image",
      title: fullTitle,
      description
    },
    robots: {
      index,
      follow: index
    }
  };
}
