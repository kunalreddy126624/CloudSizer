const { test, expect } = require("@playwright/test");

const baseUrl = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3001";

test.use({ browserName: "chromium", channel: "msedge" });

async function gotoPath(page, path) {
  await page.goto(`${baseUrl}${path}`, { waitUntil: "domcontentloaded", timeout: 60000 });
}

async function waitForArchitectWorkspace(page) {
  await expect(page.getByText("Agent Architect").first()).toBeVisible({ timeout: 60000 });
  await expect(page.locator(".react-flow__node-diagram").first()).toBeVisible({ timeout: 60000 });
}

async function waitForEstimatorWorkspace(page) {
  await expect(page.getByText("Estimator Workspace").first()).toBeVisible({ timeout: 60000 });
  await expect(page.getByText("Broad service coverage").first()).toBeVisible({ timeout: 60000 });
}

async function selectDiagramStyle(page, label) {
  await page.getByRole("combobox", { name: "Diagram style" }).first().click();
  await page.getByRole("option", { name: label }).click();
}

async function getDiagramSignature(page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll(".react-flow__node-diagram"))
      .map((element) => {
        const rect = element.getBoundingClientRect();
        const text = (element.textContent ?? "").trim().replace(/\s+/g, " ");
        return `${text.slice(0, 60)}::${Math.round(rect.left)},${Math.round(rect.top)}`;
      })
      .sort()
      .join("|")
  );
}

