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
export type DiagramStyle = "reference" | "network" | "workflow";
export type ArchitecturePatternId =
  | "single_tier"
  | "three_tier"
  | "n_tier"
  | "microservices"
  | "event_driven"
  | "serverless"
  | "data_pipeline"
  | "hybrid_cloud"
  | "multi_cloud"
  | "ha_dr";
export type ArchitectureScenarioId =
  | "generic"
  | "ecommerce"
  | "digital_banking"
  | "streaming_media"
  | "healthcare_platform"
  | "erp_supply_chain"
  | "saas_crm"
  | "iot_operations";

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
  bidirectional?: boolean;
}

export interface ArchitectureVariations {
  costOptimized: string[];
  highPerformance: string[];
  enterprise: string[];
}

export interface DiagramPlan {
  title: string;
  summary: string;
  assumptions: string[];
  providers: ArchitectureCloudProvider[];
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  pattern: ArchitecturePatternId;
  patternLabel: string;
  scenario: ArchitectureScenarioId;
  scenarioLabel: string;
  components: string[];
  cloudServices: string[];
  dataFlow: string[];
  scalingStrategy: string[];
  securityConsiderations: string[];
  variations: ArchitectureVariations;
  useCases: string[];
  pros: string[];
  cons: string[];
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

export interface ArchitecturePatternDefinition {
  id: ArchitecturePatternId;
  label: string;
  description: string;
  prompt: string;
  defaultProviders: ArchitectureCloudProvider[];
  defaultDiagramStyle: DiagramStyle;
  components: string[];
  cloudServices: string[];
  dataFlow: string[];
  scalingStrategy: string[];
  securityConsiderations: string[];
  variations: ArchitectureVariations;
  useCases: string[];
  pros: string[];
  cons: string[];
}

export interface ArchitectureScenarioDefinition {
  id: ArchitectureScenarioId;
  label: string;
  description: string;
  promptSuffix: string;
  useCases: string[];
  components: string[];
  dataFlow: string[];
  scalingStrategy: string[];
  securityConsiderations: string[];
}

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
  aws: ["aws", "amazon"],
  azure: ["azure", "microsoft"],
  gcp: ["gcp", "google cloud", "google"],
  oracle: ["oracle", "oci"],
  alibaba: ["alibaba", "aliyun"],
  ibm: ["ibm"],
  tencent: ["tencent"],
  digitalocean: ["digitalocean", "digital ocean"],
  akamai: ["akamai", "linode"],
  ovhcloud: ["ovh", "ovhcloud"],
  cloudflare: ["cloudflare"]
};

const providerServices: Record<
  ArchitectureCloudProvider,
  Record<ServiceCategory | "identity" | "integration" | "observability", string>
> = {
  aws: { compute: "Amazon EKS", database: "Amazon RDS", storage: "Amazon S3", networking: "Application Load Balancer", analytics: "Amazon Redshift", ai_ml: "Amazon Bedrock", security: "AWS WAF", saas: "Snowflake + Salesforce", identity: "IAM Identity Center", integration: "Amazon EventBridge", observability: "Amazon CloudWatch" },
  azure: { compute: "Azure Kubernetes Service", database: "Azure SQL Database", storage: "Azure Blob Storage", networking: "Azure Front Door", analytics: "Azure Synapse", ai_ml: "Azure OpenAI Service", security: "Azure Firewall", saas: "Snowflake + Salesforce", identity: "Microsoft Entra ID", integration: "Azure Service Bus", observability: "Azure Monitor" },
  gcp: { compute: "Google Kubernetes Engine", database: "Cloud SQL", storage: "Cloud Storage", networking: "Cloud Load Balancing", analytics: "BigQuery", ai_ml: "Vertex AI", security: "Cloud Armor", saas: "Snowflake + Salesforce", identity: "Cloud Identity", integration: "Pub/Sub", observability: "Cloud Monitoring" },
  oracle: { compute: "Oracle Kubernetes Engine", database: "Autonomous Database", storage: "OCI Object Storage", networking: "OCI Load Balancer", analytics: "Oracle Analytics Cloud", ai_ml: "OCI Generative AI", security: "OCI Web Application Firewall", saas: "Snowflake + Salesforce", identity: "OCI IAM", integration: "OCI Streaming", observability: "OCI Logging and Monitoring" },
  alibaba: { compute: "Alibaba ACK", database: "ApsaraDB RDS", storage: "Alibaba OSS", networking: "Server Load Balancer", analytics: "MaxCompute", ai_ml: "PAI", security: "Alibaba Cloud Firewall", saas: "Snowflake + Salesforce", identity: "Resource Access Management", integration: "Alibaba EventBridge", observability: "CloudMonitor" },
  ibm: { compute: "Red Hat OpenShift on IBM Cloud", database: "Db2 on Cloud", storage: "IBM Cloud Object Storage", networking: "IBM Cloud Load Balancer", analytics: "watsonx.data", ai_ml: "watsonx.ai", security: "IBM Cloud Internet Services", saas: "Snowflake + Salesforce", identity: "IBM Cloud IAM", integration: "Event Streams", observability: "IBM Cloud Monitoring" },
  tencent: { compute: "Tencent Kubernetes Engine", database: "TencentDB", storage: "Tencent Cloud Object Storage", networking: "Cloud Load Balancer", analytics: "Tencent Data Warehouse", ai_ml: "Tencent Hunyuan", security: "Tencent Cloud Firewall", saas: "Snowflake + Salesforce", identity: "Cloud Access Management", integration: "Tencent EventBridge", observability: "Tencent Cloud Monitor" },
  digitalocean: { compute: "DigitalOcean Kubernetes", database: "Managed PostgreSQL", storage: "Spaces Object Storage", networking: "DigitalOcean Load Balancer", analytics: "Managed Kafka", ai_ml: "DigitalOcean GenAI Platform", security: "Cloud Firewalls", saas: "Snowflake + Salesforce", identity: "DigitalOcean IAM", integration: "Functions and Queues", observability: "DigitalOcean Monitoring" },
  akamai: { compute: "Akamai Kubernetes Engine", database: "Managed Databases", storage: "Akamai Object Storage", networking: "Akamai Application Load Balancer", analytics: "DataStream", ai_ml: "Akamai AI Inference", security: "App and API Protector", saas: "Snowflake + Salesforce", identity: "Akamai IAM", integration: "Event Center", observability: "Akamai Cloud Monitor" },
  ovhcloud: { compute: "OVHcloud Managed Kubernetes", database: "OVHcloud Managed Databases", storage: "OVHcloud Object Storage", networking: "OVHcloud Load Balancer", analytics: "OVHcloud Data Platform", ai_ml: "OVHcloud AI Endpoints", security: "OVHcloud Network Firewall", saas: "Snowflake + Salesforce", identity: "OVHcloud IAM", integration: "OVHcloud Event Streams", observability: "OVHcloud Metrics" },
  cloudflare: { compute: "Cloudflare Workers", database: "Cloudflare D1", storage: "Cloudflare R2", networking: "Cloudflare Load Balancer", analytics: "Cloudflare Analytics Engine", ai_ml: "Workers AI", security: "Cloudflare WAF", saas: "Snowflake + Salesforce", identity: "Cloudflare Access", integration: "Cloudflare Queues", observability: "Cloudflare Analytics" }
};

function pattern(
  id: ArchitecturePatternId,
  label: string,
  description: string,
  prompt: string,
  defaultProviders: ArchitectureCloudProvider[],
  defaultDiagramStyle: DiagramStyle,
  components: string[],
  cloudServices: string[],
  dataFlow: string[],
  scalingStrategy: string[],
  securityConsiderations: string[],
  variations: ArchitectureVariations,
  useCases: string[],
  pros: string[],
  cons: string[]
): ArchitecturePatternDefinition {
  return {
    id,
    label,
    description,
    prompt,
    defaultProviders,
    defaultDiagramStyle,
    components,
    cloudServices,
    dataFlow,
    scalingStrategy,
    securityConsiderations,
    variations,
    useCases,
    pros,
    cons
  };
}

