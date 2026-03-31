import type { CloudProvider, RecommendationRequest, ServiceCategory } from "./types";
import { formatWorkloadLabel } from "./workloads";

export type ArchitectureCloudProvider =
  | CloudProvider
  | "oracle"
  | "alibaba"
  | "ibm"
  | "tencent"
  | "digitalocean"
  | "akamai"
  | "ovhcloud"
  | "cloudflare";

export type DiagramProvider = ArchitectureCloudProvider | "shared";
export type DiagramCategory =
  | ServiceCategory
  | "identity"
  | "users"
  | "integration"
  | "observability";

export interface DiagramNode {
  id: string;
  title: string;
  subtitle: string;
  provider: DiagramProvider;
  category: DiagramCategory;
  titleFontSize: number;
  subtitleFontSize: number;
  metaFontSize: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DiagramEdge {
  id: string;
  from: string;
  to: string;
  label?: string;
}

export interface DiagramPlan {
  title: string;
  summary: string;
  assumptions: string[];
  providers: ArchitectureCloudProvider[];
  nodes: DiagramNode[];
  edges: DiagramEdge[];
}

export interface CanvasZone {
  id: string;
  label: string;
  fontSize: number;
  x: number;
  y: number;
  width: number;
  height: number;
  stroke: string;
  fill: string;
}

export interface CanvasLane {
  id: string;
  provider: DiagramProvider;
  label: string;
  fontSize: number;
  x: number;
  y: number;
  width: number;
  height: number;
  stroke: string;
  fill: string;
  text: string;
}

export type DiagramStyle = "reference" | "network" | "workflow";

export const CANVAS_WIDTH = 1280;
export const CANVAS_HEIGHT = 780;
export const NODE_WIDTH = 206;
export const NODE_HEIGHT = 86;
export const MIN_NODE_WIDTH = 160;
export const MIN_NODE_HEIGHT = 72;
export const MIN_TITLE_FONT_SIZE = 12;
export const MIN_SUBTITLE_FONT_SIZE = 10;
export const MIN_META_FONT_SIZE = 9;
export const MIN_ZONE_FONT_SIZE = 11;
export const MIN_ZONE_WIDTH = 180;
export const MIN_ZONE_HEIGHT = 120;
export const MIN_LANE_FONT_SIZE = 16;
export const MIN_LANE_WIDTH = 220;
export const MIN_LANE_HEIGHT = 260;
export const SHARED_LANE_X = 60;
export const PROVIDER_LANE_START = 320;

export const architectureProviderOptions: ArchitectureCloudProvider[] = [
  "aws",
  "azure",
  "gcp",
  "oracle",
  "alibaba",
  "ibm",
  "tencent",
  "digitalocean",
  "akamai",
  "ovhcloud",
  "cloudflare"
];

export const providerLabels: Record<ArchitectureCloudProvider, string> = {
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

export const providerColors: Record<DiagramProvider, { fill: string; stroke: string; text: string }> = {
  shared: { fill: "#edf4ff", stroke: "#8aa9df", text: "#17315c" },
  aws: { fill: "#fff1dc", stroke: "#f3a53d", text: "#7a4500" },
  azure: { fill: "#e6f2ff", stroke: "#3082ff", text: "#0f4f9b" },
  gcp: { fill: "#ecf8ef", stroke: "#4ea567", text: "#196532" },
  oracle: { fill: "#ffe8e5", stroke: "#f05f48", text: "#98281b" },
  alibaba: { fill: "#fff0e5", stroke: "#ff8a2a", text: "#9a4e11" },
  ibm: { fill: "#edf0ff", stroke: "#5a78ff", text: "#2540aa" },
  tencent: { fill: "#e8f4ff", stroke: "#2f9cff", text: "#125e9f" },
  digitalocean: { fill: "#e6f7ff", stroke: "#0080ff", text: "#0052a3" },
  akamai: { fill: "#eef3ff", stroke: "#6c7cff", text: "#3743af" },
  ovhcloud: { fill: "#eef0ff", stroke: "#4e63d9", text: "#26378f" },
  cloudflare: { fill: "#fff2e8", stroke: "#f48120", text: "#984c0f" }
};

export const quickPrompts = [
  "Design a multicloud ERP architecture across AWS and Azure with managed database, shared identity, reporting, and disaster recovery.",
  "Create a three-cloud application platform on AWS, Azure, and GCP with public ingress, container services, managed data stores, object storage, and observability.",
  "Plan a CRM deployment on Azure and GCP with API integration, analytics, backup storage, and secure internet access."
];

export const DEFAULT_ARCHITECT_PROVIDERS: ArchitectureCloudProvider[] = ["aws", "azure"];

export const categoryOptions: DiagramCategory[] = [
  "networking",
  "compute",
  "database",
  "storage",
  "analytics",
  "ai_ml",
  "security",
  "identity",
  "integration",
  "observability"
];

const providerAliases: Record<ArchitectureCloudProvider, string[]> = {
  aws: ["aws", "amazon web services", "amazon"],
  azure: ["azure", "microsoft azure", "microsoft"],
  gcp: ["gcp", "google cloud", "google cloud platform", "google"],
  oracle: ["oracle", "oracle cloud", "oci"],
  alibaba: ["alibaba", "alibaba cloud", "aliyun"],
  ibm: ["ibm", "ibm cloud"],
  tencent: ["tencent", "tencent cloud"],
  digitalocean: ["digitalocean", "digital ocean"],
  akamai: ["akamai", "linode", "akamai cloud"],
  ovhcloud: ["ovh", "ovhcloud", "ovh cloud"],
  cloudflare: ["cloudflare"]
};

const providerServices: Record<
  ArchitectureCloudProvider,
  Record<ServiceCategory | "identity" | "integration" | "observability", string>
> = {
  aws: {
    compute: "Amazon EKS",
    database: "Amazon RDS",
    storage: "Amazon S3",
    networking: "Application Load Balancer",
    analytics: "Amazon Redshift",
    ai_ml: "Amazon Bedrock",
    security: "AWS WAF",
    identity: "IAM Identity Center",
    integration: "Amazon EventBridge",
    observability: "Amazon CloudWatch"
  },
  azure: {
    compute: "Azure Kubernetes Service",
    database: "Azure SQL Database",
    storage: "Azure Blob Storage",
    networking: "Azure Front Door",
    analytics: "Azure Synapse",
    ai_ml: "Azure OpenAI Service",
    security: "Azure Firewall",
    identity: "Microsoft Entra ID",
    integration: "Azure Service Bus",
    observability: "Azure Monitor"
  },
  gcp: {
    compute: "Google Kubernetes Engine",
    database: "Cloud SQL",
    storage: "Cloud Storage",
    networking: "Cloud Load Balancing",
    analytics: "BigQuery",
    ai_ml: "Vertex AI",
    security: "Cloud Armor",
    identity: "Cloud Identity",
    integration: "Pub/Sub",
    observability: "Cloud Monitoring"
  },
  oracle: {
    compute: "Oracle Kubernetes Engine",
    database: "Autonomous Database",
    storage: "OCI Object Storage",
    networking: "OCI Load Balancer",
    analytics: "Oracle Analytics Cloud",
    ai_ml: "OCI Generative AI",
    security: "OCI Web Application Firewall",
    identity: "OCI IAM",
    integration: "OCI Streaming",
    observability: "OCI Logging and Monitoring"
  },
  alibaba: {
    compute: "Alibaba ACK",
    database: "ApsaraDB RDS",
    storage: "Alibaba OSS",
    networking: "Server Load Balancer",
    analytics: "MaxCompute",
    ai_ml: "PAI",
    security: "Alibaba Cloud Firewall",
    identity: "Resource Access Management",
    integration: "Alibaba EventBridge",
    observability: "CloudMonitor"
  },
  ibm: {
    compute: "Red Hat OpenShift on IBM Cloud",
    database: "Db2 on Cloud",
    storage: "IBM Cloud Object Storage",
    networking: "IBM Cloud Load Balancer",
    analytics: "watsonx.data",
    ai_ml: "watsonx.ai",
    security: "IBM Cloud Internet Services",
    identity: "IBM Cloud IAM",
    integration: "Event Streams",
    observability: "IBM Cloud Monitoring"
  },
  tencent: {
    compute: "Tencent Kubernetes Engine",
    database: "TencentDB",
    storage: "Tencent Cloud Object Storage",
    networking: "Cloud Load Balancer",
    analytics: "Tencent Data Warehouse",
    ai_ml: "Tencent Hunyuan",
    security: "Tencent Cloud Firewall",
    identity: "Cloud Access Management",
    integration: "Tencent EventBridge",
    observability: "Tencent Cloud Monitor"
  },
  digitalocean: {
    compute: "DigitalOcean Kubernetes",
    database: "Managed PostgreSQL",
    storage: "Spaces Object Storage",
    networking: "DigitalOcean Load Balancer",
    analytics: "Managed Kafka",
    ai_ml: "DigitalOcean GenAI Platform",
    security: "Cloud Firewalls",
    identity: "DigitalOcean IAM",
    integration: "Functions and Queues",
    observability: "DigitalOcean Monitoring"
  },
  akamai: {
    compute: "Akamai Kubernetes Engine",
    database: "Managed Databases",
    storage: "Akamai Object Storage",
    networking: "Akamai Application Load Balancer",
    analytics: "DataStream",
    ai_ml: "Akamai AI Inference",
    security: "App and API Protector",
    identity: "Akamai IAM",
    integration: "Event Center",
    observability: "Akamai Cloud Monitor"
  },
  ovhcloud: {
    compute: "OVHcloud Managed Kubernetes",
    database: "OVHcloud Managed Databases",
    storage: "OVHcloud Object Storage",
    networking: "OVHcloud Load Balancer",
    analytics: "OVHcloud Data Platform",
    ai_ml: "OVHcloud AI Endpoints",
    security: "OVHcloud Network Firewall",
    identity: "OVHcloud IAM",
    integration: "OVHcloud Event Streams",
    observability: "OVHcloud Metrics"
  },
  cloudflare: {
    compute: "Cloudflare Workers",
    database: "Cloudflare D1",
    storage: "Cloudflare R2",
    networking: "Cloudflare Load Balancer",
    analytics: "Cloudflare Analytics Engine",
    ai_ml: "Workers AI",
    security: "Cloudflare WAF",
    identity: "Cloudflare Access",
    integration: "Cloudflare Queues",
    observability: "Cloudflare Analytics"
  }
};

export function createId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function formatWorkload(workload: RecommendationRequest["workload_type"]) {
  return formatWorkloadLabel(workload);
}

export function getCategoryLabel(category: DiagramCategory) {
  return category.replaceAll("_", " ").replace(/\b\w/g, (match) => match.toUpperCase());
}

export function getProviderService(
  provider: ArchitectureCloudProvider,
  category: ServiceCategory | "identity" | "integration" | "observability"
) {
  return providerServices[provider][category];
}

export function buildPromptFromRequest(request: RecommendationRequest, name: string) {
  const providers = request.preferred_providers.map((provider) => providerLabels[provider]).join(", ");
  return `${name}: Design a ${formatWorkload(request.workload_type)} architecture in ${request.region} for ${request.user_count} users, ${request.concurrent_users} concurrent sessions, ${request.storage_gb} GB storage, ${request.monthly_requests_million} million monthly requests, ${request.requires_managed_database ? "managed database" : "application-managed data tier"}, ${request.requires_disaster_recovery ? "cross-region disaster recovery" : "single region resilience"}, targeting ${providers}.`;
}

export function buildNode(
  title: string,
  subtitle: string,
  provider: DiagramProvider,
  category: DiagramCategory,
  x: number,
  y: number,
  width = NODE_WIDTH,
  height = NODE_HEIGHT
): DiagramNode {
  return {
    id: createId(category),
    title,
    subtitle,
    provider,
    category,
    titleFontSize: 17,
    subtitleFontSize: 12.5,
    metaFontSize: 11.5,
    x,
    y,
    width,
    height
  };
}

export function detectProviders(prompt: string, selectedProviders: ArchitectureCloudProvider[]) {
  const normalized = prompt.toLowerCase();
  const mentioned = architectureProviderOptions.filter((provider) =>
    providerAliases[provider].some((alias) => normalized.includes(alias))
  );
  if (mentioned.length) {
    return mentioned;
  }

  if (selectedProviders.length) {
    return selectedProviders;
  }

  return DEFAULT_ARCHITECT_PROVIDERS;
}

function inferFeatures(prompt: string, request: RecommendationRequest | null, providerCount: number) {
  const normalized = prompt.toLowerCase();
  return {
    database:
      normalized.includes("database") ||
      normalized.includes("postgres") ||
      normalized.includes("sql") ||
      normalized.includes("mysql") ||
      Boolean(request?.requires_managed_database),
    analytics:
      normalized.includes("analytics") ||
      normalized.includes("reporting") ||
      normalized.includes("warehouse"),
    ai:
      normalized.includes("ai") ||
      normalized.includes("ml") ||
      normalized.includes("copilot") ||
      normalized.includes("llm"),
    security:
      normalized.includes("security") ||
      normalized.includes("waf") ||
      normalized.includes("firewall") ||
      normalized.includes("zero trust") ||
      (request?.availability_tier ?? "standard") !== "standard",
    identity:
      normalized.includes("identity") ||
      normalized.includes("sso") ||
      normalized.includes("federation") ||
      normalized.includes("entra") ||
      normalized.includes("auth"),
    integration:
      normalized.includes("integration") ||
      normalized.includes("event") ||
      normalized.includes("queue") ||
      normalized.includes("sync") ||
      providerCount > 1,
    observability:
      normalized.includes("observability") ||
      normalized.includes("logging") ||
      normalized.includes("monitor") ||
      normalized.includes("telemetry"),
    dr:
      normalized.includes("dr") ||
      normalized.includes("disaster recovery") ||
      normalized.includes("backup") ||
      Boolean(request?.requires_disaster_recovery)
  };
}

export function getProviderLaneWidth(providerCount: number) {
  return providerCount === 1 ? 720 : Math.max(280, Math.floor((CANVAS_WIDTH - 340) / providerCount));
}

export function buildArchitecturePlan(
  prompt: string,
  selectedProviders: ArchitectureCloudProvider[],
  request: RecommendationRequest | null,
  diagramStyle: DiagramStyle = "reference"
): DiagramPlan {
  const providers = detectProviders(prompt, selectedProviders);
  const features = inferFeatures(prompt, request, providers.length);
  const nodes: DiagramNode[] = [];
  const edges: DiagramEdge[] = [];
  const laneWidth = getProviderLaneWidth(providers.length);

  const usersNode = buildNode(
    diagramStyle === "workflow" ? "Business actors" : "Users",
    request ? `${request.user_count} business users` : "Users, partners, and internal teams",
    "shared",
    "users",
    SHARED_LANE_X,
    110
  );
  const ingressNode = buildNode(
    diagramStyle === "network" ? "Ingress and routing" : "Global ingress",
    providers.length > 1 ? "Traffic steering across clouds" : "Public and private entry point",
    "shared",
    "networking",
    SHARED_LANE_X,
    250
  );

  nodes.push(usersNode, ingressNode);
  edges.push({ id: createId("edge"), from: usersNode.id, to: ingressNode.id, label: "HTTPS" });

  let identityNode: DiagramNode | null = null;
  if (features.identity) {
    identityNode = buildNode("Identity", "Federation and access policy", "shared", "identity", SHARED_LANE_X, 390);
    nodes.push(identityNode);
  }

  let integrationNode: DiagramNode | null = null;
  if (features.integration) {
    integrationNode = buildNode(
      diagramStyle === "workflow" ? "Orchestration bus" : "Integration bus",
      "Cross-cloud API and event flow",
      "shared",
      "integration",
      SHARED_LANE_X,
      530
    );
    nodes.push(integrationNode);
  }

  let observabilityNode: DiagramNode | null = null;
  if (features.observability) {
    observabilityNode = buildNode("Observability", "Logs, traces, metrics", "shared", "observability", SHARED_LANE_X, 650);
    nodes.push(observabilityNode);
  }

  providers.forEach((provider, index) => {
    const laneX = PROVIDER_LANE_START + index * laneWidth;
    const edgeNode = buildNode(
      getProviderService(provider, "networking"),
      `${providerLabels[provider]} traffic and edge control`,
      provider,
      "networking",
      laneX,
      100
    );
    const computeNode = buildNode(
      getProviderService(provider, "compute"),
      `${providerLabels[provider]} app and service tier`,
      provider,
      "compute",
      laneX,
      230
    );
    const storageNode = buildNode(
      getProviderService(provider, "storage"),
      features.dr ? "Object storage and replicated backups" : "Object and file storage",
      provider,
      "storage",
      laneX,
      490
    );

    nodes.push(edgeNode, computeNode, storageNode);
    edges.push(
      { id: createId("edge"), from: ingressNode.id, to: edgeNode.id },
      { id: createId("edge"), from: edgeNode.id, to: computeNode.id },
      { id: createId("edge"), from: computeNode.id, to: storageNode.id }
    );

    let databaseNode: DiagramNode | null = null;
    if (features.database) {
      databaseNode = buildNode(
        getProviderService(provider, "database"),
        "Managed operational data tier",
        provider,
        "database",
        laneX,
        360
      );
      nodes.push(databaseNode);
      edges.push({ id: createId("edge"), from: computeNode.id, to: databaseNode.id });
      edges.push({ id: createId("edge"), from: databaseNode.id, to: storageNode.id, label: "backup" });
    }

    if (features.security) {
      const securityNode = buildNode(
        getProviderService(provider, "security"),
        diagramStyle === "network" ? "Firewall and inspection controls" : "Inspection and protection controls",
        provider,
        "security",
        laneX + 224,
        130,
        180,
        78
      );
      nodes.push(securityNode);
      edges.push({ id: createId("edge"), from: edgeNode.id, to: securityNode.id });
      edges.push({ id: createId("edge"), from: securityNode.id, to: computeNode.id });
    }

    if (features.analytics) {
      const analyticsNode = buildNode(
        getProviderService(provider, "analytics"),
        "Reporting and warehouse workloads",
        provider,
        "analytics",
        laneX + 224,
        360,
        180,
        78
      );
      nodes.push(analyticsNode);
      edges.push({ id: createId("edge"), from: storageNode.id, to: analyticsNode.id });
      if (databaseNode) {
        edges.push({ id: createId("edge"), from: databaseNode.id, to: analyticsNode.id });
      }
    }

    if (features.ai) {
      const aiNode = buildNode(
        getProviderService(provider, "ai_ml"),
        "Assisted workflows and inference",
        provider,
        "ai_ml",
        laneX + 224,
        490,
        180,
        78
      );
      nodes.push(aiNode);
      edges.push({ id: createId("edge"), from: computeNode.id, to: aiNode.id });
    }

    if (identityNode) {
      edges.push({ id: createId("edge"), from: identityNode.id, to: computeNode.id, label: "SSO" });
    }

    if (integrationNode) {
      edges.push({
        id: createId("edge"),
        from: integrationNode.id,
        to: computeNode.id,
        label: diagramStyle === "workflow" ? "automation" : "events"
      });
    }

    if (observabilityNode) {
      const opsNode = buildNode(
        getProviderService(provider, "observability"),
        "Provider-native telemetry",
        provider,
        "observability",
        laneX,
        620
      );
      nodes.push(opsNode);
      edges.push({ id: createId("edge"), from: computeNode.id, to: opsNode.id });
      edges.push({ id: createId("edge"), from: opsNode.id, to: observabilityNode.id });
    }
  });

  return {
    title:
      providers.length > 1
        ? `Agent Architect: ${providers.map((provider) => providerLabels[provider]).join(" + ")} multicloud`
        : `Agent Architect: ${providerLabels[providers[0]]} ${diagramStyle === "network" ? "topology" : "reference architecture"}`,
    summary:
      diagramStyle === "workflow"
        ? "The agent drafted an editable workflow view with shared orchestration, application, and data lanes."
        : providers.length > 1
          ? "The agent drafted a multicloud topology with shared ingress and governance lanes that you can edit on the canvas."
          : "The agent drafted a provider-specific topology that you can expand into a full architecture diagram.",
    assumptions: [
      `Primary workload: ${request ? formatWorkload(request.workload_type) : "application platform"}.`,
      `${providers.length > 1 ? "Cross-cloud governance is enabled." : "Single-cloud governance is assumed."}`,
      `${features.dr ? "Backup and recovery are modeled in the storage path." : "Backup and DR are not emphasized in the base draft."}`,
      `Rendered as a ${diagramStyle} diagram.`
    ],
    providers,
    nodes,
    edges
  };
}

export function buildAgentMessage(plan: DiagramPlan) {
  const providerSummary = plan.providers.map((provider) => providerLabels[provider]).join(", ");
  return `${plan.summary} Generated ${plan.nodes.length} nodes across ${providerSummary}.`;
}

export function findNextPosition(nodeCount: number) {
  const column = nodeCount % 3;
  const row = Math.floor(nodeCount / 3);
  return { x: 380 + column * 240, y: 620 + row * 92 };
}

export function buildManualNodeTitle(provider: DiagramProvider, category: DiagramCategory, title: string) {
  if (title.trim()) {
    return title.trim();
  }

  if (provider === "shared" || category === "identity" || category === "integration" || category === "observability") {
    return getCategoryLabel(category);
  }

  if (category === "users") {
    return "Users";
  }

  return getProviderService(provider, category as ServiceCategory);
}

export function buildCanvasZones(
  plan: DiagramPlan,
  diagramStyle: DiagramStyle,
  zoneOverrides: Record<string, Partial<CanvasZone>> = {}
) {
  const laneWidth = getProviderLaneWidth(plan.providers.length);
  const zones: CanvasZone[] = [
    {
      id: "shared-zone",
      label: diagramStyle === "workflow" ? "Shared flow services" : "Shared services",
      fontSize: 15,
      x: 44,
      y: 96,
      width: 214,
      height: 612,
      stroke: "#7aa0df",
      fill: "rgba(237, 244, 255, 0.45)"
    }
  ];

  plan.providers.forEach((provider, index) => {
    const laneX = PROVIDER_LANE_START + index * laneWidth;
    const zoneWidth = Math.max(laneWidth - 58, 220);

    zones.push({
      id: `${provider}-app-zone`,
      label: diagramStyle === "network" ? "Application subnet" : "Application component",
      fontSize: 15,
      x: laneX - 2,
      y: 116,
      width: zoneWidth,
      height: 228,
      stroke: providerColors[provider].stroke,
      fill: "rgba(255,255,255,0.22)"
    });

    zones.push({
      id: `${provider}-data-zone`,
      label: diagramStyle === "workflow" ? "Data and automation component" : "Data component",
      fontSize: 15,
      x: laneX - 2,
      y: 372,
      width: zoneWidth,
      height: 304,
      stroke: providerColors[provider].stroke,
      fill: "rgba(255,255,255,0.16)"
    });
  });

  return zones.map((zone) => ({ ...zone, ...(zoneOverrides[zone.id] ?? {}) }));
}

export function buildCanvasLanes(
  plan: DiagramPlan,
  diagramStyle: DiagramStyle,
  laneOverrides: Record<string, Partial<CanvasLane>> = {}
) {
  const laneWidth = getProviderLaneWidth(plan.providers.length);
  const lanes: CanvasLane[] = [
    {
      id: "lane-shared",
      provider: "shared",
      label: diagramStyle === "workflow" ? "Shared workflow services" : "Shared services",
      fontSize: 22,
      x: 28,
      y: 40,
      width: 250,
      height: 700,
      fill: "#eef4ff",
      stroke: "rgba(49, 111, 214, 0.14)",
      text: "#17315c"
    }
  ];

  plan.providers.forEach((provider, index) => {
    const laneX = PROVIDER_LANE_START + index * laneWidth;

    lanes.push({
      id: `lane-${provider}`,
      provider,
      label: providerLabels[provider],
      fontSize: 22,
      x: laneX - 18,
      y: 40,
      width: laneWidth - 14,
      height: 700,
      fill: providerColors[provider].fill,
      stroke: `${providerColors[provider].stroke}2e`,
      text: providerColors[provider].text
    });
  });

  return lanes.map((lane) => ({ ...lane, ...(laneOverrides[lane.id] ?? {}) }));
}

export function getLegendItems(diagramStyle: DiagramStyle) {
  if (diagramStyle === "network") {
    return ["HTTPS traffic", "Private connection", "Outbound traffic", "Virtual network link"];
  }

  if (diagramStyle === "workflow") {
    return ["User flow", "Control plane", "Data sync", "Automation path"];
  }

  return ["Application component", "Data component", "Shared services", "Numbered flow steps"];
}

function escapeSvgText(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export function buildArchitectureSvg(
  plan: DiagramPlan,
  diagramStyle: DiagramStyle,
  zones: CanvasZone[],
  lanes: CanvasLane[],
  canvasWidth: number
) {
  const edgeLines = plan.edges
    .map((edge) => {
      const source = plan.nodes.find((node) => node.id === edge.from);
      const target = plan.nodes.find((node) => node.id === edge.to);

      if (!source || !target) {
        return "";
      }

      const startX = source.x + source.width;
      const startY = source.y + source.height / 2;
      const endX = target.x;
      const endY = target.y + target.height / 2;
      const label = edge.label
        ? `<text x="${(startX + endX) / 2}" y="${(startY + endY) / 2 - 10}" font-size="12" fill="#60779c" text-anchor="middle">${escapeSvgText(edge.label)}</text>`
        : "";
      const dash = diagramStyle === "workflow" ? ' stroke-dasharray="10 6"' : "";

      return `<g><line x1="${startX}" y1="${startY}" x2="${endX}" y2="${endY}" stroke="#316fd6" stroke-width="3.5" stroke-linecap="round"${dash} marker-end="url(#architect-arrow)" opacity="0.9" />${label}</g>`;
    })
    .join("");

  const nodeBlocks = plan.nodes
    .map((node) => {
      const palette = providerColors[node.provider];

      return `<g>
        <rect x="${node.x}" y="${node.y}" width="${node.width}" height="${node.height}" rx="18" fill="${palette.fill}" stroke="${palette.stroke}" stroke-width="2" />
        <text x="${node.x + 18}" y="${node.y + 32}" font-size="${node.titleFontSize}" font-weight="700" fill="#17315c">${escapeSvgText(node.title)}</text>
        <text x="${node.x + 18}" y="${node.y + 56}" font-size="${node.subtitleFontSize}" fill="#60779c">${escapeSvgText(node.subtitle)}</text>
        <text x="${node.x + 18}" y="${node.y + 74}" font-size="${node.metaFontSize}" fill="${palette.text}">${escapeSvgText(
          node.provider === "shared" ? "SHARED" : providerLabels[node.provider]
        )}</text>
      </g>`;
    })
    .join("");

  const zoneBlocks = zones
    .map((zone) => {
      const labelWidth = Math.max(156, zone.label.length * 7.2 + 28);

      return `<g>
        <rect x="${zone.x}" y="${zone.y}" width="${zone.width}" height="${zone.height}" rx="22" fill="${zone.fill}" stroke="${zone.stroke}" stroke-opacity="0.28" stroke-width="2" />
        <rect x="${zone.x + 12}" y="${zone.y + 10}" width="${labelWidth}" height="32" rx="16" fill="rgba(255,255,255,0.96)" stroke="${zone.stroke}" stroke-opacity="0.22" />
        <text x="${zone.x + 28}" y="${zone.y + 31}" font-size="${zone.fontSize}" font-weight="700" fill="#17315c">${escapeSvgText(zone.label)}</text>
      </g>`;
    })
    .join("");

  const laneBlocks = lanes
    .map((lane) => {
      return `<g>
        <rect x="${lane.x}" y="${lane.y}" width="${lane.width}" height="${lane.height}" rx="24" fill="${lane.fill}" stroke="${lane.stroke}" stroke-opacity="0.9" />
        <text x="${lane.x + 20}" y="${lane.y + 38}" font-size="${lane.fontSize}" font-weight="700" fill="${lane.text}">${escapeSvgText(lane.label)}</text>
      </g>`;
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${canvasWidth} ${CANVAS_HEIGHT}" width="${canvasWidth}" height="${CANVAS_HEIGHT}" role="img" aria-label="Architecture diagram editor">
  <defs>
    <marker id="architect-arrow" markerWidth="12" markerHeight="12" refX="10" refY="6" orient="auto" markerUnits="strokeWidth">
      <path d="M 0 0 L 12 6 L 0 12 z" fill="#316fd6" />
    </marker>
  </defs>
  <rect x="0" y="0" width="${canvasWidth}" height="${CANVAS_HEIGHT}" fill="#f8fbff" />
  ${laneBlocks}
  ${zoneBlocks}
  ${edgeLines}
  ${nodeBlocks}
</svg>`;
}
