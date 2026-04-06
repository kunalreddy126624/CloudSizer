import { expect, test } from "@playwright/test";

import {
  architecturePatterns,
  architectureScenarios,
  buildArchitecturePlan,
  buildCanvasLanes,
  buildCanvasZones,
  type CanvasLane,
  type CanvasZone,
  type DiagramNode
} from "../src/lib/architect-diagram";

const dataZoneCategories = new Set(["database", "storage", "analytics", "ai_ml"]);
const neutralCategories = new Set(["integration", "observability"]);

function isNodeInsideZone(node: DiagramNode, zone: CanvasZone) {
  return (
    node.x >= zone.x &&
    node.y >= zone.y &&
    node.x + node.width <= zone.x + zone.width &&
    node.y + node.height <= zone.y + zone.height
  );
}

function isNodeInsideLane(node: DiagramNode, lane: CanvasLane) {
  return (
    node.x >= lane.x &&
    node.y >= lane.y &&
    node.x + node.width <= lane.x + lane.width &&
    node.y + node.height <= lane.y + lane.height
  );
}

test.describe("architect layout matrix", () => {
  test("covers all supported patterns and scenarios", () => {
    expect(architecturePatterns).toHaveLength(10);
    expect(architectureScenarios).toHaveLength(8);
  });

  test("keeps every node inside the expected lane and component zone for all 80 combinations", () => {
    const failures: string[] = [];

    for (const pattern of architecturePatterns) {
      for (const scenario of architectureScenarios) {
        const prompt = `${pattern.prompt} ${scenario.promptSuffix}`.trim();
        const plan = buildArchitecturePlan(
          prompt,
          pattern.defaultProviders,
          null,
          pattern.defaultDiagramStyle,
          pattern.id,
          scenario.id
        );
        const zones = buildCanvasZones(plan, pattern.defaultDiagramStyle);
        const lanes = buildCanvasLanes(plan, pattern.defaultDiagramStyle);
        const zoneById = new Map(zones.map((zone) => [zone.id, zone]));
        const laneById = new Map(lanes.map((lane) => [lane.id, lane]));

        for (const node of plan.nodes) {
          const laneId = node.provider === "shared" ? "lane-shared" : `lane-${node.provider}`;
          const lane = laneById.get(laneId);

          if (!lane) {
            failures.push(`${pattern.id}/${scenario.id}: missing lane ${laneId} for node ${node.title}`);
            continue;
          }

          if (!isNodeInsideLane(node, lane)) {
            failures.push(
              `${pattern.id}/${scenario.id}: node "${node.title}" is outside lane ${laneId}`
            );
          }

          if (node.provider === "shared") {
            const sharedZone = zoneById.get("shared-zone");

            if (!sharedZone) {
              failures.push(`${pattern.id}/${scenario.id}: missing shared-zone for node ${node.title}`);
              continue;
            }

            if (!isNodeInsideZone(node, sharedZone)) {
              failures.push(
                `${pattern.id}/${scenario.id}: shared node "${node.title}" is outside shared-zone`
              );
            }

            continue;
          }

          const appZone = zoneById.get(`${node.provider}-app-zone`);
          const dataZone = zoneById.get(`${node.provider}-data-zone`);

          if (!appZone || !dataZone) {
            failures.push(
              `${pattern.id}/${scenario.id}: missing provider zones for ${node.provider} on node ${node.title}`
            );
            continue;
          }

          const inAppZone = isNodeInsideZone(node, appZone);
          const inDataZone = isNodeInsideZone(node, dataZone);

          if (!inAppZone && !inDataZone) {
            failures.push(
              `${pattern.id}/${scenario.id}: node "${node.title}" is outside both ${node.provider} component zones`
            );
            continue;
          }

          if (inAppZone && inDataZone) {
            failures.push(
              `${pattern.id}/${scenario.id}: node "${node.title}" overlaps both ${node.provider} component zones`
            );
            continue;
          }

          if (dataZoneCategories.has(node.category) && !inDataZone) {
            failures.push(
              `${pattern.id}/${scenario.id}: data node "${node.title}" is not in ${node.provider}-data-zone`
            );
          }

          if (!dataZoneCategories.has(node.category) && !neutralCategories.has(node.category) && !inAppZone) {
            failures.push(
              `${pattern.id}/${scenario.id}: application node "${node.title}" is not in ${node.provider}-app-zone`
            );
          }
        }
      }
    }

    expect(failures).toEqual([]);
  });

  test("promotes multi-provider selections into a multi-cloud architecture plan", () => {
    const plan = buildArchitecturePlan(
      "Design a three-tier commerce platform with regional resilience.",
      ["aws", "azure"],
      null,
      "reference",
      "three_tier",
      "ecommerce"
    );

    expect(plan.pattern).toBe("multi_cloud");
    expect(plan.patternLabel).toBe("Multi-Cloud");
    expect(plan.providers).toEqual(["aws", "azure"]);
    expect(plan.nodes.some((node) => node.provider === "aws")).toBeTruthy();
    expect(plan.nodes.some((node) => node.provider === "azure")).toBeTruthy();
  });

  test("renders distinct node layouts for reference, network, and workflow styles", () => {
    const failures: string[] = [];

    for (const pattern of architecturePatterns) {
      for (const scenario of architectureScenarios) {
        const prompt = `${pattern.prompt} ${scenario.promptSuffix}`.trim();
        const referencePlan = buildArchitecturePlan(
          prompt,
          pattern.defaultProviders,
          null,
          "reference",
          pattern.id,
          scenario.id
        );
        const networkPlan = buildArchitecturePlan(
          prompt,
          pattern.defaultProviders,
          null,
          "network",
          pattern.id,
          scenario.id
        );
        const workflowPlan = buildArchitecturePlan(
          prompt,
          pattern.defaultProviders,
          null,
          "workflow",
          pattern.id,
          scenario.id
        );

        const toSignature = (plan: typeof referencePlan) =>
          plan.nodes
            .map((node) => `${node.title}:${node.x}:${node.y}`)
            .sort()
            .join("|");

        const signatures = new Set([
          toSignature(referencePlan),
          toSignature(networkPlan),
          toSignature(workflowPlan)
        ]);

        if (signatures.size < 3) {
          failures.push(`${pattern.id}/${scenario.id}: style layouts are not visually distinct`);
        }
      }
    }

    expect(failures).toEqual([]);
  });
});
