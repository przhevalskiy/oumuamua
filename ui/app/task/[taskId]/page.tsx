import { SwarmView } from '@/components/swarm-view';

export default async function TaskPage({
  params,
}: {
  params: Promise<{ taskId: string }>;
}) {
  const { taskId } = await params;
  return <SwarmView taskId={taskId} />;
}
