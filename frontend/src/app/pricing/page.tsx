import { Suspense } from "react";

import { PricingWorkspace } from "@/components/pricing/pricing-workspace";

export default function PricingPage() {
  return (
    <Suspense fallback={null}>
      <PricingWorkspace />
    </Suspense>
  );
}
