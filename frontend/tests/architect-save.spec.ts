import { expect, test } from "@playwright/test";

import type { SavedArchitectureDraft } from "../src/lib/scenario-store";
import { mergeSavedArchitectureDrafts } from "../src/lib/scenario-store";

function buildDraft(overrides: Partial<SavedArchitectureDraft> = {}): SavedArchitectureDraft {
  return {
    id: overrides.id ?? "architecture-1",
    name: overrides.name ?? "Primary Architecture",
    prompt: overrides.prompt ?? "Design an event-driven analytics platform.",
    selected_providers: overrides.selected_providers ?? ["aws"],
    diagram_style: overrides.diagram_style ?? "reference",
    request_context: overrides.request_context ?? null,
    plan: overrides.plan ?? { title: overrides.name ?? "Primary Architecture" },
    zone_overrides: overrides.zone_overrides ?? {},
    lane_overrides: overrides.lane_overrides ?? {},
    saved_at: overrides.saved_at ?? "2026-04-03T10:00:00.000Z"
  };
}

test.describe("architect save draft merge", () => {
  test("updates an existing saved architecture instead of duplicating it", () => {
    const original = buildDraft();
    const updated = buildDraft({
      id: original.id,
      name: "Primary Architecture v2",
      saved_at: "2026-04-03T11:00:00.000Z"
    });

    const next = mergeSavedArchitectureDrafts([original], updated);

    expect(next).toHaveLength(1);
    expect(next[0].id).toBe(original.id);
    expect(next[0].name).toBe("Primary Architecture v2");
    expect(next[0].saved_at).toBe("2026-04-03T11:00:00.000Z");
  });

  test("moves the latest saved architecture to the front of the list", () => {
    const first = buildDraft({ id: "architecture-1", name: "First" });
    const second = buildDraft({ id: "architecture-2", name: "Second" });
    const updatedFirst = buildDraft({ id: "architecture-1", name: "First Updated" });

    const next = mergeSavedArchitectureDrafts([first, second], updatedFirst);

    expect(next.map((draft) => draft.id)).toEqual(["architecture-1", "architecture-2"]);
    expect(next[0].name).toBe("First Updated");
  });
});