export const architecturePatterns: ArchitecturePatternDefinition[] = [
  pattern("single_tier", "Single-Tier", "One runtime for UI, logic, and data.", "Design a single-tier internal application on AWS with one app server, local storage, IAM, and backups.", ["aws"], "reference", ["Single app server", "Attached storage", "Basic networking"], ["AWS: EC2 + EBS", "Azure: VM + Managed Disk", "GCP: Compute Engine + Persistent Disk"], ["Users call one endpoint.", "The app processes logic.", "Data is written locally or to attached storage."], ["Scale vertically first.", "Clone the image behind a load balancer only if needed."], ["Restrict inbound ports.", "Encrypt disks and snapshots.", "Use least-privilege IAM."], { costOptimized: ["One small VM", "Basic snapshots"], highPerformance: ["SSD and larger instance"], enterprise: ["Private subnet and centralized logs"] }, ["Internal tools", "POCs"], ["Simple", "Cheap"], ["Limited scale", "Shared blast radius"]),
  pattern("three_tier", "3-Tier", "Web, app, and database tiers.", "Design a three-tier e-commerce application on Azure with load balancing, web tier, app tier, and managed database.", ["azure"], "reference", ["Load balancer", "Web tier", "App tier", "Managed DB"], ["AWS: ALB + EC2 + RDS", "Azure: App Gateway + VMSS + Azure SQL", "GCP: LB + MIG + Cloud SQL"], ["Traffic enters the balancer.", "Web tier serves requests.", "App tier runs logic.", "DB stores transactions."], ["Scale web and app tiers separately.", "Use read replicas for heavy reads."], ["Only the edge is public.", "App and DB stay private.", "Store secrets in a vault."], { costOptimized: ["Single-zone DB for noncritical apps"], highPerformance: ["Redis and CDN"], enterprise: ["WAF and private endpoints"] }, ["ERP", "CRM"], ["Clear separation", "Predictable"], ["More ops than a monolith"]),
  pattern("n_tier", "N-Tier", "Edge, API, domain, async, and data tiers.", "Create an N-tier banking platform on GCP with CDN, WAF, API tier, domain services, cache, queue, and governed storage.", ["gcp"], "network", ["CDN and WAF", "API tier", "Domain services", "Cache", "Queue", "Operational DB"], ["AWS: CloudFront + ECS/EKS + SQS + RDS", "Azure: Front Door + AKS + Service Bus + Azure SQL", "GCP: Cloud CDN + GKE + Pub/Sub + Cloud SQL"], ["Users hit the edge tier.", "API and domain tiers process requests.", "Queues absorb async work.", "DB and storage persist state."], ["Autoscale each tier independently.", "Use queues and cache to smooth spikes."], ["Segment every tier.", "Use internal auth and encryption.", "Centralize audit logs."], { costOptimized: ["Collapse low-traffic tiers"], highPerformance: ["Regional caches and async fan-out"], enterprise: ["Service mesh and policy guardrails"] }, ["Large enterprise systems"], ["Modular", "Scales well"], ["More complexity", "More hops"]),
  pattern("microservices", "Microservices", "Independently deployable domain services.", "Design a microservices streaming platform on AWS with API gateway, service-owned databases, event bus, and observability.", ["aws"], "workflow", ["API gateway", "Domain services", "Per-service DBs", "Event bus"], ["AWS: API Gateway + EKS/ECS + RDS/DynamoDB + EventBridge", "Azure: API Management + AKS + Azure SQL/Cosmos + Event Grid", "GCP: API Gateway + GKE/Cloud Run + Cloud SQL/Firestore + Pub/Sub"], ["Gateway routes to each service.", "Each service owns its data.", "Events coordinate cross-domain changes."], ["Scale hot services only.", "Use HPA or KEDA.", "Scale from CPU, concurrency, or queue depth."], ["Use service-to-service auth.", "Scan images.", "Keep secrets in a vault."], { costOptimized: ["Start with fewer coarse services"], highPerformance: ["gRPC and local caches"], enterprise: ["Service mesh and zero-trust"] }, ["E-commerce", "Streaming"], ["Independent delivery", "Fault isolation"], ["Distributed complexity", "Data consistency is harder"]),
  pattern("event_driven", "Event-Driven", "Publish-subscribe and async consumers.", "Design an event-driven retail order platform on Azure with producers, broker, consumers, data lake sinks, and DLQ handling.", ["azure"], "workflow", ["Producers", "Event broker", "Consumers", "DLQ", "Data sinks"], ["AWS: EventBridge/SNS/SQS", "Azure: Event Grid + Service Bus", "GCP: Pub/Sub"], ["Producers publish once.", "The broker routes messages.", "Consumers process independently.", "DLQ captures failures."], ["Scale consumers by queue depth.", "Partition high-volume topics."], ["Topic-level IAM.", "Encrypt messages.", "Validate schemas."], { costOptimized: ["Serverless consumers"], highPerformance: ["More partitions and tuned batches"], enterprise: ["Schema registry and audit feed"] }, ["Order flows", "IoT"], ["Loose coupling", "Extensible"], ["Eventual consistency", "Harder debugging"]),
  pattern("serverless", "Serverless", "Functions plus managed event services.", "Build a serverless API platform on GCP with CDN, API gateway, cloud functions, managed database, object storage, and queues.", ["gcp"], "reference", ["CDN", "API gateway", "Functions", "Managed DB", "Storage", "Queue"], ["AWS: CloudFront + API Gateway + Lambda", "Azure: Front Door + API Management + Functions", "GCP: Cloud CDN + API Gateway + Cloud Functions or Cloud Run"], ["Users call edge and gateway.", "Functions execute stateless logic.", "Data is stored in managed services.", "Queues handle async work."], ["Use native concurrency scaling.", "Offload long work to queues."], ["Least-privilege execution roles.", "Managed secrets.", "API auth and throttling."], { costOptimized: ["Pure pay-per-use"], highPerformance: ["Provisioned warm capacity"], enterprise: ["Private APIs and policy controls"] }, ["Automation", "Lightweight APIs"], ["Low ops", "Fast delivery"], ["Cold starts", "Platform limits"]),
  pattern("data_pipeline", "Data Pipeline / ETL", "Ingest, transform, curate, and serve data.", "Design a hybrid ETL analytics pipeline on AWS with ingestion, raw lake, ETL layer, curated warehouse, BI consumers, and governance.", ["aws"], "workflow", ["Sources", "Ingestion", "Raw lake", "ETL or ELT", "Warehouse", "BI or ML"], ["AWS: Kinesis + Glue + S3 + Redshift", "Azure: Event Hubs + Data Factory + ADLS + Synapse", "GCP: Pub/Sub + Dataflow + GCS + BigQuery"], ["Sources feed ingestion.", "Raw data lands in object storage.", "ETL publishes curated data.", "BI and ML consume the results."], ["Separate batch and streaming lanes.", "Use distributed workers and partitioned storage."], ["Encrypt every zone.", "Mask sensitive fields.", "Track lineage."], { costOptimized: ["Object storage first and batch windows"], highPerformance: ["Streaming + columnar formats"], enterprise: ["Quality gates and data catalog"] }, ["Reporting", "ML features"], ["Great for analytics", "Scales historically"], ["Governance overhead", "Data quality effort"]),
  pattern("hybrid_cloud", "Hybrid Cloud", "On-prem systems integrated with cloud services.", "Design a hybrid cloud banking architecture with on-prem core systems, cloud app services on Azure, private connectivity, identity federation, and backup.", ["azure"], "network", ["On-prem apps", "On-prem DB", "Private link", "Cloud hub", "Cloud services"], ["AWS: Direct Connect + Transit Gateway", "Azure: ExpressRoute + Hub-Spoke", "GCP: Cloud Interconnect + Shared VPC"], ["Core systems remain on-prem.", "Private links connect to the cloud.", "Cloud services extend digital channels and recovery."], ["Burst cloud-facing channels only.", "Keep legacy latency-sensitive paths local."], ["Federated identity.", "Private routing only.", "Central audit and monitoring."], { costOptimized: ["Use cloud for burst and backup"], highPerformance: ["Low-latency dedicated links"], enterprise: ["Dual links and SIEM"] }, ["Regulated industries"], ["Pragmatic modernization"], ["Integration complexity", "Split operations"]),
  pattern("multi_cloud", "Multi-Cloud", "Coordinated stacks across multiple providers.", "Design a multi-cloud global commerce platform across AWS, Azure, and GCP with global routing, app stacks, shared identity, and observability.", ["aws", "azure", "gcp"], "network", ["Global routing", "Per-cloud app stack", "Shared identity", "Shared observability"], ["AWS: Route 53 + EKS/ECS", "Azure: Traffic Manager + AKS", "GCP: Cloud DNS + GKE"], ["Global routing selects the best cloud.", "Each cloud serves its own app stack.", "Shared governance handles identity and telemetry."], ["Scale each cloud independently.", "Use geo-routing or active-active traffic."], ["Federate identity.", "Standardize policy.", "Encrypt cross-cloud paths."], { costOptimized: ["Primary cloud plus smaller standby"], highPerformance: ["Latency-based routing"], enterprise: ["Landing zones and policy-as-code"] }, ["Global SaaS"], ["Resilient", "Flexible"], ["Complex governance", "Higher cost"]),
  pattern("ha_dr", "High Availability / DR", "Primary and recovery regions coordinated for continuity.", "Design an HA/DR setup on AWS with global DNS, multi-AZ primary region, cross-region standby, replicated database, and backup vault.", ["aws"], "network", ["Global DNS", "Primary region", "Standby region", "Replica DB", "Backup vault"], ["AWS: Route 53 + Multi-AZ + cross-region RDS", "Azure: Traffic Manager + geo-replication", "GCP: Cloud DNS + cross-region replicas"], ["Traffic uses the primary region.", "Data replicates to the standby.", "Health checks trigger failover.", "Backups support restore and failback."], ["Use active-active for strict RTO.", "Use warm standby or pilot light to reduce cost."], ["Immutable backups.", "Separate recovery access.", "Encrypt replication."], { costOptimized: ["Pilot light"], highPerformance: ["Active-active"], enterprise: ["Tested runbooks and isolated recovery accounts"] }, ["Payments", "Core SaaS"], ["Strong continuity"], ["Extra cost", "Requires drills"])
];