test.describe("architect smoke", () => {
  test.setTimeout(60000);

  test("architect page loads without runtime errors", async ({ page }) => {
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));

    await gotoPath(page, "/architect");
    await waitForArchitectWorkspace(page);
    await expect(page.getByText("Design Platter").first()).toBeVisible();
    await expect(page.getByText("Supported Architecture Patterns").first()).toBeVisible();
    await expect(page.getByText("Supported Real-World Scenarios").first()).toBeVisible();
    await expect(page.getByText("Digital Banking").first()).toBeVisible();

    expect(pageErrors).toEqual([]);
  });

  test("estimator architect button navigates to architect page", async ({ page }) => {
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));

    await gotoPath(page, "/estimator");
    await waitForEstimatorWorkspace(page);
    await page.getByRole("button", { name: /Open Agent Architect/i }).first().click();
    await expect.poll(() => page.url(), { timeout: 60000 }).toContain("/architect");
    await waitForArchitectWorkspace(page);

    expect(pageErrors).toEqual([]);
  });

  test("architect canvas supports multi-select", async ({ page }) => {
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));

    await page.setViewportSize({ width: 1400, height: 2200 });
    await gotoPath(page, "/architect");
    await waitForArchitectWorkspace(page);

    const pane = page.locator(".react-flow__pane").first();
    const box = await pane.boundingBox();

    expect(box).toBeTruthy();

    await page.mouse.move(box.x + 80, box.y + 80);
    await page.mouse.down();
    await page.mouse.move(box.x + 320, box.y + 240, { steps: 15 });
    await page.mouse.up();

    await expect(page.getByText(/2 .* selected\./).first()).toBeVisible();
    expect(pageErrors).toEqual([]);
  });

  test("architect nodes stay inside component zones", async ({ page }) => {
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));

    await gotoPath(page, "/architect");
    await waitForArchitectWorkspace(page);

    const outsideNodes = await page.evaluate(() => {
      const zones = Array.from(document.querySelectorAll(".react-flow__node-zone")).map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          left: rect.left,
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom
        };
      });

      return Array.from(document.querySelectorAll(".react-flow__node-diagram"))
        .map((element) => {
          const rect = element.getBoundingClientRect();
          const enclosed = zones.some(
            (zone) =>
              rect.left >= zone.left &&
              rect.top >= zone.top &&
              rect.right <= zone.right &&
              rect.bottom <= zone.bottom
          );

          return enclosed ? null : element.textContent?.trim() ?? "unknown-node";
        })
        .filter(Boolean);
    });

    expect(outsideNodes).toEqual([]);
    expect(pageErrors).toEqual([]);
  });

  test("architect diagram style switch changes the rendered layout", async ({ page }) => {
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));

    await page.setViewportSize({ width: 1600, height: 2200 });
    await gotoPath(page, "/architect");
    await waitForArchitectWorkspace(page);

    const referenceLegend = page.locator("text=Legend").locator("..");
    await expect(referenceLegend).toContainText("Architecture interaction");
    const referenceSignature = await getDiagramSignature(page);

    await selectDiagramStyle(page, "Network topology");
    await expect(referenceLegend).toContainText("Private path");
    const networkSignature = await getDiagramSignature(page);

    await selectDiagramStyle(page, "Workflow diagram");
    await expect(referenceLegend).toContainText("Async path");
    const workflowSignature = await getDiagramSignature(page);

    expect(referenceSignature).not.toBe(networkSignature);
    expect(networkSignature).not.toBe(workflowSignature);
    expect(referenceSignature).not.toBe(workflowSignature);
    expect(pageErrors).toEqual([]);
  });

  test("selecting multiple cloud targets immediately switches the draft to multi-cloud", async ({ page }) => {
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));

    await page.setViewportSize({ width: 1600, height: 2200 });
    await gotoPath(page, "/architect");
    await waitForArchitectWorkspace(page);

    await page.getByRole("button", { name: "Reset Draft" }).click();
    await expect(page.getByRole("combobox", { name: "Architecture pattern" }).first()).toContainText("Single-Tier");

    await page.getByRole("button", { name: "Azure" }).first().click();

    await expect(page.getByRole("combobox", { name: "Architecture pattern" }).first()).toContainText("Multi-Cloud");
    await expect(page.getByText(/prepared across AWS, Azure\./i).first()).toBeVisible();
    expect(pageErrors).toEqual([]);
  });

  test("keyboard nudges selected nodes and save architecture stores the draft", async ({ page }) => {
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));

    await page.setViewportSize({ width: 1600, height: 2200 });
    await gotoPath(page, "/architect");
    await waitForArchitectWorkspace(page);

    const firstNode = page.locator(".react-flow__node-diagram").first();
    await firstNode.click();
    await expect(firstNode).toHaveClass(/selected/);

    const beforeBox = await firstNode.boundingBox();
    expect(beforeBox).toBeTruthy();

    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(200);

    const afterBox = await firstNode.boundingBox();
    expect(afterBox).toBeTruthy();
    expect(afterBox.x).toBeGreaterThan(beforeBox.x);

    await page.getByRole("button", { name: "Save Architecture" }).first().click();
    await expect(page.getByText(/Saved ".*" on this device\./).first()).toBeVisible();

    expect(pageErrors).toEqual([]);
  });

  test("full-page canvas assistant controls keep working after opening the separate canvas", async ({ page }) => {
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));

    await page.setViewportSize({ width: 1600, height: 2200 });
    await gotoPath(page, "/architect");
    await waitForArchitectWorkspace(page);

    await page.getByRole("button", { name: "Open Separate Canvas" }).click();
    await expect.poll(() => page.url(), { timeout: 60000 }).toContain("/architect/canvas");
    await waitForArchitectWorkspace(page);

    await page.getByRole("combobox", { name: "Architecture pattern" }).click();
    await page.getByRole("option", { name: "Microservices" }).click();
    await expect(page.getByRole("combobox", { name: "Architecture pattern" })).toContainText("Microservices");
    await expect(page.getByText("Microservices").first()).toBeVisible();

    await selectDiagramStyle(page, "Network topology");
    await expect(page.locator('input[value="Rendered as a network diagram."]').first()).toBeVisible();
    await page.waitForTimeout(800);
    await expect(page.getByRole("combobox", { name: "Architecture pattern" })).toContainText("Microservices");

    expect(pageErrors).toEqual([]);
  });
});
