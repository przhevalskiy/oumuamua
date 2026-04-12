import { SharedReportView } from '@/components/shared-report-view';

export default async function SharedReportPage({
  params,
}: {
  params: Promise<{ taskId: string }>;
}) {
  const { taskId } = await params;
  return <SharedReportView taskId={taskId} />;
}
