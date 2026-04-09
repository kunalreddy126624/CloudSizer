import type { Metadata } from "next";

import { NoodleSchedulerWorkspace } from "@/components/noodle/noodle-scheduler-workspace";
import { buildPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({
  title: "Soup Scheduler",
  description:
    "Create one orchestration plan that coordinates multiple pipeline jobs as tasks in the Noodle control plane.",
  path: "/noodle/scheduler",
  keywords: ["soup scheduler", "pipeline orchestration plan", "multi pipeline scheduler"],
  index: false
});

export default function NoodleSchedulerPage() {
  return <NoodleSchedulerWorkspace />;
}