function scenario(
  id: ArchitectureScenarioId,
  label: string,
  description: string,
  promptSuffix: string,
  useCases: string[],
  components: string[],
  dataFlow: string[],
  scalingStrategy: string[],
  securityConsiderations: string[]
): ArchitectureScenarioDefinition {
  return { id, label, description, promptSuffix, useCases, components, dataFlow, scalingStrategy, securityConsiderations };
}

export const architectureScenarios: ArchitectureScenarioDefinition[] = [
  scenario("generic", "Generic Platform", "Reusable platform blueprint without domain specialization.", "Keep the solution reusable and platform-oriented.", ["Reusable application platforms", "Baseline reference designs"], ["Shared services", "Platform controls"], ["Users enter through standard channels.", "Core services execute common application logic."], ["Start with baseline autoscaling per tier."], ["Use standard IAM, logging, and encryption controls."]),
  scenario("ecommerce", "E-Commerce", "Customer-facing commerce with catalog, cart, checkout, and fulfillment.", "Focus on storefront, cart, checkout, payments, inventory, and fulfillment workflows.", ["Online retail", "Marketplace storefronts"], ["Storefront", "Cart and checkout", "Inventory and order state"], ["Shoppers browse the storefront.", "Checkout services authorize payment and create orders.", "Inventory and fulfillment update asynchronously."], ["Scale storefront and checkout independently.", "Protect flash-sale spikes with caching and async queues."], ["Tokenize payment flows.", "Add WAF, bot protection, and fraud controls."]),
  scenario("digital_banking", "Digital Banking", "Regulated financial workloads with identity, payments, and auditability.", "Focus on digital channels, customer identity, payments, ledger integrity, fraud controls, and audit trails.", ["Retail banking", "Payments platforms"], ["Customer channels", "Payments and ledger domain", "Fraud and audit controls"], ["Customers authenticate through secure channels.", "Transactions flow through payment and ledger services.", "Fraud, compliance, and notifications run in parallel."], ["Scale channels and payment orchestration independently.", "Keep ledger writes tightly controlled and durable."], ["Use strong IAM, encryption, tokenization, immutable audit logs, and DR controls."]),
  scenario("streaming_media", "Streaming Media", "High-throughput media delivery, recommendations, and engagement events.", "Focus on content ingestion, streaming delivery, personalization, analytics, and fan-out events.", ["Video streaming", "Audio platforms"], ["Content delivery", "Recommendation services", "Engagement analytics"], ["Users stream content through edge delivery.", "Playback events feed recommendation and analytics services.", "Catalog and profile systems personalize the experience."], ["Scale edge and playback paths aggressively.", "Use event pipelines for engagement burst handling."], ["Protect subscriber identity, DRM metadata, and session tokens."]),
  scenario("healthcare_platform", "Healthcare Platform", "Patient and clinical systems with strict privacy and integration controls.", "Focus on patient portal, appointment workflows, care coordination, integration, and PHI protection.", ["Patient platforms", "Care coordination systems"], ["Patient portal", "Clinical integration", "Protected health data"], ["Patients and staff access secure portals.", "Clinical workflows integrate with downstream systems.", "Protected data stays encrypted and audited."], ["Scale digital channels independently from backend clinical integrations."], ["Apply PHI controls, audit logging, segmentation, encryption, and least privilege."]),
  scenario("erp_supply_chain", "ERP / Supply Chain", "Enterprise planning, procurement, inventory, and partner integration.", "Focus on ERP workloads, supplier integrations, procurement, warehousing, reporting, and business continuity.", ["ERP modernization", "Supply chain digitization"], ["ERP modules", "Partner integration", "Inventory and reporting"], ["Enterprise users execute planning and procurement workflows.", "Partner and warehouse events sync through integration services.", "Reporting and analytics consume operational data."], ["Scale integration, reporting, and partner exchange paths independently."], ["Protect partner connectivity, audit workflows, and data residency boundaries."]),
  scenario("saas_crm", "SaaS / CRM", "Multi-tenant customer engagement platform with APIs and analytics.", "Focus on tenant isolation, customer records, APIs, notifications, and usage analytics.", ["CRM platforms", "B2B SaaS"], ["Tenant-aware app services", "Customer data services", "Usage analytics"], ["Users access tenant-specific frontends and APIs.", "Core services manage customer data and workflows.", "Notifications and analytics run asynchronously."], ["Scale tenant-facing APIs and background jobs separately."], ["Enforce tenant isolation, API auth, secrets management, and audit trails."]),
  scenario("iot_operations", "IoT Operations", "Device telemetry, streaming ingestion, control loops, and fleet management.", "Focus on device telemetry, control topics, streaming ingestion, fleet management, and operational analytics.", ["Industrial IoT", "Connected operations"], ["Device gateway", "Telemetry ingestion", "Control and analytics loops"], ["Devices publish telemetry continuously.", "Streaming services route events to control and analytics systems.", "Alerts and control actions feed back to the fleet."], ["Scale ingestion and consumers by message rate.", "Separate real-time control from historical analytics."], ["Use certificate-based identity, signed commands, network isolation, and retention governance."])
];

export const quickPrompts = architecturePatterns.map((entry) => entry.prompt);
const architecturePatternMap = Object.fromEntries(architecturePatterns.map((entry) => [entry.id, entry])) as Record<ArchitecturePatternId, ArchitecturePatternDefinition>;
const architectureScenarioMap = Object.fromEntries(architectureScenarios.map((entry) => [entry.id, entry])) as Record<ArchitectureScenarioId, ArchitectureScenarioDefinition>;
const patternKeywords: Record<ArchitecturePatternId, string[]> = {
  single_tier: ["single-tier", "single tier", "monolith"],
  three_tier: ["three-tier", "3-tier", "three tier", "web tier"],
  n_tier: ["n-tier", "n tier", "multi-tier", "api tier"],
  microservices: ["microservices", "microservice"],
  event_driven: ["event-driven", "event driven", "broker", "pub/sub"],
  serverless: ["serverless", "functions", "lambda", "cloud run"],
  data_pipeline: ["etl", "elt", "pipeline", "data lake", "warehouse"],
  hybrid_cloud: ["hybrid", "on-prem", "on prem", "expressroute", "direct connect", "interconnect"],
  multi_cloud: ["multi-cloud", "multi cloud", "cross-cloud"],
  ha_dr: ["disaster recovery", "high availability", "ha/dr", "failover", "rto", "rpo"]
};
const scenarioKeywords: Record<ArchitectureScenarioId, string[]> = {
  generic: ["platform", "application"],
  ecommerce: ["e-commerce", "ecommerce", "storefront", "checkout", "cart", "marketplace", "retail"],
  digital_banking: ["bank", "banking", "payment", "payments", "ledger", "fraud", "fintech"],
  streaming_media: ["streaming", "video", "audio", "media", "playback", "content"],
  healthcare_platform: ["healthcare", "patient", "clinical", "hospital", "phi", "ehr"],
  erp_supply_chain: ["erp", "supply chain", "warehouse", "procurement", "inventory", "supplier"],
  saas_crm: ["saas", "crm", "tenant", "customer engagement", "b2b"],
  iot_operations: ["iot", "device", "telemetry", "fleet", "sensor", "industrial"]
};

