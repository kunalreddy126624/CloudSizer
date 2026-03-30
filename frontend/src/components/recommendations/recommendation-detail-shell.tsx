"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";

import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Container,
  Divider,
  Grid,
  List,
  ListItem,
  ListItemText,
  Stack,
  Typography
} from "@mui/material";

import { getRecommendations } from "@/lib/api";
import { parseRecommendationRequest } from "@/lib/query";
import type { ArchitectureRecommendation, CloudProvider } from "@/lib/types";
import { ArchitectureDiagram } from "@/components/recommendations/architecture-diagram";

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <Card sx={{ borderRadius: 4, border: "1px solid var(--line)", boxShadow: "none", height: "100%" }}>
      <CardContent>
        <Typography variant="overline" sx={{ color: "var(--muted)" }}>
          {label}
        </Typography>
        <Typography variant="h5">{value}</Typography>
      </CardContent>
    </Card>
  );
}

export function RecommendationDetailShell() {
  const params = useParams<{ provider: string }>();
  const searchParams = useSearchParams();
  const [recommendation, setRecommendation] = useState<ArchitectureRecommendation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const request = useMemo(() => parseRecommendationRequest(new URLSearchParams(searchParams.toString())), [searchParams]);
  const provider = (params.provider ?? "aws") as CloudProvider;

  useEffect(() => {
    let active = true;

    async function loadRecommendation() {
      try {
        const response = await getRecommendations(request);
        const match = response.recommendations.find((item) => item.provider === provider);

        if (!match) {
          throw new Error(`No recommendation was returned for provider ${provider.toUpperCase()}.`);
        }

        if (active) {
          setRecommendation(match);
        }
      } catch (loadError) {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : "Failed to load recommendation detail.");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadRecommendation();

    return () => {
      active = false;
    };
  }, [provider, request]);

  return (
    <Box sx={{ py: { xs: 4, md: 7 } }}>
      <Container maxWidth="xl">
        <Stack spacing={3}>
          <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" spacing={2}>
            <Box>
              <Typography variant="overline" sx={{ color: "var(--muted)", letterSpacing: "0.18em" }}>
                Recommendation Detail
              </Typography>
              <Typography variant="h3" sx={{ mt: 0.5 }}>
                {provider.toUpperCase()} workload fit
              </Typography>
              <Typography variant="body1" sx={{ color: "var(--muted)", mt: 1 }}>
                Review the recommended services, architecture outline, and cost summary. Use print to export as PDF.
              </Typography>
            </Box>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
              <Button component={Link} href="/estimator" variant="outlined" sx={{ borderColor: "var(--line)", color: "var(--text)" }}>
                Back to Estimator
              </Button>
              <Button variant="contained" onClick={() => window.print()} sx={{ bgcolor: "var(--accent)", "&:hover": { bgcolor: "#095847" } }}>
                Export to PDF
              </Button>
            </Stack>
          </Stack>

          {loading ? (
            <Card sx={{ borderRadius: 5, border: "1px solid var(--line)", boxShadow: "none" }}>
              <CardContent>
                <Stack direction="row" spacing={1.5} alignItems="center">
                  <CircularProgress size={18} />
                  <Typography variant="body2">Loading recommendation detail...</Typography>
                </Stack>
              </CardContent>
            </Card>
          ) : null}

          {error ? <Alert severity="error">{error}</Alert> : null}

          {recommendation ? (
            <>
              <Grid container spacing={2}>
                <Grid item xs={12} md={3}>
                  <MetricCard label="Monthly estimate" value={`$${recommendation.estimated_monthly_cost_usd.toFixed(2)}`} />
                </Grid>
                <Grid item xs={12} md={3}>
                  <MetricCard label="Score" value={String(recommendation.score)} />
                </Grid>
                <Grid item xs={12} md={3}>
                  <MetricCard label="Profile" value={recommendation.profile} />
                </Grid>
                <Grid item xs={12} md={3}>
                  <MetricCard label="Workload" value={request.workload_type.toUpperCase()} />
                </Grid>
              </Grid>

              <ArchitectureDiagram recommendation={recommendation} />

              <Grid container spacing={3}>
                <Grid item xs={12} lg={7}>
                  <Card sx={{ borderRadius: 5, border: "1px solid var(--line)", boxShadow: "none", height: "100%" }}>
                    <CardContent>
                      <Stack spacing={2.5}>
                        <Typography variant="h6">Service Breakdown</Typography>
                        <List disablePadding>
                          {recommendation.services.map((service) => (
                            <ListItem key={service.name} disableGutters sx={{ py: 1.25 }}>
                              <ListItemText
                                primary={service.name}
                                secondary={service.purpose}
                                primaryTypographyProps={{ fontWeight: 700 }}
                                secondaryTypographyProps={{ color: "var(--muted)" }}
                              />
                              <Chip label={`$${service.estimated_monthly_cost_usd.toFixed(2)}`} />
                            </ListItem>
                          ))}
                        </List>
                      </Stack>
                    </CardContent>
                  </Card>
                </Grid>
                <Grid item xs={12} lg={5}>
                  <Card sx={{ borderRadius: 5, border: "1px solid var(--line)", boxShadow: "none", height: "100%" }}>
                    <CardContent>
                      <Stack spacing={2.5}>
                        <Typography variant="h6">Rationale</Typography>
                        <Divider />
                        {recommendation.rationale.map((reason) => (
                          <Typography key={reason} variant="body1" sx={{ color: "var(--muted)" }}>
                            {reason}
                          </Typography>
                        ))}
                        <Divider />
                        <Stack spacing={1}>
                          <Typography variant="subtitle2">Request profile</Typography>
                          <Typography variant="body2" sx={{ color: "var(--muted)" }}>
                            Region: {request.region}
                          </Typography>
                          <Typography variant="body2" sx={{ color: "var(--muted)" }}>
                            Users: {request.user_count} total / {request.concurrent_users} concurrent
                          </Typography>
                          <Typography variant="body2" sx={{ color: "var(--muted)" }}>
                            Storage: {request.storage_gb} GB
                          </Typography>
                          <Typography variant="body2" sx={{ color: "var(--muted)" }}>
                            Requests: {request.monthly_requests_million} million per month
                          </Typography>
                        </Stack>
                      </Stack>
                    </CardContent>
                  </Card>
                </Grid>
              </Grid>
            </>
          ) : null}
        </Stack>
      </Container>
    </Box>
  );
}
