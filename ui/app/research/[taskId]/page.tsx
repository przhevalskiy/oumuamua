import { ResearchView } from '@/components/research-view';

export default async function ResearchPage({
  params,
}: {
  params: Promise<{ taskId: string }>;
}) {
  const { taskId } = await params;
  return <ResearchView taskId={taskId} />;
}
