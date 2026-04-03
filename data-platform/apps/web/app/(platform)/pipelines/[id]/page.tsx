import { PipelineDesigner } from "@/components/pipeline-designer";

export default function PipelinePage({ params }: { params: { id: string } }) {
  return <PipelineDesigner pipelineId={params.id} />;
}
