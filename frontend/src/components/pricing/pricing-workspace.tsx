"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

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
  FormControl,
  Grid,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography
} from "@mui/material";

import { useAuth } from "@/components/auth/auth-provider";
import { calculateServicePricing, createSavedEstimate, getCatalogServices, refreshLivePricing } from "@/lib/api";
import { formatProviderLabel, providerOptions } from "@/lib/cloud-providers";
import { MAX_GUEST_RUNS, loadGuestUsageSummary, recordGuestUsage } from "@/lib/guest-usage";
import type {
  CatalogService,
  CloudProvider,
  ServiceCategory,
  ServicePricingLineItemRequest,
  ServicePricingRequest,
  ServicePricingResponse
} from "@/lib/types";

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

interface DraftLineItem extends ServicePricingLineItemRequest {
  service_name: string;
  category: ServiceCategory;
}

function ServiceCatalogCard({
  service,
  onAdd
}: {
  service: CatalogService;
  onAdd: (service: CatalogService) => void;
}) {
  return (
    <Card sx={{ borderRadius: 4, border: "1px solid var(--line)", boxShadow: "none", height: "100%" }}>
      <CardContent>
        <Stack spacing={2}>
          <Stack direction="row" justifyContent="space-between" spacing={1} alignItems="flex-start">
            <Box>
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                {service.name}
              </Typography>
              <Typography variant="body2" sx={{ color: "var(--muted)", mt: 0.5 }}>
                {service.summary}
              </Typography>
            </Box>
            <Chip label={service.category.replace("_", " ")} />
          </Stack>
          <Typography variant="body2" sx={{ color: "var(--muted)" }}>
            Base monthly cost: ${service.base_monthly_cost_usd.toFixed(2)}
          </Typography>
          <Typography variant="caption" sx={{ color: "var(--muted)" }}>
            Default region: {service.default_region}
          </Typography>
          <Button
            variant="outlined"
            onClick={() => onAdd(service)}
            sx={{ alignSelf: "flex-start", borderColor: "var(--line)", color: "var(--text)" }}
          >
            Add to Estimate
          </Button>
        </Stack>
      </CardContent>
    </Card>
  );
}

