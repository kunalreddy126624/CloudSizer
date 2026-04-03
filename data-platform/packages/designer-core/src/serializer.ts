import type { PipelineSpec } from "@data-platform/types";

export function serializePipeline(spec: PipelineSpec) {
  return JSON.stringify(spec, null, 2);
}

export function deserializePipeline(payload: string) {
  return JSON.parse(payload) as PipelineSpec;
}
