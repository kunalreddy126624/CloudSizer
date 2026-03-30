import Link from "next/link";

import { Box, Button, Card, CardContent, Chip, Container, Stack, Typography } from "@mui/material";

export default function HomePage() {
  return (
    <Box
      sx={{
        minHeight: "100vh",
        background: "var(--hero)",
        display: "flex",
        alignItems: "center"
      }}
    >
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
              Open Estimation Agent
            </Button>
            <Button
              component={Link}
              href="/login"
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
              Login
            </Button>
            <Button
              component={Link}
              href="/estimator"
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
              Open Estimator
            </Button>
            <Button
              component={Link}
              href="/architect"
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
              Open Agent Architect
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
                <Button
                  component={Link}
                  href="/advisor"
                  variant="contained"
                  size="large"
                  sx={{
                    minWidth: { xs: "100%", md: 240 },
                    bgcolor: "var(--accent)",
                    color: "#ffffff",
                    fontWeight: 800,
                    px: 3.5,
                    py: 1.4,
                    boxShadow: "0 12px 24px rgba(49, 111, 214, 0.24)",
                    "&:hover": { bgcolor: "#265db8" }
                  }}
                >
                  Open Estimation Agent
                </Button>
              </Stack>
            </CardContent>
          </Card>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <Button
              component={Link}
              href="/pricing"
              variant="outlined"
              size="large"
              sx={{ px: 3.5, py: 1.4, borderColor: "var(--line)", color: "var(--text)" }}
            >
              Open Service Calculator
            </Button>
            <Button
              component={Link}
              href="/catalog"
              variant="text"
              size="large"
              sx={{ px: 1.5, py: 1.4, color: "var(--text)" }}
            >
              Browse Catalog
            </Button>
            <Button
              component={Link}
              href="/estimates"
              variant="text"
              size="large"
              sx={{ px: 1.5, py: 1.4, color: "var(--text)" }}
            >
              Saved Estimates
            </Button>
            <Button
              component={Link}
              href="/architect"
              variant="text"
              size="large"
              sx={{ px: 1.5, py: 1.4, color: "var(--text)" }}
            >
              Architecture Diagrams
            </Button>
          </Stack>
        </Stack>
      </Container>
    </Box>
  );
}
