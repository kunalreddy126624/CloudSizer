"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Container,
  FormControl,
  Grid,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Typography
} from "@mui/material";

import { getServiceComparisons } from "@/lib/api";
import { formatProviderLabel } from "@/lib/cloud-providers";
import type { ServiceCategory, ServiceComparisonGroup } from "@/lib/types";

const categoryOptions: { value: ServiceCategory | "all"; label: string }[] = [
  { value: "all", label: "All categories" },
  { value: "compute", label: "Compute" },
  { value: "storage", label: "Storage" },
  { value: "database", label: "Database" },
  { value: "networking", label: "Networking" },
  { value: "analytics", label: "Analytics" },
  { value: "ai_ml", label: "AI / ML" },
  { value: "security", label: "Security" }
];

export function CatalogComparisonWorkspace() {
  const [category, setCategory] = useState<ServiceCategory | "all">("all");
  const [groups, setGroups] = useState<ServiceComparisonGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadGroups() {
      setLoading(true);
      setError(null);

      try {
        const response = await getServiceComparisons(category === "all" ? undefined : category);
        if (active) {
          setGroups(response);
        }
      } catch (loadError) {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : "Failed to load service comparisons.");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadGroups();

    return () => {
      active = false;
    };
  }, [category]);

  return (
    <Box sx={{ py: { xs: 4, md: 7 } }}>
      <Container maxWidth="xl">
        <Stack spacing={4}>
          <Card
            sx={{
              borderRadius: 6,
              border: "1px solid var(--line)",
              boxShadow: "none",
              background: "var(--hero)"
            }}
          >
            <CardContent sx={{ p: { xs: 3, md: 5 } }}>
              <Grid container spacing={3} alignItems="center">
                <Grid item xs={12} md={8}>
                  <Stack spacing={1.5}>
                    <Chip
                      label="Cross-Cloud Catalog"
                      sx={{ width: "fit-content", bgcolor: "rgba(12, 107, 88, 0.12)", color: "var(--accent)" }}
                    />
                    <Typography variant="h2" sx={{ fontSize: { xs: "2.3rem", md: "3.8rem" }, lineHeight: 0.98 }}>
                      Compare equivalent services across the broader cloud market.
                    </Typography>
                    <Typography variant="body1" sx={{ color: "var(--muted)", maxWidth: 760 }}>
                      Review aligned service families like virtual machines, managed containers, databases, CDN,
                      AI, and security services across all supported providers without bouncing between portals.
                    </Typography>
                  </Stack>
                </Grid>
                <Grid item xs={12} md={4}>
                  <FormControl fullWidth>
                    <InputLabel id="catalog-category-label">Category</InputLabel>
                    <Select
                      labelId="catalog-category-label"
                      value={category}
                      label="Category"
                      onChange={(event) => setCategory(event.target.value as ServiceCategory | "all")}
                    >
                      {categoryOptions.map((option) => (
                        <MenuItem key={option.value} value={option.value}>
                          {option.label}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>
              </Grid>
            </CardContent>
          </Card>

          {error ? <Alert severity="error">{error}</Alert> : null}

          {loading ? (
            <Card sx={{ borderRadius: 5, border: "1px solid var(--line)", boxShadow: "none" }}>
              <CardContent>
                <Stack direction="row" spacing={1.5} alignItems="center">
                  <CircularProgress size={18} />
                  <Typography variant="body2">Loading service comparison groups...</Typography>
                </Stack>
              </CardContent>
            </Card>
          ) : (
            <Grid container spacing={3}>
              {groups.map((group) => (
                <Grid item xs={12} key={group.service_family}>
                  <Card sx={{ borderRadius: 5, border: "1px solid var(--line)", boxShadow: "none" }}>
                    <CardContent>
                      <Stack spacing={2.5}>
                        <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={2}>
                          <Box>
                            <Typography variant="h5">{group.label}</Typography>
                            <Typography variant="body2" sx={{ color: "var(--muted)" }}>
                              Category: {group.category.replace("_", " ")}
                            </Typography>
                          </Box>
                          <Chip label={`${group.services.length} providers`} />
                        </Stack>
                        <Grid container spacing={2}>
                          {group.services.map((service) => (
                            <Grid item xs={12} md={4} key={service.service_code}>
                              <Card
                                sx={{
                                  borderRadius: 4,
                                  border: "1px solid var(--line)",
                                  boxShadow: "none",
                                  bgcolor: "var(--panel-strong)",
                                  height: "100%"
                                }}
                              >
                                <CardContent>
                                  <Stack spacing={1.5}>
                                    <Chip label={formatProviderLabel(service.provider)} sx={{ width: "fit-content" }} />
                                    <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                                      {service.name}
                                    </Typography>
                                    <Typography variant="body2" sx={{ color: "var(--muted)" }}>
                                      {service.summary}
                                    </Typography>
                                    <Typography variant="body2" sx={{ color: "var(--muted)" }}>
                                      Default region: {service.default_region}
                                    </Typography>
                                    <Typography variant="body2" sx={{ color: "var(--muted)" }}>
                                      Base monthly: ${service.base_monthly_cost_usd.toFixed(2)}
                                    </Typography>
                                    <Typography variant="caption" sx={{ color: "var(--muted)" }}>
                                      Dimensions: {service.dimensions.map((item) => item.label).join(", ")}
                                    </Typography>
                                    <Button
                                      component={Link}
                                      href={`/pricing?provider=${service.provider}&service_code=${service.service_code}`}
                                      variant="outlined"
                                      size="small"
                                      sx={{ alignSelf: "flex-start", borderColor: "var(--line)", color: "var(--text)" }}
                                    >
                                      Estimate This Service
                                    </Button>
                                  </Stack>
                                </CardContent>
                              </Card>
                            </Grid>
                          ))}
                        </Grid>
                      </Stack>
                    </CardContent>
                  </Card>
                </Grid>
              ))}
            </Grid>
          )}
        </Stack>
      </Container>
    </Box>
  );
}