interface PatternFeatures {
  database: boolean;
  analytics: boolean;
  dr: boolean;
}

interface PatternDiagramData {
  title: string;
  summary: string;
  assumptions: string[];
  nodes: DiagramNode[];
  edges: DiagramEdge[];
}

function formatWorkload(workload: RecommendationRequest["workload_type"]) {
  return formatWorkloadLabel(workload);
}

function createPatternTitle(label: string, providers: ArchitectureCloudProvider[]) {
  return `Agent Architect: ${label} on ${providers.map((provider) => providerLabels[provider]).join(" + ")}`;
}

export function createId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
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

function pushNode(
  nodes: DiagramNode[],
  title: string,
  subtitle: string,
  provider: DiagramProvider,
  category: DiagramCategory,
  x: number,
  y: number,
  width = NODE_WIDTH,
  height = NODE_HEIGHT
) {
  const node = buildNode(title, subtitle, provider, category, x, y, width, height);
  nodes.push(node);
  return node;
}

function connect(edges: DiagramEdge[], from: DiagramNode, to: DiagramNode, label?: string) {
  edges.push({ id: createId("edge"), from: from.id, to: to.id, label });
}

export function detectProviders(prompt: string, selectedProviders: ArchitectureCloudProvider[]) {
  if (selectedProviders.length) {
    return Array.from(new Set(selectedProviders));
  }

  const normalized = prompt.toLowerCase();
  const mentioned = architectureProviderOptions.filter((provider) =>
    providerAliases[provider].some((alias) => normalized.includes(alias))
  );
  if (mentioned.length) {
    return mentioned;
  }

  return DEFAULT_ARCHITECT_PROVIDERS;
}

export function detectArchitecturePattern(prompt: string, fallback: ArchitecturePatternId = "multi_cloud") {
  const normalized = prompt.toLowerCase();
  for (const [pattern, keywords] of Object.entries(patternKeywords) as [ArchitecturePatternId, string[]][]) {
    if (keywords.some((keyword) => normalized.includes(keyword))) {
      return pattern;
    }
  }

  return fallback;
}

export function detectArchitectureScenario(prompt: string, fallback: ArchitectureScenarioId = "generic") {
  const normalized = prompt.toLowerCase();
  for (const [scenarioId, keywords] of Object.entries(scenarioKeywords) as [ArchitectureScenarioId, string[]][]) {
    if (scenarioId !== "generic" && keywords.some((keyword) => normalized.includes(keyword))) {
      return scenarioId;
    }
  }

  return fallback;
}

function inferFeatures(prompt: string, request: RecommendationRequest | null, providerCount: number): PatternFeatures {
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
      normalized.includes("warehouse") ||
      normalized.includes("pipeline"),
    dr:
      normalized.includes("dr") ||
      normalized.includes("disaster recovery") ||
      normalized.includes("backup") ||
      Boolean(request?.requires_disaster_recovery) ||
      providerCount > 1
  };
}

function ensureProviders(pattern: ArchitecturePatternId, selectedProviders: ArchitectureCloudProvider[]) {
  const detected = Array.from(new Set(selectedProviders.length ? selectedProviders : DEFAULT_ARCHITECT_PROVIDERS));
  if (pattern === "multi_cloud") {
    return detected as ArchitectureCloudProvider[];
  }

  return [detected[0] ?? DEFAULT_ARCHITECT_PROVIDERS[0]];
}

function resolveArchitecturePattern(
  prompt: string,
  selectedPattern: ArchitecturePatternId | undefined,
  providers: ArchitectureCloudProvider[]
) {
  const detectedPattern = selectedPattern ?? detectArchitecturePattern(prompt);
  if (providers.length > 1 && detectedPattern !== "multi_cloud") {
    return "multi_cloud";
  }

  return detectedPattern;
}

export function getProviderLaneWidth(providerCount: number) {
  return providerCount === 1 ? 720 : Math.max(280, Math.floor((CANVAS_WIDTH - 340) / providerCount));
}

function buildSingleTierDiagram(provider: ArchitectureCloudProvider, features: PatternFeatures): PatternDiagramData {
  const nodes: DiagramNode[] = [];
  const edges: DiagramEdge[] = [];
  const users = pushNode(nodes, "Users", "Internal or lightweight external users", "shared", "users", 72, 250);
  const app = pushNode(nodes, "Single application server", getProviderService(provider, "compute"), provider, "compute", 420, 250, 250, 100);
  const state = pushNode(
    nodes,
    features.database ? getProviderService(provider, "database") : "Local or attached storage",
    features.database ? "Application state" : "Files and snapshots",
    provider,
    features.database ? "database" : "storage",
    820,
    250,
    250,
    100
  );
  connect(edges, users, app, "HTTPS");
  connect(edges, app, state, "read / write");
  return {
    title: createPatternTitle("Single-Tier", [provider]),
    summary: "A compact deployment that keeps UI, logic, and data close together.",
    assumptions: ["One deployable runtime", "Scale vertically first", "Backups are mandatory"],
    nodes,
    edges
  };
}

function buildThreeTierDiagram(provider: ArchitectureCloudProvider): PatternDiagramData {
  const nodes: DiagramNode[] = [];
  const edges: DiagramEdge[] = [];
  const users = pushNode(nodes, "Users", "Web and mobile clients", "shared", "users", 56, 250);
  const lb = pushNode(nodes, getProviderService(provider, "networking"), "Public entry", provider, "networking", 280, 250, 210, 92);
  const web = pushNode(nodes, "Web tier", "Presentation and session handling", provider, "compute", 540, 120, 220, 92);
  const app = pushNode(nodes, "Application tier", "Business logic and APIs", provider, "compute", 540, 320, 220, 92);
  const db = pushNode(nodes, getProviderService(provider, "database"), "Transactional state", provider, "database", 860, 250, 220, 92);
  connect(edges, users, lb, "HTTPS");
  connect(edges, lb, web, "routes");
  connect(edges, web, app, "calls");
  connect(edges, app, db, "SQL");
  return {
    title: createPatternTitle("3-Tier", [provider]),
    summary: "The classic web, application, and database separation for transactional systems.",
    assumptions: ["Only the edge is public", "Web and app tiers scale independently", "DB stays private"],
    nodes,
    edges
  };
}

function buildNTierDiagram(provider: ArchitectureCloudProvider, features: PatternFeatures): PatternDiagramData {
  const nodes: DiagramNode[] = [];
  const edges: DiagramEdge[] = [];
  const users = pushNode(nodes, "Users", "Digital channels", "shared", "users", 52, 110);
  const edge = pushNode(nodes, "CDN and WAF", "Edge acceleration and filtering", "shared", "security", 52, 250, 220, 92);
  const web = pushNode(nodes, "Web tier", "UI composition", provider, "compute", 340, 110, 220, 92);
  const api = pushNode(nodes, "API tier", "Routing and validation", provider, "integration", 340, 250, 220, 92);
  const svc = pushNode(nodes, "Domain services", "Business capabilities", provider, "compute", 340, 390, 240, 92);
  const cache = pushNode(nodes, "Cache", "Low-latency reads", provider, "storage", 660, 110, 210, 92);
  const queue = pushNode(nodes, "Queue", "Async work", provider, "integration", 660, 250, 210, 92);
  const db = pushNode(nodes, getProviderService(provider, "database"), "Operational state", provider, "database", 660, 390, 210, 92);
  const lake = pushNode(nodes, getProviderService(provider, "storage"), "Archive and objects", provider, "storage", 980, 250, 210, 92);
  connect(edges, users, edge, "HTTPS");
  connect(edges, edge, web, "serve");
  connect(edges, web, api, "HTTP");
  connect(edges, api, svc, "domain");
  connect(edges, svc, cache, "hot reads");
  connect(edges, svc, queue, "async");
  connect(edges, svc, db, "transactions");
  connect(edges, db, lake, "backup");
  if (features.analytics) {
    const analytics = pushNode(nodes, getProviderService(provider, "analytics"), "Analytics workloads", provider, "analytics", 980, 390, 210, 92);
    connect(edges, lake, analytics, "curated data");
  }
  return {
    title: createPatternTitle("N-Tier", [provider]),
    summary: "A layered design with edge, API, domain, async, and data tiers.",
    assumptions: ["Edge is isolated from domain logic", "Async paths absorb burst", "Cache reduces read pressure"],
    nodes,
    edges
  };
}

