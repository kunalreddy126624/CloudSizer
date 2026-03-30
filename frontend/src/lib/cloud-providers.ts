import { optionSets } from "@/lib/defaults";
import type { CloudProvider } from "@/lib/types";

export const providerLabels: Record<CloudProvider, string> = {
  aws: "AWS",
  azure: "Azure",
  gcp: "GCP",
  oracle: "Oracle Cloud",
  alibaba: "Alibaba Cloud",
  ibm: "IBM Cloud",
  tencent: "Tencent Cloud",
  digitalocean: "DigitalOcean",
  akamai: "Akamai Cloud",
  ovhcloud: "OVHcloud",
  cloudflare: "Cloudflare"
};

export const providerOptions = optionSets.providers.map((provider) => ({
  value: provider,
  label: providerLabels[provider]
}));

export function formatProviderLabel(provider: CloudProvider) {
  return providerLabels[provider];
}
