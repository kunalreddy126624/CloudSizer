import { buildArchitecturePlan, buildCanvasZones } from "../src/lib/architect-diagram.ts";

const scenarios = [
  {
    name: "reference-aws-azure",
    style: "reference",
    prompt: "Design a resilient ERP on AWS and Azure with identity, analytics, and DR.",
    selectedProviders: ["aws", "azure"],
    expectedProviders: ["aws", "azure"]
  },
  {
    name: "network-oracle-ibm",
    style: "network",
    prompt: "Create a network topology on Oracle and IBM Cloud with ingress, firewall, database, and backup paths.",
    selectedProviders: ["oracle", "ibm"],
    expectedProviders: ["oracle", "ibm"]
  },
  {
    name: "workflow-cloudflare-aws",
    style: "workflow",
    prompt: "Plan a workflow diagram for an edge workload across Cloudflare and AWS with queues, storage, observability, and automation.",
    selectedProviders: ["cloudflare", "aws"],
    expectedProviders: ["aws", "cloudflare"]
  },
  {
    name: "reference-gcp-single",
    style: "reference",
    prompt: "Design a CRM on GCP with managed database, storage, and monitoring.",
    selectedProviders: ["gcp"],
    expectedProviders: ["gcp"]
  }
];

for (const scenario of scenarios) {
  const plan = buildArchitecturePlan(scenario.prompt, scenario.selectedProviders, null, scenario.style);
  const zones = buildCanvasZones(plan, scenario.style);

  if (!plan.nodes.length) {
    throw new Error(`${scenario.name}: expected nodes`);
  }

  if (!plan.edges.length) {
    throw new Error(`${scenario.name}: expected edges`);
  }

  if (plan.providers.join(",") !== scenario.expectedProviders.join(",")) {
    throw new Error(
      `${scenario.name}: expected providers ${scenario.expectedProviders.join(",")} but got ${plan.providers.join(",")}`
    );
  }

  if (zones.length < plan.providers.length + 1) {
    throw new Error(`${scenario.name}: expected zones for shared + provider lanes`);
  }
}

console.log(`Verified ${scenarios.length} architect diagram scenarios across reference, network, and workflow styles.`);