function buildMicroservicesDiagram(provider: ArchitectureCloudProvider): PatternDiagramData {
  const nodes: DiagramNode[] = [];
  const edges: DiagramEdge[] = [];
  const users = pushNode(nodes, "Users", "Apps and partners", "shared", "users", 46, 250);
  const gateway = pushNode(nodes, "API gateway", "Auth, routing, throttling", provider, "integration", 250, 250, 220, 92);
  const catalog = pushNode(nodes, "Catalog service", "Discovery domain", provider, "compute", 560, 90, 220, 92);
  const orders = pushNode(nodes, "Order service", "Checkout domain", provider, "compute", 560, 250, 220, 92);
  const identity = pushNode(nodes, "Identity service", "User profile domain", provider, "compute", 560, 410, 220, 92);
  const dbA = pushNode(nodes, "Catalog DB", "Service-owned state", provider, "database", 890, 90, 190, 88);
  const dbB = pushNode(nodes, "Order DB", "Service-owned state", provider, "database", 890, 250, 190, 88);
  const dbC = pushNode(nodes, "Identity DB", "Service-owned state", provider, "database", 890, 410, 190, 88);
  const bus = pushNode(nodes, getProviderService(provider, "integration"), "Events across domains", provider, "integration", 560, 580, 240, 92);
  connect(edges, users, gateway, "API");
  connect(edges, gateway, catalog, "route");
  connect(edges, gateway, orders, "route");
  connect(edges, gateway, identity, "route");
  connect(edges, catalog, dbA, "owns");
  connect(edges, orders, dbB, "owns");
  connect(edges, identity, dbC, "owns");
  connect(edges, catalog, bus, "publish");
  connect(edges, orders, bus, "publish");
  connect(edges, identity, bus, "publish");
  return {
    title: createPatternTitle("Microservices", [provider]),
    summary: "Business capabilities are split into independently deployable services with bounded data ownership.",
    assumptions: ["Each service owns its data", "Cross-domain coordination uses APIs or events", "Scaling is per service"],
    nodes,
    edges
  };
}

function buildEventDrivenDiagram(provider: ArchitectureCloudProvider): PatternDiagramData {
  const nodes: DiagramNode[] = [];
  const edges: DiagramEdge[] = [];
  const producers = pushNode(nodes, "Event producers", "Apps, devices, integrations", "shared", "integration", 60, 250, 220, 92);
  const broker = pushNode(nodes, getProviderService(provider, "integration"), "Broker and durable topics", provider, "integration", 340, 250, 240, 92);
  const ops = pushNode(nodes, "Operational consumer", "Updates live state", provider, "compute", 680, 90, 220, 92);
  const analytics = pushNode(nodes, "Analytics consumer", "Feeds analytical storage", provider, "compute", 680, 250, 220, 92);
  const notify = pushNode(nodes, "Notification consumer", "Alerts and fan-out", provider, "compute", 680, 410, 220, 92);
  const db = pushNode(nodes, getProviderService(provider, "database"), "Operational store", provider, "database", 980, 90, 200, 88);
  const lake = pushNode(nodes, getProviderService(provider, "storage"), "Lake sink", provider, "storage", 980, 250, 200, 88);
  const dlq = pushNode(nodes, "Dead-letter queue", "Failed events", "shared", "integration", 980, 410, 200, 88);
  connect(edges, producers, broker, "publish");
  connect(edges, broker, ops, "subscribe");
  connect(edges, broker, analytics, "subscribe");
  connect(edges, broker, notify, "subscribe");
  connect(edges, ops, db, "update");
  connect(edges, analytics, lake, "land");
  connect(edges, notify, dlq, "failed messages");
  return {
    title: createPatternTitle("Event-Driven", [provider]),
    summary: "Producers emit events and independent consumers react asynchronously.",
    assumptions: ["Consumers are idempotent", "DLQ exists for replay", "Ordering is explicit only where required"],
    nodes,
    edges
  };
}

function buildServerlessDiagram(provider: ArchitectureCloudProvider): PatternDiagramData {
  const nodes: DiagramNode[] = [];
  const edges: DiagramEdge[] = [];
  const users = pushNode(nodes, "Users", "Apps and automation", "shared", "users", 64, 250, 210, 92);
  const edge = pushNode(nodes, "CDN", "Static and edge acceleration", "shared", "networking", 290, 110, 190, 88);
  const api = pushNode(nodes, "API gateway", "Routing and auth", provider, "integration", 290, 290, 190, 88);
  const fn = pushNode(nodes, "Functions", "Stateless business logic", provider, "compute", 560, 200, 220, 100);
  const db = pushNode(nodes, getProviderService(provider, "database"), "Managed state", provider, "database", 900, 110, 210, 88);
  const store = pushNode(nodes, getProviderService(provider, "storage"), "Objects and media", provider, "storage", 900, 250, 210, 88);
  const queue = pushNode(nodes, getProviderService(provider, "integration"), "Async tasks", provider, "integration", 900, 390, 210, 88);
  connect(edges, users, edge, "static");
  connect(edges, users, api, "API");
  connect(edges, api, fn, "invoke");
  connect(edges, fn, db, "state");
  connect(edges, fn, store, "objects");
  connect(edges, fn, queue, "async");
  return {
    title: createPatternTitle("Serverless", [provider]),
    summary: "Managed functions and event services remove most server operations.",
    assumptions: ["Functions are stateless", "Long-running work is offloaded", "Secrets are centrally managed"],
    nodes,
    edges
  };
}

function buildDataPipelineDiagram(provider: ArchitectureCloudProvider): PatternDiagramData {
  const nodes: DiagramNode[] = [];
  const edges: DiagramEdge[] = [];
  const sources = pushNode(nodes, "Sources", "Apps, streams, SaaS", "shared", "integration", 60, 250, 210, 92);
  const ingest = pushNode(nodes, "Ingestion", "Batch and streaming intake", provider, "integration", 320, 250, 210, 92);
  const raw = pushNode(nodes, "Raw data lake", "Durable landing zone", provider, "storage", 580, 110, 220, 92);
  const etl = pushNode(nodes, "ETL / ELT", "Cleanse and enrich", provider, "analytics", 580, 250, 220, 92);
  const curated = pushNode(nodes, "Curated warehouse", "Modeled analytical store", provider, "analytics", 880, 250, 220, 92);
  const consumers = pushNode(nodes, "BI and ML", "Dashboards and models", "shared", "ai_ml", 1140, 250, 180, 92);
  connect(edges, sources, ingest, "collect");
  connect(edges, ingest, raw, "land");
  connect(edges, raw, etl, "transform");
  connect(edges, etl, curated, "publish");
  connect(edges, curated, consumers, "serve");
  return {
    title: createPatternTitle("Data Pipeline / ETL", [provider]),
    summary: "Raw data is ingested, transformed, curated, and served to analytical consumers.",
    assumptions: ["Raw and curated zones stay separate", "Data quality gates exist", "Batch and streaming can coexist"],
    nodes,
    edges
  };
}

