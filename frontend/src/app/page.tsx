import type { Metadata } from "next";
import Link from "next/link";
import Script from "next/script";

import { Box, Button, Card, CardContent, Chip, Container, Stack, Typography } from "@mui/material";

import { buildPageMetadata, getSiteUrl } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({
  title: "Multi-Cloud Sizing And Cost Estimation",
  description:
    "Estimate ERP, CRM, and application workloads across AWS, Azure, GCP, and other providers with CloudSizer's advisor, estimator, pricing, and architecture tools.",
  path: "/",
  keywords: ["cloud workload estimator", "cloud cost recommendation", "multi-cloud planning platform"]
});

export default function HomePage() {
  const websiteJsonLd = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "CloudSizer",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    url: getSiteUrl(),
    description:
      "CloudSizer estimates ERP, CRM, and application workloads across multiple cloud providers with advisor, pricing, and architecture workflows."
  };

  return (
    <Box
      sx={{
        minHeight: "100vh",
        background: "var(--hero)",
        display: "flex",
        alignItems: "center"
      }}
    >
      <Script
        id="cloudsizer-webapplication-jsonld"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd) }}
      />
      <Container maxWidth="lg">
        <Stack spacing={4} sx={{ maxWidth: 780 }}>
          <Chip
            label="CloudSizer"
            sx={{
              width: "fit-content",
              px: 1,
              bgcolor: "rgba(12, 107, 88, 0.1)",
              color: "var(--accent)",
              fontWeight: 700
            }}
          />
          <Typography variant="h1" sx={{ fontSize: { xs: "3rem", md: "5.2rem" }, lineHeight: 0.96 }}>
            Size ERP, CRM, and app workloads across AWS, Azure, and GCP.
          </Typography>
          <Typography variant="h5" sx={{ color: "var(--muted)", maxWidth: 620, lineHeight: 1.5 }}>
            Turn business requirements into architecture recommendations, ranked provider options,
            and monthly cost projections from one workspace.
          </Typography>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <Button
              component={Link}
              href="/signup"
              variant="contained"
              size="large"
              sx={{
                bgcolor: "#17315c",
                color: "#ffffff",
                px: 3.5,
                py: 1.4,
                "&:hover": { bgcolor: "#102443" }
              }}
            >
              Create Account
            </Button>
            <Button
              component={Link}
              href="/advisor"
              variant="contained"
              size="large"
              sx={{
                bgcolor: "var(--accent)",
                px: 3.5,
                py: 1.4,
                "&:hover": { bgcolor: "#265db8" }
              }}
            >
              Open Agent Estimator
            </Button>
            <Button
              component={Link}
              href="/login"
              variant="outlined"
              size="large"
              sx={{
                borderColor: "var(--line)",
                color: "var(--text)",
                px: 3.5,
                py: 1.4,
                "&:hover": { borderColor: "var(--line-strong)", bgcolor: "rgba(255,255,255,0.4)" }
              }}
            >
              Login
            </Button>
          </Stack>
          <Card
            sx={{
              borderRadius: 5,
              border: "1px solid var(--line-strong)",
              boxShadow: "none",
              bgcolor: "rgba(49, 111, 214, 0.08)"
            }}
          >
            <CardContent sx={{ p: { xs: 2.5, md: 3 } }}>
              <Stack
                direction={{ xs: "column", md: "row" }}
                spacing={2.5}
                justifyContent="space-between"
                alignItems={{ xs: "flex-start", md: "center" }}
              >
                <Stack spacing={1}>
                  <Chip
                    label="Recommended"
                    sx={{ width: "fit-content", bgcolor: "var(--accent-soft)", color: "var(--accent)", fontWeight: 700 }}
                  />
                  <Typography variant="h5" sx={{ fontWeight: 800 }}>
                    Prefer a chat-driven estimate?
                  </Typography>
                  <Typography variant="body1" sx={{ color: "var(--muted)", lineHeight: 1.7, maxWidth: 640 }}>
                    Use the estimation agent to describe the workload in plain language and get a full recommendation set end to end.
                  </Typography>
                </Stack>
              </Stack>
            </CardContent>
          </Card>
        </Stack>
      </Container>
    </Box>
  );
}
