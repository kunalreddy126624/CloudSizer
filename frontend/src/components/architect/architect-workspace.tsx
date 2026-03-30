"use client";

import type { PointerEvent as ReactPointerEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Container,
  FormControl,
  Grid,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography
} from "@mui/material";

import { DEFAULT_REQUEST, optionSets } from "@/lib/defaults";
import {
  loadArchitectCanvasDraft,
  clearPendingArchitectScenario,
  loadPendingArchitectScenario,
  storeArchitectCanvasDraft
} from "@/lib/scenario-store";
import type { CloudProvider, RecommendationRequest, ServiceCategory } from "@/lib/types";

type ArchitectureCloudProvider =
  | CloudProvider
  | "oracle"
  | "alibaba"
  | "ibm"
  | "tencent"
  | "digitalocean"
  | "akamai"
  | "ovhcloud"
  | "cloudflare";

type DiagramProvider = ArchitectureCloudProvider | "shared";
type DiagramCategory =
  | ServiceCategory
  | "identity"
  | "users"
  | "integration"
  | "observability";

interface DiagramNode {
  id: string;
  title: string;
  subtitle: string;
  provider: DiagramProvider;
  category: DiagramCategory;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface DiagramEdge {
  id: string;
  from: string;
  to: string;
  label?: string;
}

interface DiagramPlan {
  title: string;
  summary: string;
  assumptions: string[];
  providers: ArchitectureCloudProvider[];
  nodes: DiagramNode[];
  edges: DiagramEdge[];
}

interface ArchitectWorkspaceProps {
  canvasOnly?: boolean;
}

type DiagramStyle = "reference" | "network" | "workflow";

const CANVAS_WIDTH = 1280;
const CANVAS_HEIGHT = 780;
const NODE_WIDTH = 206;
const NODE_HEIGHT = 86;
const SHARED_LANE_X = 60;
const PROVIDER_LANE_START = 320;

const architectureProviderOptions: ArchitectureCloudProvider[] = [
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

const providerLabels: Record<ArchitectureCloudProvider, string> = {
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

const providerColors: Record<DiagramProvider, { fill: string; stroke: string; text: string }> = {
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

const quickPrompts = [
  "Design a multicloud ERP architecture across AWS and Azure with managed database, shared identity, reporting, and disaster recovery.",
  "Create a three-cloud application platform on AWS, Azure, and GCP with public ingress, container services, managed data stores, object storage, and observability.",
  "Plan a CRM deployment on Azure and GCP with API integration, analytics, backup storage, and secure internet access."
];

const categoryOptions: DiagramCategory[] = [
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

function createId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function formatWorkload(workload: RecommendationRequest["workload_type"]) {
  if (workload === "erp") {
    return "ERP";
  }

  if (workload === "crm") {
    return "CRM";
  }

  return "Application";
}

function getCategoryLabel(category: DiagramCategory) {
  return category.replaceAll("_", " ").replace(/\b\w/g, (match) => match.toUpperCase());
}

function getProviderService(
  provider: ArchitectureCloudProvider,
  category: ServiceCategory | "identity" | "integration" | "observability"
) {
  return providerServices[provider][category];
}

function buildPromptFromRequest(request: RecommendationRequest, name: string) {
  const providers = request.preferred_providers.map((provider) => providerLabels[provider]).join(", ");
  return `${name}: Design a ${formatWorkload(request.workload_type)} architecture in ${request.region} for ${request.user_count} users, ${request.concurrent_users} concurrent sessions, ${request.storage_gb} GB storage, ${request.monthly_requests_million} million monthly requests, ${request.requires_managed_database ? "managed database" : "application-managed data tier"}, ${request.requires_disaster_recovery ? "cross-region disaster recovery" : "single region resilience"}, targeting ${providers}.`;
}

function buildNode(
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
    x,
    y,
    width,
    height
  };
}

function detectProviders(prompt: string, selectedProviders: ArchitectureCloudProvider[]) {
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

  return [...DEFAULT_REQUEST.preferred_providers];
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

function getProviderLaneWidth(providerCount: number) {
  return providerCount === 1 ? 720 : Math.max(280, Math.floor((CANVAS_WIDTH - 340) / providerCount));
}

function buildArchitecturePlan(
  prompt: string,
  selectedProviders: ArchitectureCloudProvider[],
  request: RecommendationRequest | null
): DiagramPlan {
  const providers = detectProviders(prompt, selectedProviders);
  const features = inferFeatures(prompt, request, providers.length);
  const nodes: DiagramNode[] = [];
  const edges: DiagramEdge[] = [];
  const laneWidth = getProviderLaneWidth(providers.length);

  const usersNode = buildNode(
    "Users",
    request ? `${request.user_count} business users` : "Users, partners, and internal teams",
    "shared",
    "users",
    SHARED_LANE_X,
    110
  );
  const ingressNode = buildNode(
    "Global ingress",
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
    integrationNode = buildNode("Integration bus", "Cross-cloud API and event flow", "shared", "integration", SHARED_LANE_X, 530);
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
        "Inspection and protection controls",
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
      edges.push({ id: createId("edge"), from: integrationNode.id, to: computeNode.id, label: "events" });
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
        : `Agent Architect: ${providerLabels[providers[0]]} reference architecture`,
    summary:
      providers.length > 1
        ? "The agent drafted a multicloud topology with shared ingress and governance lanes that you can edit on the canvas."
        : "The agent drafted a provider-specific topology that you can expand into a full architecture diagram.",
    assumptions: [
      `Primary workload: ${request ? formatWorkload(request.workload_type) : "application platform"}.`,
      `${providers.length > 1 ? "Cross-cloud governance is enabled." : "Single-cloud governance is assumed."}`,
      `${features.dr ? "Backup and recovery are modeled in the storage path." : "Backup and DR are not emphasized in the base draft."}`
    ],
    providers,
    nodes,
    edges
  };
}

function findNextPosition(nodeCount: number) {
  const column = nodeCount % 3;
  const row = Math.floor(nodeCount / 3);
  return { x: 380 + column * 240, y: 620 + row * 92 };
}

function buildManualNodeTitle(provider: DiagramProvider, category: DiagramCategory, title: string) {
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

function getBounds(nodes: DiagramNode[]) {
  if (!nodes.length) {
    return null;
  }

  const minX = Math.min(...nodes.map((node) => node.x));
  const minY = Math.min(...nodes.map((node) => node.y));
  const maxX = Math.max(...nodes.map((node) => node.x + node.width));
  const maxY = Math.max(...nodes.map((node) => node.y + node.height));

  return {
    x: minX - 24,
    y: minY - 28,
    width: maxX - minX + 48,
    height: maxY - minY + 56
  };
}

export function ArchitectWorkspace({ canvasOnly = false }: ArchitectWorkspaceProps) {
  const router = useRouter();
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [prompt, setPrompt] = useState(quickPrompts[0]);
  const [selectedProviders, setSelectedProviders] = useState<ArchitectureCloudProvider[]>([
    ...DEFAULT_REQUEST.preferred_providers
  ]);
  const [requestContext, setRequestContext] = useState<RecommendationRequest | null>(null);
  const [plan, setPlan] = useState<DiagramPlan>(() =>
    buildArchitecturePlan(quickPrompts[0], DEFAULT_REQUEST.preferred_providers, null)
  );
  const [agentMessage, setAgentMessage] = useState(plan.summary);
  const [diagramStyle, setDiagramStyle] = useState<DiagramStyle>("reference");
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [connectFromId, setConnectFromId] = useState<string | null>(null);
  const [manualProvider, setManualProvider] = useState<DiagramProvider>("shared");
  const [manualCategory, setManualCategory] = useState<DiagramCategory>("compute");
  const [manualTitle, setManualTitle] = useState("");
  const [manualSubtitle, setManualSubtitle] = useState("");
  const [dragState, setDragState] = useState<{ nodeId: string; offsetX: number; offsetY: number } | null>(null);

  useEffect(() => {
    if (canvasOnly) {
      const draft = loadArchitectCanvasDraft();
      if (!draft) {
        return;
      }

      setPrompt(draft.prompt);
      setSelectedProviders(draft.selected_providers as ArchitectureCloudProvider[]);
      setDiagramStyle((draft.diagram_style as DiagramStyle | undefined) ?? "reference");
      setRequestContext(draft.request_context);
      setPlan(draft.plan as unknown as DiagramPlan);
      setAgentMessage("Loaded the current architect canvas draft.");
      return;
    }

    const pendingScenario = loadPendingArchitectScenario();
    if (!pendingScenario) {
      return;
    }

    const nextPrompt = buildPromptFromRequest(pendingScenario.request, pendingScenario.name);
    const nextPlan = buildArchitecturePlan(
      nextPrompt,
      pendingScenario.request.preferred_providers,
      pendingScenario.request
    );

    setPrompt(nextPrompt);
    setSelectedProviders([...pendingScenario.request.preferred_providers]);
    setRequestContext(pendingScenario.request);
    setPlan(nextPlan);
    setAgentMessage(nextPlan.summary);
    setImportMessage(`Imported "${pendingScenario.name}" into Agent Architect.`);
    clearPendingArchitectScenario();
  }, [canvasOnly]);

  const nodeLookup = useMemo(() => {
    return plan.nodes.reduce<Record<string, DiagramNode>>((accumulator, node) => {
      accumulator[node.id] = node;
      return accumulator;
    }, {});
  }, [plan.nodes]);

  const selectedNode = selectedNodeId ? nodeLookup[selectedNodeId] ?? null : null;
  const selectedEdge = selectedEdgeId ? plan.edges.find((edge) => edge.id === selectedEdgeId) ?? null : null;
  const laneWidth = getProviderLaneWidth(plan.providers.length);
  const canvasWidth = Math.max(CANVAS_WIDTH, PROVIDER_LANE_START + plan.providers.length * laneWidth + 60);
  const canvasZones = useMemo(() => {
    const zones: Array<{ id: string; label: string; x: number; y: number; width: number; height: number; stroke: string; fill: string }> = [];
    const sharedBounds = getBounds(plan.nodes.filter((node) => node.provider === "shared"));
    if (sharedBounds) {
      zones.push({
        id: "shared-zone",
        label: diagramStyle === "workflow" ? "Shared flow services" : "Shared services",
        ...sharedBounds,
        stroke: "#7aa0df",
        fill: "rgba(237, 244, 255, 0.45)"
      });
    }

    plan.providers.forEach((provider) => {
      const providerNodes = plan.nodes.filter((node) => node.provider === provider);
      const appBounds = getBounds(
        providerNodes.filter((node) =>
          ["networking", "compute", "security", "identity", "integration"].includes(node.category)
        )
      );
      const dataBounds = getBounds(
        providerNodes.filter((node) =>
          ["database", "storage", "analytics", "ai_ml", "observability"].includes(node.category)
        )
      );

      if (appBounds) {
        zones.push({
          id: `${provider}-app-zone`,
          label: diagramStyle === "network" ? "Application subnet" : "Application component",
          ...appBounds,
          stroke: providerColors[provider].stroke,
          fill: "rgba(255,255,255,0.22)"
        });
      }

      if (dataBounds) {
        zones.push({
          id: `${provider}-data-zone`,
          label: diagramStyle === "workflow" ? "Data and automation component" : "Data component",
          ...dataBounds,
          stroke: providerColors[provider].stroke,
          fill: "rgba(255,255,255,0.16)"
        });
      }
    });

    return zones;
  }, [diagramStyle, plan.nodes, plan.providers]);
  const legendItems = useMemo(() => {
    if (diagramStyle === "network") {
      return ["HTTPS traffic", "Private connection", "Outbound traffic", "Virtual network link"];
    }

    if (diagramStyle === "workflow") {
      return ["User flow", "Control plane", "Data sync", "Automation path"];
    }

    return ["Application component", "Data component", "Shared services", "Numbered flow steps"];
  }, [diagramStyle]);

  function pointerToCanvas(event: { clientX: number; clientY: number }) {
    const svg = svgRef.current;
    if (!svg) {
      return { x: 0, y: 0 };
    }

    const rect = svg.getBoundingClientRect();
      return {
      x: ((event.clientX - rect.left) / rect.width) * canvasWidth,
      y: ((event.clientY - rect.top) / rect.height) * CANVAS_HEIGHT
    };
  }

  function regenerateDiagram(nextPrompt = prompt, nextProviders = selectedProviders, nextRequest = requestContext) {
    const nextPlan = buildArchitecturePlan(nextPrompt, nextProviders, nextRequest);
    setPlan(nextPlan);
    setAgentMessage(nextPlan.summary);
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
    setConnectFromId(null);
  }

  function toggleProvider(provider: ArchitectureCloudProvider) {
    setSelectedProviders((current) =>
      current.includes(provider) ? current.filter((item) => item !== provider) : [...current, provider]
    );
  }

  function handleNodePointerDown(event: ReactPointerEvent<SVGRectElement>, node: DiagramNode) {
    event.stopPropagation();
    const point = pointerToCanvas(event);
    setDragState({
      nodeId: node.id,
      offsetX: point.x - node.x,
      offsetY: point.y - node.y
    });

    if (connectFromId) {
      if (connectFromId === node.id) {
        setConnectFromId(null);
        return;
      }

      setPlan((current) => ({
        ...current,
        edges: [...current.edges, { id: createId("edge"), from: connectFromId, to: node.id }]
      }));
      setConnectFromId(null);
      setSelectedNodeId(node.id);
      setSelectedEdgeId(null);
      return;
    }

    setSelectedNodeId(node.id);
    setSelectedEdgeId(null);
  }

  function handleCanvasPointerMove(event: ReactPointerEvent<SVGSVGElement>) {
    if (!dragState) {
      return;
    }

    const point = pointerToCanvas(event);
    setPlan((current) => ({
      ...current,
      nodes: current.nodes.map((node) =>
        node.id === dragState.nodeId
          ? {
              ...node,
              x: Math.min(Math.max(point.x - dragState.offsetX, 16), canvasWidth - node.width - 16),
              y: Math.min(Math.max(point.y - dragState.offsetY, 16), CANVAS_HEIGHT - node.height - 16)
            }
          : node
      )
    }));
  }

  function handleCanvasPointerUp() {
    setDragState(null);
  }

  function handleAddNode() {
    const position = findNextPosition(plan.nodes.length);
    const node = buildNode(
      buildManualNodeTitle(manualProvider, manualCategory, manualTitle),
      manualSubtitle.trim() || "Custom architecture element",
      manualProvider,
      manualCategory,
      position.x,
      position.y
    );

    setPlan((current) => ({ ...current, nodes: [...current.nodes, node] }));
    setSelectedNodeId(node.id);
    setSelectedEdgeId(null);
    setManualTitle("");
    setManualSubtitle("");
  }

  function handleDeleteSelection() {
    if (selectedNodeId) {
      setPlan((current) => ({
        ...current,
        nodes: current.nodes.filter((node) => node.id !== selectedNodeId),
        edges: current.edges.filter((edge) => edge.from !== selectedNodeId && edge.to !== selectedNodeId)
      }));
      setSelectedNodeId(null);
      setSelectedEdgeId(null);
      setConnectFromId(null);
      return;
    }

    if (selectedEdgeId) {
      setPlan((current) => ({
        ...current,
        edges: current.edges.filter((edge) => edge.id !== selectedEdgeId)
      }));
      setSelectedEdgeId(null);
    }
  }

  function updateSelectedNode(field: "title" | "subtitle", value: string) {
    if (!selectedNodeId) {
      return;
    }

    setPlan((current) => ({
      ...current,
      nodes: current.nodes.map((node) => (node.id === selectedNodeId ? { ...node, [field]: value } : node))
    }));
  }

  function downloadSvg() {
    const svg = svgRef.current;
    if (!svg) {
      return;
    }

    const serializer = new XMLSerializer();
    const source = serializer.serializeToString(svg);
    const blob = new Blob([source], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "cloudsizer-architecture.svg";
    link.click();
    URL.revokeObjectURL(url);
  }

  function openCanvasPage() {
    storeArchitectCanvasDraft({
      prompt,
      selected_providers: selectedProviders,
      diagram_style: diagramStyle,
      request_context: requestContext,
      plan: plan as unknown as Record<string, unknown>,
      saved_at: new Date().toISOString()
    });
    router.push("/architect/canvas");
  }

  if (canvasOnly) {
    return (
      <Box sx={{ py: { xs: 3, md: 4 }, minHeight: "100vh" }}>
        <Container maxWidth={false} sx={{ px: { xs: 2, md: 4 } }}>
          <Stack spacing={3}>
            <Card sx={{ borderRadius: 5, border: "1px solid var(--line)", boxShadow: "none", background: "var(--hero)" }}>
              <CardContent sx={{ p: { xs: 3, md: 4 } }}>
                <Stack direction={{ xs: "column", lg: "row" }} justifyContent="space-between" spacing={2}>
                  <Box>
                    <Typography variant="overline" sx={{ color: "var(--muted)", letterSpacing: "0.12em" }}>
                      Agent Architect Canvas
                    </Typography>
                    <Typography variant="h4" sx={{ mt: 0.5 }}>
                      Full-page diagram editor
                    </Typography>
                    <Typography variant="body2" sx={{ color: "var(--muted)", mt: 1 }}>
                      Edit the current architecture draft on a dedicated page, then return to the workspace when done.
                    </Typography>
                  </Box>
                  <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
                    <Button component={Link} href="/architect" variant="outlined" sx={{ borderColor: "var(--line)", color: "var(--text)" }}>
                      Back To Workspace
                    </Button>
                    <Button variant="outlined" onClick={downloadSvg} sx={{ borderColor: "var(--line)", color: "var(--text)" }}>
                      Export SVG
                    </Button>
                  </Stack>
                </Stack>
              </CardContent>
            </Card>

            <Grid container spacing={3}>
              <Grid item xs={12} xl={3}>
                <Stack spacing={3}>
                  <Card sx={{ borderRadius: 5, border: "1px solid var(--line)", boxShadow: "none" }}>
                    <CardContent sx={{ p: 3 }}>
                      <Stack spacing={2}>
                        <Typography variant="h6">Architect Assistant</Typography>
                        <Typography variant="body2" sx={{ color: "var(--muted)" }}>
                          Describe the target architecture and choose the diagram style. The assistant will generate
                          layered component views closer to the reference diagrams you shared.
                        </Typography>
                        <TextField
                          label="Architecture brief"
                          multiline
                          minRows={6}
                          value={prompt}
                          onChange={(event) => setPrompt(event.target.value)}
                        />
                        <FormControl fullWidth>
                          <InputLabel id="diagram-style-label">Diagram style</InputLabel>
                          <Select
                            labelId="diagram-style-label"
                            value={diagramStyle}
                            label="Diagram style"
                            onChange={(event) => setDiagramStyle(event.target.value as DiagramStyle)}
                          >
                            <MenuItem value="reference">Reference architecture</MenuItem>
                            <MenuItem value="network">Network topology</MenuItem>
                            <MenuItem value="workflow">Workflow diagram</MenuItem>
                          </Select>
                        </FormControl>
                        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                          {quickPrompts.map((item) => (
                            <Chip
                              key={item}
                              label={item}
                              onClick={() => setPrompt(item)}
                              sx={{ maxWidth: "100%", bgcolor: "var(--panel-soft)", border: "1px solid var(--line)" }}
                            />
                          ))}
                        </Stack>
                        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                          {architectureProviderOptions.map((provider) => (
                            <Chip
                              key={provider}
                              label={providerLabels[provider]}
                              onClick={() => toggleProvider(provider)}
                              sx={{
                                fontWeight: 700,
                                border: "1px solid",
                                borderColor: selectedProviders.includes(provider) ? "var(--line-strong)" : "var(--line)",
                                bgcolor: selectedProviders.includes(provider) ? "var(--accent-soft)" : "transparent"
                              }}
                            />
                          ))}
                        </Stack>
                        <Button
                          variant="contained"
                          onClick={() => regenerateDiagram()}
                          sx={{ bgcolor: "var(--accent)", color: "#ffffff", "&:hover": { bgcolor: "#265db8" } }}
                        >
                          Generate Assisted Diagram
                        </Button>
                        <Alert severity="info">{agentMessage}</Alert>
                      </Stack>
                    </CardContent>
                  </Card>
                </Stack>
              </Grid>

              <Grid item xs={12} xl={6}>
                <Card sx={{ borderRadius: 5, border: "1px solid var(--line)", boxShadow: "none" }}>
                  <CardContent sx={{ p: { xs: 1.5, md: 2.5 } }}>
                    <Box
                      sx={{
                        width: "100%",
                        overflowX: "auto",
                        borderRadius: 4,
                        border: "1px solid var(--line)",
                        bgcolor: "#f8fbff"
                      }}
                    >
                      <svg
                        ref={svgRef}
                        viewBox={`0 0 ${canvasWidth} ${CANVAS_HEIGHT}`}
                        width="100%"
                        role="img"
                        aria-label="Architecture diagram editor"
                        onPointerMove={handleCanvasPointerMove}
                        onPointerUp={handleCanvasPointerUp}
                        onPointerLeave={handleCanvasPointerUp}
                        onClick={() => {
                          setSelectedNodeId(null);
                          setSelectedEdgeId(null);
                        }}
                      >
                        <defs>
                          <marker
                            id="architect-arrow"
                            markerWidth="12"
                            markerHeight="12"
                            refX="10"
                            refY="6"
                            orient="auto"
                            markerUnits="strokeWidth"
                          >
                            <path d="M 0 0 L 12 6 L 0 12 z" fill="#316fd6" />
                          </marker>
                        </defs>

                        <rect x="0" y="0" width={canvasWidth} height={CANVAS_HEIGHT} fill="#f8fbff" />
                        <rect x="28" y="40" width="250" height="700" rx="24" fill="#eef4ff" stroke="rgba(49, 111, 214, 0.14)" />
                        <text x="48" y="78" fontSize="22" fontWeight="700" fill="#17315c">
                          Shared services
                        </text>

                        {canvasZones.map((zone) => (
                          <g key={zone.id}>
                            <rect
                              x={zone.x}
                              y={zone.y}
                              width={zone.width}
                              height={zone.height}
                              rx="22"
                              fill={zone.fill}
                              stroke={zone.stroke}
                              strokeDasharray={diagramStyle === "network" ? "8 8" : "10 6"}
                              strokeOpacity="0.75"
                            />
                            <text x={zone.x + 16} y={zone.y + 22} fontSize="16" fontWeight="700" fill="#17315c">
                              {zone.label}
                            </text>
                          </g>
                        ))}

                        {plan.providers.map((provider, index) => {
                          const laneX = PROVIDER_LANE_START + index * laneWidth;
                          return (
                            <g key={`lane-${provider}`}>
                              <rect
                                x={laneX - 18}
                                y="40"
                                width={laneWidth - 14}
                                height="700"
                                rx="24"
                                fill={providerColors[provider].fill}
                                stroke={providerColors[provider].stroke}
                                strokeOpacity="0.18"
                              />
                              <text x={laneX} y="78" fontSize="22" fontWeight="700" fill={providerColors[provider].text}>
                                {providerLabels[provider]}
                              </text>
                            </g>
                          );
                        })}

                        {plan.edges.map((edge) => {
                          const source = nodeLookup[edge.from];
                          const target = nodeLookup[edge.to];
                          if (!source || !target) {
                            return null;
                          }

                          const startX = source.x + source.width;
                          const startY = source.y + source.height / 2;
                          const endX = target.x;
                          const endY = target.y + target.height / 2;
                          const controlX = startX + (endX - startX) / 2;
                          const selected = edge.id === selectedEdgeId;

                          return (
                            <g
                              key={edge.id}
                              onClick={(event) => {
                                event.stopPropagation();
                                setSelectedEdgeId(edge.id);
                                setSelectedNodeId(null);
                              }}
                            >
                              <path
                                d={`M ${startX} ${startY} C ${controlX} ${startY}, ${controlX} ${endY}, ${endX} ${endY}`}
                                fill="none"
                                stroke={selected ? "#17315c" : "#316fd6"}
                                strokeWidth={selected ? 5 : 3.5}
                                markerEnd="url(#architect-arrow)"
                                opacity={0.9}
                              />
                              {edge.label ? (
                                <text
                                  x={(startX + endX) / 2}
                                  y={(startY + endY) / 2 - 10}
                                  fontSize="12"
                                  fill="#60779c"
                                  textAnchor="middle"
                                >
                                  {edge.label}
                                </text>
                              ) : null}
                            </g>
                          );
                        })}

                        {plan.nodes.map((node) => {
                          const palette = providerColors[node.provider];
                          const selected = node.id === selectedNodeId;
                          const connectSource = node.id === connectFromId;
                          return (
                            <g
                              key={node.id}
                              onPointerDown={(event) => handleNodePointerDown(event as ReactPointerEvent<SVGRectElement>, node)}
                              onClick={(event) => event.stopPropagation()}
                              style={{ cursor: "grab" }}
                            >
                              <rect
                                x={node.x}
                                y={node.y}
                                width={node.width}
                                height={node.height}
                                rx="18"
                                fill={palette.fill}
                                stroke={selected || connectSource ? "#17315c" : palette.stroke}
                                strokeWidth={selected || connectSource ? 3.5 : 2}
                                style={{ cursor: "grab", touchAction: "none" }}
                              />
                              <text x={node.x + 18} y={node.y + 32} fontSize="17" fontWeight="700" fill="#17315c" pointerEvents="none">
                                {node.title}
                              </text>
                              <text x={node.x + 18} y={node.y + 56} fontSize="12.5" fill="#60779c" pointerEvents="none">
                                {node.subtitle}
                              </text>
                              <text x={node.x + 18} y={node.y + 74} fontSize="11.5" fill={palette.text} pointerEvents="none">
                                {node.provider === "shared" ? "SHARED" : providerLabels[node.provider]}
                              </text>
                            </g>
                          );
                        })}
                      </svg>
                    </Box>
                  </CardContent>
                </Card>
              </Grid>

              <Grid item xs={12} xl={3}>
                <Stack spacing={3}>
                  <Card sx={{ borderRadius: 5, border: "1px solid var(--line)", boxShadow: "none" }}>
                    <CardContent sx={{ p: 3 }}>
                      <Stack spacing={1.5}>
                        <Typography variant="h6">Tools Panel</Typography>
                        <Typography variant="body2" sx={{ color: "var(--muted)" }}>
                          Use these tools like a lightweight Lucidchart sidebar: create services, connect them,
                          and refine the current diagram.
                        </Typography>
                        <FormControl fullWidth>
                          <InputLabel id="canvas-manual-provider-label">Node provider</InputLabel>
                          <Select
                            labelId="canvas-manual-provider-label"
                            value={manualProvider}
                            label="Node provider"
                            onChange={(event) => setManualProvider(event.target.value as DiagramProvider)}
                          >
                            <MenuItem value="shared">Shared</MenuItem>
                            {architectureProviderOptions.map((provider) => (
                              <MenuItem key={provider} value={provider}>
                                {providerLabels[provider]}
                              </MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                        <FormControl fullWidth>
                          <InputLabel id="canvas-manual-category-label">Node category</InputLabel>
                          <Select
                            labelId="canvas-manual-category-label"
                            value={manualCategory}
                            label="Node category"
                            onChange={(event) => setManualCategory(event.target.value as DiagramCategory)}
                          >
                            {categoryOptions.map((category) => (
                              <MenuItem key={category} value={category}>
                                {getCategoryLabel(category)}
                              </MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                        <TextField label="Node title" value={manualTitle} onChange={(event) => setManualTitle(event.target.value)} />
                        <TextField label="Node subtitle" value={manualSubtitle} onChange={(event) => setManualSubtitle(event.target.value)} />
                        <Button
                          variant="contained"
                          onClick={handleAddNode}
                          sx={{ bgcolor: "#17315c", color: "#ffffff", "&:hover": { bgcolor: "#102443" } }}
                        >
                          Add Tool Shape
                        </Button>
                        <Button
                          variant={connectFromId ? "contained" : "outlined"}
                          onClick={() => setConnectFromId((current) => (current ? null : selectedNodeId))}
                          disabled={!selectedNodeId && !connectFromId}
                          sx={{ borderColor: "var(--line)", color: connectFromId ? "#ffffff" : "var(--text)", bgcolor: connectFromId ? "var(--accent)" : "transparent" }}
                        >
                          {connectFromId ? "Pick target node" : "Connect selected node"}
                        </Button>
                        <Button
                          variant="outlined"
                          onClick={handleDeleteSelection}
                          disabled={!selectedNodeId && !selectedEdgeId}
                          sx={{ borderColor: "var(--line)", color: "var(--text)" }}
                        >
                          Delete Selection
                        </Button>
                      </Stack>
                    </CardContent>
                  </Card>

                  <Card sx={{ borderRadius: 5, border: "1px solid var(--line)", boxShadow: "none" }}>
                    <CardContent sx={{ p: 3 }}>
                      <Stack spacing={2}>
                        <Typography variant="h6">Selection</Typography>
                        {selectedNode ? (
                          <>
                            <TextField
                              label="Selected node title"
                              value={selectedNode.title}
                              onChange={(event) => updateSelectedNode("title", event.target.value)}
                            />
                            <TextField
                              label="Selected node subtitle"
                              value={selectedNode.subtitle}
                              onChange={(event) => updateSelectedNode("subtitle", event.target.value)}
                            />
                            <Typography variant="body2" sx={{ color: "var(--muted)" }}>
                              Provider: {selectedNode.provider === "shared" ? "Shared" : providerLabels[selectedNode.provider]} | Category:{" "}
                              {getCategoryLabel(selectedNode.category)}
                            </Typography>
                          </>
                        ) : selectedEdge ? (
                          <Typography variant="body2" sx={{ color: "var(--muted)" }}>
                            Edge selected between {nodeLookup[selectedEdge.from]?.title ?? "source"} and{" "}
                            {nodeLookup[selectedEdge.to]?.title ?? "target"}.
                          </Typography>
                        ) : (
                          <Typography variant="body2" sx={{ color: "var(--muted)" }}>
                            Select a node to rename it, or select an edge and remove it.
                          </Typography>
                        )}
                      </Stack>
                    </CardContent>
                  </Card>

                  <Card sx={{ borderRadius: 5, border: "1px solid var(--line)", boxShadow: "none" }}>
                    <CardContent sx={{ p: 3 }}>
                      <Stack spacing={1.3}>
                        <Typography variant="h6">Agent Notes</Typography>
                        <Typography variant="body2" sx={{ color: "var(--muted)" }}>
                          {plan.summary}
                        </Typography>
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

  return (
    <Box sx={{ py: { xs: 4, md: 6 }, minHeight: "100vh" }}>
      <Container maxWidth="xl">
        <Stack spacing={3}>
          <Card
            sx={{
              borderRadius: 6,
              border: "1px solid var(--line)",
              boxShadow: "none",
              background: "var(--hero)"
            }}
          >
            <CardContent sx={{ p: { xs: 3, md: 5 } }}>
              <Stack spacing={2}>
                <Chip
                  label="Agent Architect"
                  sx={{ width: "fit-content", bgcolor: "var(--accent-soft)", color: "var(--accent)", fontWeight: 700 }}
                />
                <Typography variant="h2" sx={{ fontSize: { xs: "2.2rem", md: "3.8rem" }, lineHeight: 1 }}>
                  Create and edit multicloud architecture diagrams on a separate page.
                </Typography>
                <Typography variant="body1" sx={{ color: "var(--muted)", maxWidth: 900 }}>
                  Start from an architecture prompt or import the current estimate. The agent drafts the topology,
                  then you can drag services, add nodes, and connect clouds directly on the canvas.
                </Typography>
                <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
                  <Button
                    component={Link}
                    href="/estimator"
                    variant="outlined"
                    sx={{ borderColor: "var(--line)", color: "var(--text)" }}
                  >
                    Back To Estimator
                  </Button>
                  <Button
                    component={Link}
                    href="/estimates"
                    variant="outlined"
                    sx={{ borderColor: "var(--line)", color: "var(--text)" }}
                  >
                    Saved Estimates
                  </Button>
                </Stack>
              </Stack>
            </CardContent>
          </Card>

          {importMessage ? <Alert severity="success">{importMessage}</Alert> : null}

          <Grid container spacing={3}>
            <Grid item xs={12} lg={4}>
              <Stack spacing={3}>
                <Card sx={{ borderRadius: 5, border: "1px solid var(--line)", boxShadow: "none" }}>
                  <CardContent sx={{ p: 3 }}>
                    <Stack spacing={2.5}>
                      <Typography variant="h5">Agent Prompt</Typography>
                      <TextField
                        label="Architecture brief"
                        multiline
                        minRows={6}
                        value={prompt}
                        onChange={(event) => setPrompt(event.target.value)}
                        placeholder="Describe clouds, workload tiers, resilience, and shared services."
                      />
                      <Stack spacing={1}>
                        <Typography variant="subtitle2">Cloud targets</Typography>
                        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                          {architectureProviderOptions.map((provider) => {
                            const active = selectedProviders.includes(provider);
                            return (
                              <Chip
                                key={provider}
                                label={providerLabels[provider]}
                                onClick={() => toggleProvider(provider)}
                                sx={{
                                  fontWeight: 700,
                                  border: "1px solid",
                                  borderColor: active ? "var(--line-strong)" : "var(--line)",
                                  bgcolor: active ? "var(--accent-soft)" : "transparent",
                                  color: active ? "var(--accent)" : "var(--muted)"
                                }}
                              />
                            );
                          })}
                        </Stack>
                      </Stack>
                      <Typography variant="body2" sx={{ color: "var(--muted)" }}>
                        Agent Architect now includes a broader market cloud library for diagramming. Cost estimation and
                        recommendation APIs still price AWS, Azure, and GCP.
                      </Typography>
                      <Stack spacing={1}>
                        <Typography variant="subtitle2">Quick prompts</Typography>
                        <Stack spacing={1}>
                          {quickPrompts.map((item) => (
                            <Chip
                              key={item}
                              label={item}
                              onClick={() => setPrompt(item)}
                              sx={{
                                justifyContent: "flex-start",
                                height: "auto",
                                py: 0.8,
                                bgcolor: "var(--panel-soft)",
                                border: "1px solid var(--line)"
                              }}
                            />
                          ))}
                        </Stack>
                      </Stack>
                      <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
                        <Button
                          variant="contained"
                          onClick={() => regenerateDiagram()}
                          sx={{ bgcolor: "var(--accent)", color: "#ffffff", "&:hover": { bgcolor: "#265db8" } }}
                        >
                          Generate Diagram
                        </Button>
                        <Button
                          variant="outlined"
                          onClick={() => {
                            setPrompt(quickPrompts[0]);
                            setSelectedProviders([...DEFAULT_REQUEST.preferred_providers]);
                            setRequestContext(null);
                            setImportMessage(null);
                            regenerateDiagram(quickPrompts[0], DEFAULT_REQUEST.preferred_providers, null);
                          }}
                          sx={{ borderColor: "var(--line)", color: "var(--text)" }}
                        >
                          Reset Draft
                        </Button>
                      </Stack>
                      <Alert severity="info">{agentMessage}</Alert>
                    </Stack>
                  </CardContent>
                </Card>

                <Card sx={{ borderRadius: 5, border: "1px solid var(--line)", boxShadow: "none" }}>
                  <CardContent sx={{ p: 3 }}>
                    <Stack spacing={2.5}>
                      <Typography variant="h6">Canvas Controls</Typography>
                      <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
                        <Button
                          variant={connectFromId ? "contained" : "outlined"}
                          onClick={() => setConnectFromId((current) => (current ? null : selectedNodeId))}
                          disabled={!selectedNodeId && !connectFromId}
                          sx={{
                            borderColor: "var(--line)",
                            color: connectFromId ? "#ffffff" : "var(--text)",
                            bgcolor: connectFromId ? "var(--accent)" : "transparent"
                          }}
                        >
                          {connectFromId ? "Pick target node" : "Connect selected node"}
                        </Button>
                        <Button
                          variant="outlined"
                          onClick={handleDeleteSelection}
                          disabled={!selectedNodeId && !selectedEdgeId}
                          sx={{ borderColor: "var(--line)", color: "var(--text)" }}
                        >
                          Delete Selection
                        </Button>
                      </Stack>
                      <FormControl fullWidth>
                        <InputLabel id="manual-provider-label">Node provider</InputLabel>
                        <Select
                          labelId="manual-provider-label"
                          value={manualProvider}
                          label="Node provider"
                          onChange={(event) => setManualProvider(event.target.value as DiagramProvider)}
                        >
                          <MenuItem value="shared">Shared</MenuItem>
                          {architectureProviderOptions.map((provider) => (
                            <MenuItem key={provider} value={provider}>
                              {providerLabels[provider]}
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                      <FormControl fullWidth>
                        <InputLabel id="manual-category-label">Node category</InputLabel>
                        <Select
                          labelId="manual-category-label"
                          value={manualCategory}
                          label="Node category"
                          onChange={(event) => setManualCategory(event.target.value as DiagramCategory)}
                        >
                          {categoryOptions.map((category) => (
                            <MenuItem key={category} value={category}>
                              {getCategoryLabel(category)}
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                      <TextField
                        label="Node title"
                        value={manualTitle}
                        onChange={(event) => setManualTitle(event.target.value)}
                        placeholder="Leave blank to use the provider default"
                      />
                      <TextField
                        label="Node subtitle"
                        value={manualSubtitle}
                        onChange={(event) => setManualSubtitle(event.target.value)}
                      />
                      <Button
                        variant="contained"
                        onClick={handleAddNode}
                        sx={{ bgcolor: "#17315c", color: "#ffffff", "&:hover": { bgcolor: "#102443" } }}
                      >
                        Add Node To Diagram
                      </Button>
                    </Stack>
                  </CardContent>
                </Card>

                <Card sx={{ borderRadius: 5, border: "1px solid var(--line)", boxShadow: "none" }}>
                  <CardContent sx={{ p: 3 }}>
                    <Stack spacing={2}>
                      <Typography variant="h6">Selection</Typography>
                      {selectedNode ? (
                        <>
                          <TextField
                            label="Selected node title"
                            value={selectedNode.title}
                            onChange={(event) => updateSelectedNode("title", event.target.value)}
                          />
                          <TextField
                            label="Selected node subtitle"
                            value={selectedNode.subtitle}
                            onChange={(event) => updateSelectedNode("subtitle", event.target.value)}
                          />
                          <Typography variant="body2" sx={{ color: "var(--muted)" }}>
                            Provider: {selectedNode.provider === "shared" ? "Shared" : providerLabels[selectedNode.provider]} | Category:{" "}
                            {getCategoryLabel(selectedNode.category)}
                          </Typography>
                        </>
                      ) : selectedEdge ? (
                        <Typography variant="body2" sx={{ color: "var(--muted)" }}>
                          Edge selected between {nodeLookup[selectedEdge.from]?.title ?? "source"} and{" "}
                          {nodeLookup[selectedEdge.to]?.title ?? "target"}.
                        </Typography>
                      ) : (
                        <Typography variant="body2" sx={{ color: "var(--muted)" }}>
                          Select a node to rename it, or select an edge and remove it.
                        </Typography>
                      )}
                    </Stack>
                  </CardContent>
                </Card>
              </Stack>
            </Grid>
            <Grid item xs={12} lg={8}>
              <Stack spacing={3}>
                <Grid container spacing={2}>
                  <Grid item xs={12} md={4}>
                    <Card sx={{ borderRadius: 4, border: "1px solid var(--line)", boxShadow: "none", height: "100%" }}>
                      <CardContent>
                        <Typography variant="overline" sx={{ color: "var(--muted)" }}>
                          Draft title
                        </Typography>
                        <Typography variant="h6">{plan.title}</Typography>
                      </CardContent>
                    </Card>
                  </Grid>
                  <Grid item xs={12} md={4}>
                    <Card sx={{ borderRadius: 4, border: "1px solid var(--line)", boxShadow: "none", height: "100%" }}>
                      <CardContent>
                        <Typography variant="overline" sx={{ color: "var(--muted)" }}>
                          Clouds
                        </Typography>
                        <Typography variant="h6">{plan.providers.map((provider) => providerLabels[provider]).join(" + ")}</Typography>
                      </CardContent>
                    </Card>
                  </Grid>
                  <Grid item xs={12} md={4}>
                    <Card sx={{ borderRadius: 4, border: "1px solid var(--line)", boxShadow: "none", height: "100%" }}>
                      <CardContent>
                        <Typography variant="overline" sx={{ color: "var(--muted)" }}>
                          Elements
                        </Typography>
                        <Typography variant="h6">
                          {plan.nodes.length} nodes / {plan.edges.length} links
                        </Typography>
                      </CardContent>
                    </Card>
                  </Grid>
                </Grid>

                <Card sx={{ borderRadius: 5, border: "1px solid var(--line)", boxShadow: "none" }}>
                  <CardContent sx={{ p: { xs: 2, md: 3 } }}>
                    <Stack spacing={2}>
                      <Stack
                        direction={{ xs: "column", md: "row" }}
                        justifyContent="space-between"
                        alignItems={{ xs: "flex-start", md: "center" }}
                        spacing={1.5}
                      >
                        <Box>
                          <Typography variant="h5">Diagram Canvas</Typography>
                          <Typography variant="body2" sx={{ color: "var(--muted)" }}>
                            Drag nodes to reposition them. Select a node and use connect mode to wire new paths.
                          </Typography>
                        </Box>
                        <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
                          <Button
                            variant="outlined"
                            onClick={openCanvasPage}
                            sx={{ borderColor: "var(--line)", color: "var(--text)" }}
                          >
                            Open Separate Canvas
                          </Button>
                          <Button
                            variant="outlined"
                            onClick={downloadSvg}
                            sx={{ borderColor: "var(--line)", color: "var(--text)" }}
                          >
                            Export SVG
                          </Button>
                        </Stack>
                      </Stack>
                      <Box
                        sx={{
                          width: "100%",
                          overflowX: "auto",
                          borderRadius: 4,
                          border: "1px solid var(--line)",
                          bgcolor: "#f8fbff"
                        }}
                      >
                        <svg
                          ref={svgRef}
                          viewBox={`0 0 ${canvasWidth} ${CANVAS_HEIGHT}`}
                          width="100%"
                          role="img"
                          aria-label="Architecture diagram editor"
                          onPointerMove={handleCanvasPointerMove}
                          onPointerUp={handleCanvasPointerUp}
                          onPointerLeave={handleCanvasPointerUp}
                          onClick={() => {
                            setSelectedNodeId(null);
                            setSelectedEdgeId(null);
                          }}
                        >
                          <defs>
                            <marker
                              id="architect-arrow"
                              markerWidth="12"
                              markerHeight="12"
                              refX="10"
                              refY="6"
                              orient="auto"
                              markerUnits="strokeWidth"
                            >
                              <path d="M 0 0 L 12 6 L 0 12 z" fill="#316fd6" />
                            </marker>
                          </defs>

                          <rect x="0" y="0" width={canvasWidth} height={CANVAS_HEIGHT} fill="#f8fbff" />
                          <rect
                            x="28"
                            y="40"
                            width="250"
                            height="700"
                            rx="24"
                            fill="#eef4ff"
                            stroke="rgba(49, 111, 214, 0.14)"
                          />
                          <text x="48" y="78" fontSize="22" fontWeight="700" fill="#17315c">
                            Shared services
                          </text>

                          {plan.providers.map((provider, index) => {
                            const laneX = PROVIDER_LANE_START + index * laneWidth;
                            return (
                              <g key={`lane-${provider}`}>
                                <rect
                                  x={laneX - 18}
                                  y="40"
                                  width={laneWidth - 14}
                                  height="700"
                                  rx="24"
                                  fill={providerColors[provider].fill}
                                  stroke={providerColors[provider].stroke}
                                  strokeOpacity="0.18"
                                />
                                <text x={laneX} y="78" fontSize="22" fontWeight="700" fill={providerColors[provider].text}>
                                  {providerLabels[provider]}
                                </text>
                              </g>
                            );
                          })}

                          {plan.edges.map((edge) => {
                            const source = nodeLookup[edge.from];
                            const target = nodeLookup[edge.to];
                            if (!source || !target) {
                              return null;
                            }

                            const startX = source.x + source.width;
                            const startY = source.y + source.height / 2;
                            const endX = target.x;
                            const endY = target.y + target.height / 2;
                            const controlX = startX + (endX - startX) / 2;
                            const selected = edge.id === selectedEdgeId;

                            return (
                              <g
                                key={edge.id}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setSelectedEdgeId(edge.id);
                                  setSelectedNodeId(null);
                                }}
                              >
                                <path
                                  d={`M ${startX} ${startY} C ${controlX} ${startY}, ${controlX} ${endY}, ${endX} ${endY}`}
                                  fill="none"
                                  stroke={selected ? "#17315c" : "#316fd6"}
                                  strokeWidth={selected ? 5 : 3.5}
                                  markerEnd="url(#architect-arrow)"
                                  opacity={0.9}
                                />
                                {edge.label ? (
                                  <text
                                    x={(startX + endX) / 2}
                                    y={(startY + endY) / 2 - 10}
                                    fontSize="12"
                                    fill="#60779c"
                                    textAnchor="middle"
                                  >
                                    {edge.label}
                                  </text>
                                ) : null}
                                {diagramStyle !== "network" ? (
                                  <g>
                                    <circle cx={(startX + endX) / 2} cy={(startY + endY) / 2 + 16} r="13" fill="#0f172a" />
                                    <text
                                      x={(startX + endX) / 2}
                                      y={(startY + endY) / 2 + 20}
                                      fontSize="11"
                                      fontWeight="700"
                                      fill="#ffffff"
                                      textAnchor="middle"
                                    >
                                      {plan.edges.findIndex((item) => item.id === edge.id) + 1}
                                    </text>
                                  </g>
                                ) : null}
                              </g>
                            );
                          })}

                          {plan.nodes.map((node) => {
                            const palette = providerColors[node.provider];
                            const selected = node.id === selectedNodeId;
                            const connectSource = node.id === connectFromId;
                            return (
                              <g
                                key={node.id}
                                onPointerDown={(event) => handleNodePointerDown(event as ReactPointerEvent<SVGRectElement>, node)}
                                onClick={(event) => event.stopPropagation()}
                                style={{ cursor: "grab" }}
                              >
                                <rect
                                  x={node.x}
                                  y={node.y}
                                  width={node.width}
                                  height={node.height}
                                  rx="18"
                                  fill={palette.fill}
                                  stroke={selected || connectSource ? "#17315c" : palette.stroke}
                                  strokeWidth={selected || connectSource ? 3.5 : 2}
                                  style={{ cursor: "grab", touchAction: "none" }}
                                />
                                <text
                                  x={node.x + 18}
                                  y={node.y + 32}
                                  fontSize="17"
                                  fontWeight="700"
                                  fill="#17315c"
                                  pointerEvents="none"
                                >
                                  {node.title}
                                </text>
                                <text
                                  x={node.x + 18}
                                  y={node.y + 56}
                                  fontSize="12.5"
                                  fill="#60779c"
                                  pointerEvents="none"
                                >
                                  {node.subtitle}
                                </text>
                                <text
                                  x={node.x + 18}
                                  y={node.y + 74}
                                  fontSize="11.5"
                                  fill={palette.text}
                                  pointerEvents="none"
                                >
                                  {node.provider === "shared" ? "SHARED" : providerLabels[node.provider]}
                                </text>
                              </g>
                            );
                          })}
                          <g transform={`translate(${canvasWidth - 252}, ${CANVAS_HEIGHT - 138})`}>
                            <rect x="0" y="0" width="220" height="104" rx="18" fill="#ffffff" stroke="rgba(49, 111, 214, 0.2)" />
                            <text x="16" y="24" fontSize="15" fontWeight="700" fill="#17315c">
                              Legend
                            </text>
                            {legendItems.map((item, index) => (
                              <g key={item} transform={`translate(0, ${index * 18})`}>
                                <circle cx="20" cy="40" r="4" fill={index % 2 === 0 ? "#316fd6" : "#17315c"} />
                                <text x="34" y="44" fontSize="11.5" fill="#60779c">
                                  {item}
                                </text>
                              </g>
                            ))}
                          </g>
                        </svg>
                      </Box>
                    </Stack>
                  </CardContent>
                </Card>

                <Card sx={{ borderRadius: 5, border: "1px solid var(--line)", boxShadow: "none" }}>
                  <CardContent sx={{ p: 3 }}>
                    <Stack spacing={1.3}>
                      <Typography variant="h6">Agent Notes</Typography>
                      <Typography variant="body1" sx={{ color: "var(--muted)" }}>
                        {plan.summary}
                      </Typography>
                      {plan.assumptions.map((assumption) => (
                        <Typography key={assumption} variant="body2" sx={{ color: "var(--muted)" }}>
                          {assumption}
                        </Typography>
                      ))}
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