function buildHybridDiagram(provider: ArchitectureCloudProvider): PatternDiagramData {
  const nodes: DiagramNode[] = [];
  const edges: DiagramEdge[] = [];
  const onPremApps = pushNode(nodes, "On-prem apps", "Legacy line-of-business systems", "shared", "compute", 70, 140, 220, 92);
  const onPremDb = pushNode(nodes, "On-prem DB", "Core transactional data", "shared", "database", 70, 330, 220, 92);
  const link = pushNode(nodes, "Private connectivity", "VPN / ExpressRoute / Direct Connect", "shared", "networking", 350, 240, 250, 92);
  const hub = pushNode(nodes, "Cloud hub network", "Transit and inspection", provider, "networking", 680, 100, 220, 92);
  const apps = pushNode(nodes, "Cloud app services", "Digital channels and APIs", provider, "compute", 680, 280, 220, 92);
  const backup = pushNode(nodes, "Cloud backup / DR", "Recovery copies", provider, "storage", 680, 460, 220, 92);
  const identity = pushNode(nodes, "Federated identity", "SSO and trust", "shared", "identity", 980, 100, 220, 92);
  const obs = pushNode(nodes, "Unified monitoring", "Cross-site logs and alerts", "shared", "observability", 980, 280, 220, 92);
  connect(edges, onPremApps, link, "private route");
  connect(edges, onPremDb, link, "replication");
  connect(edges, link, hub, "connect");
  connect(edges, hub, apps, "serve");
  connect(edges, onPremDb, backup, "copy");
  connect(edges, identity, apps, "federate");
  connect(edges, apps, obs, "metrics");
  return {
    title: createPatternTitle("Hybrid Cloud", [provider]),
    summary: "On-prem systems stay in place while cloud services extend channels, analytics, and recovery.",
    assumptions: ["Core systems remain on-prem", "Connectivity is private", "Operations needs shared visibility"],
    nodes,
    edges
  };
}

function buildMultiCloudDiagram(providers: ArchitectureCloudProvider[]): PatternDiagramData {
  const nodes: DiagramNode[] = [];
  const edges: DiagramEdge[] = [];
  const routing = pushNode(nodes, "Global traffic manager", "Geo and health-based routing", "shared", "networking", 60, 250, 240, 92);
  const identity = pushNode(nodes, "Shared identity", "Federated access and secrets", "shared", "identity", 60, 110, 220, 88);
  const obs = pushNode(nodes, "Shared observability", "Cross-cloud telemetry", "shared", "observability", 60, 410, 220, 88);
  providers.forEach((provider, index) => {
    const x = 380 + index * 290;
    const edge = pushNode(nodes, providerLabels[provider], `${providerLabels[provider]} application edge`, provider, "networking", x, 110, 220, 88);
    const app = pushNode(nodes, getProviderService(provider, "compute"), "Provider application stack", provider, "compute", x, 250, 220, 88);
    const data = pushNode(nodes, getProviderService(provider, "database"), "Provider data plane", provider, "database", x, 390, 220, 88);
    connect(edges, routing, edge, "route");
    connect(edges, edge, app, "serve");
    connect(edges, app, data, "state");
    connect(edges, identity, app, "federate");
    connect(edges, app, obs, "telemetry");
  });
  return {
    title: createPatternTitle("Multi-Cloud", providers),
    summary: "Multiple cloud stacks are coordinated under shared routing, identity, and observability.",
    assumptions: ["At least two clouds participate", "Identity and observability are standardized", "Data boundaries are explicit"],
    nodes,
    edges
  };
}

function buildHaDrDiagram(provider: ArchitectureCloudProvider): PatternDiagramData {
  const nodes: DiagramNode[] = [];
  const edges: DiagramEdge[] = [];
  const dns = pushNode(nodes, "Global DNS", "Health checks and failover", "shared", "networking", 70, 250, 220, 92);
  const primaryApp = pushNode(nodes, "Primary region app", "Active traffic", provider, "compute", 420, 130, 230, 92);
  const primaryDb = pushNode(nodes, "Primary DB", "Primary state store", provider, "database", 420, 330, 230, 92);
  const standbyApp = pushNode(nodes, "Standby region app", "Warm or active standby", provider, "compute", 780, 130, 230, 92);
  const standbyDb = pushNode(nodes, "Replica DB", "Cross-region replication", provider, "database", 780, 330, 230, 92);
  const backup = pushNode(nodes, "Backup vault", "Immutable backups", "shared", "storage", 1080, 230, 180, 92);
  const runbooks = pushNode(nodes, "Recovery runbooks", "Failover orchestration", "shared", "observability", 420, 530, 230, 92);
  connect(edges, dns, primaryApp, "primary");
  connect(edges, dns, standbyApp, "failover");
  connect(edges, primaryApp, primaryDb, "transactions");
  connect(edges, primaryDb, standbyDb, "replicate");
  connect(edges, standbyApp, standbyDb, "activate");
  connect(edges, primaryDb, backup, "backup");
  connect(edges, standbyDb, backup, "backup");
  connect(edges, runbooks, standbyApp, "orchestrate");
  return {
    title: createPatternTitle("High Availability / DR", [provider]),
    summary: "Primary and recovery regions are coordinated to meet continuity targets.",
    assumptions: ["RTO and RPO are defined", "Backups survive regional failure", "Failover runbooks are tested"],
    nodes,
    edges
  };
}

function buildPatternDiagram(
  patternId: ArchitecturePatternId,
  providers: ArchitectureCloudProvider[],
  features: PatternFeatures
) {
  const provider = providers[0] ?? DEFAULT_ARCHITECT_PROVIDERS[0];
  switch (patternId) {
    case "single_tier":
      return buildSingleTierDiagram(provider, features);
    case "three_tier":
      return buildThreeTierDiagram(provider);
    case "n_tier":
      return buildNTierDiagram(provider, features);
    case "microservices":
      return buildMicroservicesDiagram(provider);
    case "event_driven":
      return buildEventDrivenDiagram(provider);
    case "serverless":
      return buildServerlessDiagram(provider);
    case "data_pipeline":
      return buildDataPipelineDiagram(provider);
    case "hybrid_cloud":
      return buildHybridDiagram(provider);
    case "multi_cloud":
      return buildMultiCloudDiagram(providers);
    case "ha_dr":
      return buildHaDrDiagram(provider);
  }
}

function relabelNode(plan: PatternDiagramData, currentTitle: string, nextTitle: string, nextSubtitle?: string) {
  const node = plan.nodes.find((entry) => entry.title === currentTitle);
  if (!node) {
    return;
  }
  node.title = nextTitle;
  if (nextSubtitle) {
    node.subtitle = nextSubtitle;
  }
}

function applyScenarioToDiagram(plan: PatternDiagramData, scenarioId: ArchitectureScenarioId) {
  switch (scenarioId) {
    case "ecommerce":
      relabelNode(plan, "Web tier", "Storefront tier", "Catalog pages and shopper sessions");
      relabelNode(plan, "Application tier", "Checkout and order tier", "Cart, checkout, pricing, promotions");
      relabelNode(plan, "Catalog service", "Catalog service", "Product discovery and pricing");
      relabelNode(plan, "Order service", "Order service", "Checkout and fulfillment orchestration");
      relabelNode(plan, "Identity service", "Customer identity service", "Profiles, loyalty, and sessions");
      relabelNode(plan, "Event producers", "Commerce event producers", "Storefront, checkout, warehouse systems");
      break;
    case "digital_banking":
      relabelNode(plan, "Application tier", "Payments and ledger tier", "Funds transfer, ledger posting, statements");
      relabelNode(plan, "Domain services", "Banking domain services", "Payments, ledger, compliance, fraud orchestration");
      relabelNode(plan, "Catalog service", "Accounts service", "Products, balances, and account context");
      relabelNode(plan, "Order service", "Payments service", "Payments, transfers, and settlement");
      relabelNode(plan, "Identity service", "Customer identity service", "KYC, profiles, and secure access");
      relabelNode(plan, "Cloud app services", "Digital banking channels", "Mobile, web, and API banking channels");
      break;
    case "streaming_media":
      relabelNode(plan, "Web tier", "Playback experience tier", "Playback UI, sessions, and search");
      relabelNode(plan, "Domain services", "Content and recommendation services", "Catalog, recommendations, entitlements");
      relabelNode(plan, "Catalog service", "Content catalog service", "Titles, metadata, recommendation seeds");
      relabelNode(plan, "Order service", "Subscription service", "Plans, billing, and entitlements");
      relabelNode(plan, "Event producers", "Playback event producers", "Player telemetry and engagement events");
      break;
    case "healthcare_platform":
      relabelNode(plan, "Web tier", "Patient portal tier", "Scheduling, messaging, patient access");
      relabelNode(plan, "Application tier", "Care workflow tier", "Appointments, referrals, care plans");
      relabelNode(plan, "Domain services", "Clinical integration services", "Care coordination and provider workflows");
      relabelNode(plan, "Cloud app services", "Patient and provider apps", "Secure care coordination channels");
      break;
    case "erp_supply_chain":
      relabelNode(plan, "Application tier", "ERP process tier", "Procurement, finance, inventory, planning");
      relabelNode(plan, "Domain services", "ERP and partner services", "Planning, warehousing, supplier exchange");
      relabelNode(plan, "Cloud app services", "ERP extension services", "Supplier portal and warehouse operations");
      relabelNode(plan, "Event producers", "Supply chain event producers", "Warehouses, suppliers, ERP modules");
      break;
    case "saas_crm":
      relabelNode(plan, "Web tier", "Tenant portal tier", "Tenant-aware UI and workflows");
      relabelNode(plan, "Application tier", "CRM workflow tier", "Leads, accounts, activities, automation");
      relabelNode(plan, "Catalog service", "Customer model service", "Accounts, contacts, segmentation");
      relabelNode(plan, "Order service", "Workflow automation service", "Campaigns, tasks, notifications");
      relabelNode(plan, "Identity service", "Tenant identity service", "Tenant auth and admin boundaries");
      break;
    case "iot_operations":
      relabelNode(plan, "Domain services", "Fleet and control services", "Device registry, rules, control loops");
      relabelNode(plan, "Event producers", "Telemetry producers", "Devices, gateways, edge collectors");
      relabelNode(plan, "Ingestion", "Telemetry ingestion", "Device streams and command acknowledgements");
      relabelNode(plan, "Notification consumer", "Control consumer", "Alerts and operational actions");
      break;
    default:
      break;
  }

  return plan;
}