export function PricingWorkspace() {
  const { isAuthenticated } = useAuth();
  const searchParams = useSearchParams();
  const [provider, setProvider] = useState<CloudProvider>("aws");
  const [category, setCategory] = useState<ServiceCategory | "all">("all");
  const [catalog, setCatalog] = useState<CatalogService[]>([]);
  const [selectedItems, setSelectedItems] = useState<DraftLineItem[]>([]);
  const [pricingResult, setPricingResult] = useState<ServicePricingResponse | null>(null);
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const [calculating, setCalculating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveName, setSaveName] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [refreshMessage, setRefreshMessage] = useState<string | null>(null);
  const [refreshingLivePricing, setRefreshingLivePricing] = useState(false);
  const [guestSummary, setGuestSummary] = useState(loadGuestUsageSummary);

  useEffect(() => {
    setGuestSummary(loadGuestUsageSummary());
  }, [isAuthenticated]);

  useEffect(() => {
    let active = true;

    async function loadCatalog() {
      setLoadingCatalog(true);
      setError(null);

      try {
        const response = await getCatalogServices(provider, category === "all" ? undefined : category);
        if (active) {
          setCatalog(response);
        }
      } catch (loadError) {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : "Failed to load service catalog.");
        }
      } finally {
        if (active) {
          setLoadingCatalog(false);
        }
      }
    }

    loadCatalog();

    return () => {
      active = false;
    };
  }, [provider, category]);

  useEffect(() => {
    setSelectedItems([]);
    setPricingResult(null);
    setSaveName("");
    setSaveMessage(null);
  }, [provider]);

  useEffect(() => {
    const providerParam = searchParams.get("provider") as CloudProvider | null;
    const serviceCodeParam = searchParams.get("service_code");

    if (providerParam && providerOptions.some((option) => option.value === providerParam)) {
      setProvider(providerParam);
    }

    if (!serviceCodeParam || !catalog.length) {
      return;
    }

    const service = catalog.find((item) => item.service_code === serviceCodeParam);
    if (service && !selectedItems.some((item) => item.service_code === serviceCodeParam)) {
      handleAddService(service);
    }
  }, [catalog, searchParams, selectedItems]);

  useEffect(() => {
    if (!pricingResult) {
      return;
    }

    setSaveName(`${formatProviderLabel(provider)} pricing estimate`);
  }, [pricingResult, provider]);

  const selectedServiceCodes = useMemo(
    () => new Set(selectedItems.map((item) => item.service_code)),
    [selectedItems]
  );

  function handleAddService(service: CatalogService) {
    if (selectedServiceCodes.has(service.service_code)) {
      return;
    }

    setSelectedItems((current) => [
      ...current,
      {
        service_code: service.service_code,
        service_name: service.name,
        category: service.category,
        region: service.default_region,
        usage: Object.fromEntries(service.dimensions.map((dimension) => [dimension.key, dimension.suggested_value]))
      }
    ]);
  }

  function updateLineItem(index: number, updater: (item: DraftLineItem) => DraftLineItem) {
    setSelectedItems((current) => current.map((item, itemIndex) => (itemIndex === index ? updater(item) : item)));
  }

  function removeLineItem(index: number) {
    setSelectedItems((current) => current.filter((_, itemIndex) => itemIndex !== index));
  }

  async function runCalculation() {
    if (!selectedItems.length) {
      setError("Add at least one service to calculate pricing.");
      return;
    }

    if (!isAuthenticated && loadGuestUsageSummary().remaining <= 0) {
      setError(`Guest access is limited to ${MAX_GUEST_RUNS} estimate runs. Sign in to continue.`);
      return;
    }

    setCalculating(true);
    setError(null);
    setSaveMessage(null);

    try {
      const request: ServicePricingRequest = {
        provider,
        items: selectedItems.map(({ service_code, region, usage }) => ({
          service_code,
          region,
          usage
        }))
      };

      const response = await calculateServicePricing(request);
      setPricingResult(response);
      if (!isAuthenticated) {
        setGuestSummary(recordGuestUsage("pricing"));
      }
    } catch (calculationError) {
      setError(calculationError instanceof Error ? calculationError.message : "Failed to calculate pricing.");
    } finally {
      setCalculating(false);
    }
  }

  async function handleSaveEstimate() {
    if (!pricingResult) {
      return;
    }

    if (!saveName.trim()) {
      setError("Enter a name before saving this estimate.");
      return;
    }

    setSaving(true);
    setError(null);
    setSaveMessage(null);

    try {
      const record = await createSavedEstimate({
        name: saveName.trim(),
        estimate_type: "pricing_calculation",
        provider,
        estimated_monthly_cost_usd: pricingResult.estimated_monthly_cost_usd,
        summary: `Pricing estimate for ${pricingResult.items.length} ${formatProviderLabel(provider)} service lines.`,
        payload: {
          request: {
            provider,
            items: selectedItems.map(({ service_code, region, usage }) => ({
              service_code,
              region,
              usage
            }))
          },
          response: pricingResult
        }
      });
      setSaveMessage(`Saved estimate #${record.id}.`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save estimate.");
    } finally {
      setSaving(false);
    }
  }

  async function handleRefreshLivePricing() {
    setRefreshingLivePricing(true);
    setError(null);
    setRefreshMessage(null);

    try {
      const response = await refreshLivePricing({ providers: [provider] });
      const result = response.results[0];
      setRefreshMessage(
        `${result.provider.toUpperCase()}: updated ${result.updated_services} services, skipped ${result.skipped_services}.`
      );
      const refreshedCatalog = await getCatalogServices(provider, category === "all" ? undefined : category);
      setCatalog(refreshedCatalog);
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : "Failed to refresh live pricing.");
    } finally {
      setRefreshingLivePricing(false);
    }
  }

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
                      label="Service Pricing Workspace"
                      sx={{ width: "fit-content", bgcolor: "rgba(12, 107, 88, 0.12)", color: "var(--accent)" }}
                    />
                    <Typography variant="h2" sx={{ fontSize: { xs: "2.3rem", md: "3.8rem" }, lineHeight: 0.98 }}>
                      Explore and calculate cloud services one line item at a time.
                    </Typography>
                    <Typography variant="body1" sx={{ color: "var(--muted)", maxWidth: 760 }}>
                      Browse comparable services across all supported providers, tune usage dimensions, and build a
                      multi-line estimate for the exact services you want to compare.
                    </Typography>
                  </Stack>
                </Grid>
                <Grid item xs={12} md={4}>
                  <Stack spacing={2}>
                    <FormControl fullWidth>
                      <InputLabel id="provider-filter-label">Provider</InputLabel>
                      <Select
                        labelId="provider-filter-label"
                        value={provider}
                        label="Provider"
                        onChange={(event) => setProvider(event.target.value as CloudProvider)}
                      >
                        {providerOptions.map((option) => (
                          <MenuItem key={option.value} value={option.value}>
                            {option.label}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                    <FormControl fullWidth>
                      <InputLabel id="category-filter-label">Category</InputLabel>
                      <Select
                        labelId="category-filter-label"
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
                  </Stack>
                </Grid>
              </Grid>
            </CardContent>
          </Card>

          {error ? <Alert severity="error">{error}</Alert> : null}
          {refreshMessage ? <Alert severity="success">{refreshMessage}</Alert> : null}
          {!isAuthenticated ? (
            <Alert severity={guestSummary.remaining > 0 ? "info" : "warning"}>
              Guest access is limited to {MAX_GUEST_RUNS} estimate runs total. You have {guestSummary.remaining}{" "}
              remaining.
            </Alert>
          ) : null}

          <Grid container spacing={3}>
            <Grid item xs={12} lg={7}>
              <Stack spacing={3}>
                <Card sx={{ borderRadius: 5, border: "1px solid var(--line)", boxShadow: "none" }}>
                  <CardContent>
                    <Stack spacing={1.5} sx={{ mb: 3 }}>
                      <Typography variant="h5">Service Catalog</Typography>
                      <Typography variant="body2" sx={{ color: "var(--muted)" }}>
                        Add services to the estimate builder. Switching provider resets the current draft so you can
                        explore one cloud service stack at a time.
                      </Typography>
                      <Button
                        variant="outlined"
                        onClick={handleRefreshLivePricing}
                        disabled={refreshingLivePricing}
                        sx={{ alignSelf: "flex-start", borderColor: "var(--line)", color: "var(--text)" }}
                      >
                        {refreshingLivePricing ? "Refreshing..." : "Refresh Live Pricing"}
                      </Button>
                    </Stack>
                    {loadingCatalog ? (
                      <Stack direction="row" spacing={1.5} alignItems="center">
                        <CircularProgress size={18} />
                        <Typography variant="body2">Loading service catalog...</Typography>
                      </Stack>
                    ) : (
                      <Grid container spacing={2}>
                        {catalog.map((service) => (
                          <Grid item xs={12} md={6} key={service.service_code}>
                            <ServiceCatalogCard service={service} onAdd={handleAddService} />
                          </Grid>
                        ))}
                      </Grid>
                    )}
                  </CardContent>
                </Card>
              </Stack>
            </Grid>

            <Grid item xs={12} lg={5}>
              <Stack spacing={3}>
                <Card sx={{ borderRadius: 5, border: "1px solid var(--line)", boxShadow: "none" }}>
                  <CardContent>
                    <Stack spacing={2}>
                      <Stack direction="row" justifyContent="space-between" alignItems="center">
                        <Box>
                          <Typography variant="h5">Estimate Builder</Typography>
                          <Typography variant="body2" sx={{ color: "var(--muted)" }}>
                            Configure usage values for selected services.
                          </Typography>
                        </Box>
                        <Chip label={formatProviderLabel(provider)} />
                      </Stack>
                      {selectedItems.length ? (
                        selectedItems.map((item, index) => {
                          const service = catalog.find((catalogItem) => catalogItem.service_code === item.service_code);

                          return (
                            <Card
                              key={item.service_code}
                              sx={{ borderRadius: 4, border: "1px solid var(--line)", boxShadow: "none", bgcolor: "var(--panel-strong)" }}
                            >
                              <CardContent>
                                <Stack spacing={2}>
                                  <Stack direction="row" justifyContent="space-between" alignItems="center">
                                    <Box>
                                      <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                                        {item.service_name}
                                      </Typography>
                                      <Typography variant="caption" sx={{ color: "var(--muted)" }}>
                                        {item.category.replace("_", " ")}
                                      </Typography>
                                    </Box>
                                    <Button size="small" color="inherit" onClick={() => removeLineItem(index)}>
                                      Remove
                                    </Button>
                                  </Stack>
                                  <TextField
                                    label="Region"
                                    value={item.region ?? ""}
                                    onChange={(event) =>
                                      updateLineItem(index, (current) => ({
                                        ...current,
                                        region: event.target.value
                                      }))
                                    }
                                  />
                                  <Grid container spacing={2}>
                                    {service?.dimensions.map((dimension) => (
                                      <Grid item xs={12} sm={6} key={dimension.key}>
                                        <TextField
                                          label={`${dimension.label} (${dimension.unit})`}
                                          type="number"
                                          value={item.usage[dimension.key] ?? 0}
                                          onChange={(event) =>
                                            updateLineItem(index, (current) => ({
                                              ...current,
                                              usage: {
                                                ...current.usage,
                                                [dimension.key]: Number(event.target.value)
                                              }
                                            }))
                                          }
                                          inputProps={{ min: 0, step: "0.1" }}
                                          fullWidth
                                        />
                                      </Grid>
                                    ))}
                                  </Grid>
                                </Stack>
                              </CardContent>
                            </Card>
                          );
                        })
                      ) : (
                        <Typography variant="body2" sx={{ color: "var(--muted)" }}>
                          No services selected yet. Add services from the catalog to start building an estimate.
                        </Typography>
                      )}
                      <Button
                        variant="contained"
                        disabled={calculating}
                        onClick={runCalculation}
                        sx={{ py: 1.4, borderRadius: 3, bgcolor: "var(--accent)", "&:hover": { bgcolor: "#095847" } }}
                      >
                        {calculating ? "Calculating..." : "Calculate Pricing"}
                      </Button>
                    </Stack>
                  </CardContent>
                </Card>

                <Card sx={{ borderRadius: 5, border: "1px solid var(--line)", boxShadow: "none" }}>
                  <CardContent>
                    <Stack spacing={2}>
                      <Typography variant="h5">Pricing Result</Typography>
                      {pricingResult ? (
                        <>
                          <Typography variant="h3">${pricingResult.estimated_monthly_cost_usd.toFixed(2)}</Typography>
                          <Typography variant="body2" sx={{ color: "var(--muted)" }}>
                            Estimated monthly total for the selected {formatProviderLabel(pricingResult.provider)} services.
                          </Typography>
                          {pricingResult.accuracy ? (
                            <Alert severity={pricingResult.accuracy.confidence_score >= 70 ? "success" : "warning"}>
                              Confidence {pricingResult.accuracy.confidence_score}% | Live pricing{" "}
                              {pricingResult.accuracy.live_pricing_coverage_percent}% | Actual comparisons{" "}
                              {pricingResult.accuracy.compared_actuals_count}
                            </Alert>
                          ) : null}
                          <Divider />
                          <Card sx={{ borderRadius: 4, border: "1px solid var(--line)", boxShadow: "none", bgcolor: "var(--panel-strong)" }}>
                            <CardContent>
                              <Stack spacing={1.5}>
                                <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                                  Save This Estimate
                                </Typography>
                                <TextField
                                  label="Estimate name"
                                  value={saveName}
                                  onChange={(event) => setSaveName(event.target.value)}
                                />
                                <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
                                  <Button
                                    variant="contained"
                                    disabled={saving}
                                    onClick={handleSaveEstimate}
                                    sx={{ bgcolor: "var(--accent)", "&:hover": { bgcolor: "#095847" } }}
                                  >
                                    {saving ? "Saving..." : "Save Estimate"}
                                  </Button>
                                  <Button
                                    href="/estimates"
                                    component={Link}
                                    variant="outlined"
                                    sx={{ borderColor: "var(--line)", color: "var(--text)" }}
                                  >
                                    View Saved Estimates
                                  </Button>
                                </Stack>
                                {saveMessage ? <Alert severity="success">{saveMessage}</Alert> : null}
                              </Stack>
                            </CardContent>
                          </Card>
                          {pricingResult.items.map((item) => (
                            <Card
                              key={item.service_code}
                              sx={{ borderRadius: 4, border: "1px solid var(--line)", boxShadow: "none", bgcolor: "var(--panel-strong)" }}
                            >
                              <CardContent>
                                <Stack spacing={1.2}>
                                  <Stack direction="row" justifyContent="space-between" spacing={2}>
                                    <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                                      {item.service_name}
                                    </Typography>
                                    <Typography variant="subtitle1">
                                      ${item.estimated_monthly_cost_usd.toFixed(2)}
                                    </Typography>
                                  </Stack>
                                  <Typography variant="body2" sx={{ color: "var(--muted)" }}>
                                    Base cost: ${item.base_monthly_cost_usd.toFixed(2)} | Region: {item.region} | Source:{" "}
                                    {item.pricing_source.replaceAll("_", " ")}
                                  </Typography>
                                  {item.accuracy ? (
                                    <Typography variant="body2" sx={{ color: "var(--muted)" }}>
                                      Service confidence: {item.accuracy.confidence_score}% ({item.accuracy.confidence_label})
                                    </Typography>
                                  ) : null}
                                  {item.dimensions.map((dimension) => (
                                    <Typography key={dimension.key} variant="caption" sx={{ color: "var(--muted)" }}>
                                      {dimension.label}: {dimension.quantity} {dimension.unit} x $
                                      {dimension.rate_per_unit_usd.toFixed(4)} = $
                                      {dimension.estimated_monthly_cost_usd.toFixed(2)}
                                    </Typography>
                                  ))}
                                </Stack>
                              </CardContent>
                            </Card>
                          ))}
                        </>
                      ) : (
                        <Typography variant="body2" sx={{ color: "var(--muted)" }}>
                          Run a calculation to see the estimated monthly total and service-by-service breakdown.
                        </Typography>
                      )}
                    </Stack>
                  </CardContent>
                </Card>
              </Stack>
            </Grid>
          </Grid>
        </Stack>
      </Container>
    </Box>
  );
}
