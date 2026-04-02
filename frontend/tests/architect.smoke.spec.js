const { test, expect } = require("@playwright/test");

const baseUrl = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3001";

test.use({ browserName: "chromium", channel: "msedge" });

test.describe("architect smoke", () => {
  test("architect page loads without runtime errors", async ({ page }) => {
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));

    await page.goto(`${baseUrl}/architect`);
    await expect(page.getByText("Agent Architect").first()).toBeVisible();
    await expect(page.getByText("Design Platter").first()).toBeVisible();
    await expect(page.getByText("Supported Architecture Patterns").first()).toBeVisible();
    await expect(page.getByText("Supported Real-World Scenarios").first()).toBeVisible();
    await expect(page.getByText("Digital Banking").first()).toBeVisible();

    expect(pageErrors).toEqual([]);
  });

  test("estimator architect button navigates to architect page", async ({ page }) => {
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));

    await page.goto(`${baseUrl}/estimator`);
    await page.getByRole("button", { name: /Open Agent Architect/i }).first().click();
    await page.waitForURL(/\/architect$/);
    await expect(page.getByText("Agent Architect").first()).toBeVisible();

    expect(pageErrors).toEqual([]);
  });

  test("architect canvas supports multi-select", async ({ page }) => {
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));

    await page.setViewportSize({ width: 1400, height: 2200 });
    await page.goto(`${baseUrl}/architect`);

    const pane = page.locator(".react-flow__pane").first();
    const box = await pane.boundingBox();

    expect(box).toBeTruthy();

    await page.mouse.move(box.x + 80, box.y + 80);
    await page.mouse.down();
    await page.mouse.move(box.x + 320, box.y + 240, { steps: 15 });
    await page.mouse.up();

    await expect(page.getByText("2 zones, 2 lanes selected.").first()).toBeVisible();
    expect(pageErrors).toEqual([]);
  });

  test("architect nodes stay inside component zones", async ({ page }) => {
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));

    await page.goto(`${baseUrl}/architect`);

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
});