function getNetworkBucket(category: DiagramCategory) {
  if (category === "users" || category === "networking" || category === "security" || category === "identity") {
    return "edge";
  }

  if (category === "database" || category === "storage" || category === "analytics" || category === "ai_ml") {
    return "data";
  }

  if (category === "observability") {
    return "ops";
  }

  return "app";
}

function buildWorkflowLevels(nodes: DiagramNode[], edges: DiagramEdge[]) {
  const indegree = new Map(nodes.map((node) => [node.id, 0]));
  const adjacency = new Map(nodes.map((node) => [node.id, [] as string[]]));
  const level = new Map(nodes.map((node) => [node.id, 0]));

  for (const edge of edges) {
    adjacency.get(edge.from)?.push(edge.to);
    indegree.set(edge.to, (indegree.get(edge.to) ?? 0) + 1);
  }

  const queue = nodes.filter((node) => (indegree.get(node.id) ?? 0) === 0).map((node) => node.id);

  while (queue.length > 0) {
    const nodeId = queue.shift()!;
    const currentLevel = level.get(nodeId) ?? 0;

    for (const targetId of adjacency.get(nodeId) ?? []) {
      level.set(targetId, Math.max(level.get(targetId) ?? 0, currentLevel + 1));
      indegree.set(targetId, (indegree.get(targetId) ?? 0) - 1);
      if ((indegree.get(targetId) ?? 0) === 0) {
        queue.push(targetId);
      }
    }
  }

  return level;
}

function applyDiagramStyleLayout(
  plan: PatternDiagramData,
  providers: ArchitectureCloudProvider[],
  diagramStyle: DiagramStyle,
  patternId: ArchitecturePatternId
) {
  const nodes = plan.nodes.map((node) => ({ ...node }));
  const laneWidth = getProviderLaneWidth(providers.length);
  const providerIndex = new Map(providers.map((provider, index) => [provider, index]));

  if (diagramStyle === "network") {
    const bucketRows = { edge: 96, app: 240, data: 486, ops: 632 };
    const bucketCounts = new Map<string, number>();

    for (const node of nodes) {
      const bucket = getNetworkBucket(node.category);
      const key = `${node.provider}:${bucket}`;
      const index = bucketCounts.get(key) ?? 0;
      bucketCounts.set(key, index + 1);

      const baseX =
        node.provider === "shared"
          ? 48
          : PROVIDER_LANE_START + (providerIndex.get(node.provider as ArchitectureCloudProvider) ?? 0) * laneWidth + 28;
      const widthBudget = node.provider === "shared" ? 250 : Math.max(220, laneWidth - 56);
      const columns = Math.max(1, Math.floor(widthBudget / 250));
      const column = index % columns;
      const row = Math.floor(index / columns);

      node.x = baseX + column * 226;
      node.y = bucketRows[bucket] + row * 94;
    }

    return { ...plan, nodes };
  }

  if (diagramStyle === "workflow") {
    const levelMap = buildWorkflowLevels(nodes, plan.edges);
    const bucketRows = { edge: 104, app: 248, data: 458, ops: 612 };
    const levelCounts = new Map<string, number>();

    for (const node of nodes) {
      const level = levelMap.get(node.id) ?? 0;
      const bucket =
        patternId === "microservices" && node.subtitle === "Events across domains"
          ? "ops"
          : getNetworkBucket(node.category);
      const key = `${node.provider}:${bucket}:${level}`;
      const index = levelCounts.get(key) ?? 0;
      levelCounts.set(key, index + 1);

      const baseX =
        node.provider === "shared"
          ? 52
          : PROVIDER_LANE_START + (providerIndex.get(node.provider as ArchitectureCloudProvider) ?? 0) * laneWidth + 36;
      node.x = baseX + level * 188;
      node.y = bucketRows[bucket] + index * 92;
    }

    return { ...plan, nodes };
  }

  return { ...plan, nodes };
}

export function buildArchitecturePlan(
  prompt: string,
  selectedProviders: ArchitectureCloudProvider[],
  request: RecommendationRequest | null,
  diagramStyle: DiagramStyle = "reference",
  selectedPattern?: ArchitecturePatternId,
  selectedScenario?: ArchitectureScenarioId
): DiagramPlan {
  const detectedProviders = detectProviders(prompt, selectedProviders);
  const patternId = resolveArchitecturePattern(prompt, selectedPattern, detectedProviders);
  const scenarioId = selectedScenario ?? detectArchitectureScenario(prompt);
  const providers = ensureProviders(patternId, detectedProviders);
  const definition = architecturePatternMap[patternId];
  const scenario = architectureScenarioMap[scenarioId];
  const features = inferFeatures(prompt, request, providers.length);
  const base = applyDiagramStyleLayout(
    applyScenarioToDiagram(buildPatternDiagram(patternId, providers, features), scenarioId),
    providers,
    diagramStyle,
    patternId
  );
  return {
    ...base,
    providers,
    pattern: patternId,
    patternLabel: definition.label,
    scenario: scenarioId,
    scenarioLabel: scenario.label,
    components: [...definition.components, ...scenario.components],
    cloudServices: definition.cloudServices,
    dataFlow: [...definition.dataFlow, ...scenario.dataFlow],
    scalingStrategy: [...definition.scalingStrategy, ...scenario.scalingStrategy],
    securityConsiderations: [...definition.securityConsiderations, ...scenario.securityConsiderations],
    variations: definition.variations,
    useCases: [...scenario.useCases, ...definition.useCases],
    pros: definition.pros,
    cons: definition.cons,
    assumptions: [
      ...base.assumptions,
      `Solution context: ${scenario.label}.`,
      `Primary workload: ${request ? formatWorkload(request.workload_type) : "application platform"}.`,
      `${features.dr ? "Recovery posture is represented in the draft." : "Recovery can be expanded further if stricter targets are required."}`,
      `Rendered as a ${diagramStyle} diagram.`
    ]
  };
}

export function buildAgentMessage(plan: DiagramPlan) {
  return `${plan.scenarioLabel} ${plan.patternLabel.toLowerCase()} prepared across ${plan.providers.map((provider) => providerLabels[provider]).join(", ")}. Generated ${plan.nodes.length} nodes and ${plan.edges.length} flows.`;
}

export function findNextPosition(nodeCount: number) {
  const column = nodeCount % 3;
  const row = Math.floor(nodeCount / 3);
  return { x: 380 + column * 240, y: 620 + row * 92 };
}

export function getArchitectureCanvasWidth(plan: DiagramPlan) {
  const laneWidth = getProviderLaneWidth(plan.providers.length);
  const providerWidth = PROVIDER_LANE_START + plan.providers.length * laneWidth + 60;
  const nodeWidth = plan.nodes.length ? Math.max(...plan.nodes.map((node) => node.x + node.width)) + 64 : 0;

  return Math.max(CANVAS_WIDTH, providerWidth, nodeWidth);
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
  const canvasWidth = getArchitectureCanvasWidth(plan);
  const dataZoneCategories = new Set<DiagramCategory>(["database", "storage", "analytics", "ai_ml"]);
  const zonePadding = { left: 18, right: 18, top: 54, bottom: 22 };
  const expandZoneToFitNodes = (zone: CanvasZone, nodes: DiagramNode[]) => {
    if (nodes.length === 0) {
      return zone;
    }

    const minX = Math.min(...nodes.map((node) => node.x)) - zonePadding.left;
    const minY = Math.min(...nodes.map((node) => node.y)) - zonePadding.top;
    const maxX = Math.max(...nodes.map((node) => node.x + node.width)) + zonePadding.right;
    const maxY = Math.max(...nodes.map((node) => node.y + node.height)) + zonePadding.bottom;

    const x = Math.max(16, minX);
    const y = Math.max(72, minY);
    const width = Math.min(canvasWidth - x - 16, Math.max(MIN_ZONE_WIDTH, maxX - x));
    const height = Math.min(CANVAS_HEIGHT - y - 20, Math.max(MIN_ZONE_HEIGHT, maxY - y));

    return {
      ...zone,
      x,
      y,
      width,
      height
    };
  };
  const isDataZoneNode = (node: DiagramNode) => {
    if (dataZoneCategories.has(node.category)) {
      return true;
    }

    if (plan.pattern === "n_tier" && node.category === "integration" && node.x >= 600) {
      return true;
    }

    return (node.category === "integration" || node.category === "observability") && node.y >= 360;
  };
  const zones: CanvasZone[] = [
    {
      id: "shared-zone",
      label:
        plan.pattern === "hybrid_cloud"
          ? "On-prem and shared control"
          : diagramStyle === "workflow"
            ? "Shared flow services"
            : "Shared services",
      fontSize: 15,
      x: 44,
      y: 96,
      width: 214,
      height: 612,
      stroke: "#7aa0df",
      fill: "rgba(237, 244, 255, 0.45)"
    }
  ];

  const sharedNodes = plan.nodes.filter((node) => node.provider === "shared");
  zones[0] = expandZoneToFitNodes(zones[0], sharedNodes);

  plan.providers.forEach((provider, index) => {
    const laneX = PROVIDER_LANE_START + index * laneWidth;
    const zoneWidth = Math.max(laneWidth - 58, 220);
    const appZone: CanvasZone = {
      id: `${provider}-app-zone`,
      label: diagramStyle === "network" ? "Application subnet" : "Application component",
      fontSize: 15,
      x: laneX - 2,
      y: 116,
      width: zoneWidth,
      height: 228,
      stroke: providerColors[provider].stroke,
      fill: "rgba(255,255,255,0.22)"
    };
    const dataZone: CanvasZone = {
      id: `${provider}-data-zone`,
      label: plan.pattern === "data_pipeline" ? "Data stages" : diagramStyle === "workflow" ? "Data and automation component" : "Data component",
      fontSize: 15,
      x: laneX - 2,
      y: 372,
      width: zoneWidth,
      height: 304,
      stroke: providerColors[provider].stroke,
      fill: "rgba(255,255,255,0.16)"
    };
    const providerNodes = plan.nodes.filter((node) => node.provider === provider);
    const appNodes = providerNodes.filter((node) => !isDataZoneNode(node));
    const dataNodes = providerNodes.filter((node) => isDataZoneNode(node));

    zones.push(expandZoneToFitNodes(appZone, appNodes));
    zones.push(expandZoneToFitNodes(dataZone, dataNodes));
  });

  return zones.map((zone) => ({ ...zone, ...(zoneOverrides[zone.id] ?? {}) }));
}

export function buildCanvasLanes(
  plan: DiagramPlan,
  diagramStyle: DiagramStyle,
  laneOverrides: Record<string, Partial<CanvasLane>> = {}
) {
  const laneWidth = getProviderLaneWidth(plan.providers.length);
  const canvasWidth = getArchitectureCanvasWidth(plan);
  const lanePadding = { left: 24, right: 24, top: 56, bottom: 20 };
  const expandLaneToFitNodes = (lane: CanvasLane, nodes: DiagramNode[]) => {
    if (nodes.length === 0) {
      return lane;
    }

    const minX = Math.min(...nodes.map((node) => node.x)) - lanePadding.left;
    const maxX = Math.max(...nodes.map((node) => node.x + node.width)) + lanePadding.right;

    const x = Math.max(16, Math.min(lane.x, minX));
    const width = Math.min(canvasWidth - x - 16, Math.max(lane.width, maxX - x));

    return {
      ...lane,
      x,
      width
    };
  };
  const lanes: CanvasLane[] = [
    {
      id: "lane-shared",
      provider: "shared",
      label: plan.pattern === "hybrid_cloud" ? "On-prem and shared services" : diagramStyle === "workflow" ? "Shared workflow services" : "Shared services",
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
  const sharedNodes = plan.nodes.filter((node) => node.provider === "shared");
  lanes[0] = expandLaneToFitNodes(lanes[0], sharedNodes);

  plan.providers.forEach((provider, index) => {
    const laneX = PROVIDER_LANE_START + index * laneWidth;
    const lane: CanvasLane = {
      id: `lane-${provider}`,
      provider,
      label: plan.pattern === "ha_dr" ? `${providerLabels[provider]} primary and standby` : providerLabels[provider],
      fontSize: 22,
      x: laneX - 18,
      y: 40,
      width: laneWidth - 14,
      height: 700,
      fill: providerColors[provider].fill,
      stroke: `${providerColors[provider].stroke}2e`,
      text: providerColors[provider].text
    };

    lanes.push(expandLaneToFitNodes(lane, plan.nodes.filter((node) => node.provider === provider)));
  });

  return lanes.map((lane) => ({ ...lane, ...(laneOverrides[lane.id] ?? {}) }));
}

export function getLegendItems(diagramStyle: DiagramStyle) {
  if (diagramStyle === "network") {
    return ["Ingress and route", "Private path", "Replication / DR", "Governed boundary"];
  }
  if (diagramStyle === "workflow") {
    return ["Request flow", "Async path", "Data publication", "Feedback loop"];
  }
  return ["Application component", "Data component", "Shared services", "Architecture interaction"];
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
      const label = edge.label ? `<text x="${(startX + endX) / 2}" y="${(startY + endY) / 2 - 10}" font-size="12" fill="#60779c" text-anchor="middle">${escapeSvgText(edge.label)}</text>` : "";
      const dash = diagramStyle === "workflow" ? ' stroke-dasharray="10 6"' : "";
      const markerStart = edge.bidirectional ? ' marker-start="url(#architect-arrow)"' : "";
      return `<g><line x1="${startX}" y1="${startY}" x2="${endX}" y2="${endY}" stroke="#316fd6" stroke-width="3.5" stroke-linecap="round"${dash}${markerStart} marker-end="url(#architect-arrow)" opacity="0.9" />${label}</g>`;
    })
    .join("");

  const nodeBlocks = plan.nodes
    .map((node) => {
      const palette = providerColors[node.provider];
      return `<g>
        <rect x="${node.x}" y="${node.y}" width="${node.width}" height="${node.height}" rx="18" fill="${palette.fill}" stroke="${palette.stroke}" stroke-width="2" />
        <text x="${node.x + 18}" y="${node.y + 32}" font-size="${node.titleFontSize}" font-weight="700" fill="#17315c">${escapeSvgText(node.title)}</text>
        <text x="${node.x + 18}" y="${node.y + 56}" font-size="${node.subtitleFontSize}" fill="#60779c">${escapeSvgText(node.subtitle)}</text>
        <text x="${node.x + 18}" y="${node.y + 74}" font-size="${node.metaFontSize}" fill="${palette.text}">${escapeSvgText(node.provider === "shared" ? "SHARED" : providerLabels[node.provider])}</text>
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
    .map((lane) => `<g>
        <rect x="${lane.x}" y="${lane.y}" width="${lane.width}" height="${lane.height}" rx="24" fill="${lane.fill}" stroke="${lane.stroke}" stroke-opacity="0.9" />
        <text x="${lane.x + 20}" y="${lane.y + 38}" font-size="${lane.fontSize}" font-weight="700" fill="${lane.text}">${escapeSvgText(lane.label)}</text>
      </g>`)
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${canvasWidth} ${CANVAS_HEIGHT}" width="${canvasWidth}" height="${CANVAS_HEIGHT}" role="img" aria-label="Architecture diagram editor">
  <defs>
    <marker id="architect-arrow" markerWidth="12" markerHeight="12" refX="10" refY="6" orient="auto-start-reverse" markerUnits="strokeWidth">
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
