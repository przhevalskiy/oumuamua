'use client';

import { useQuery } from '@tanstack/react-query';
import { useAgentex } from '@/components/providers';

export function useTask(taskId: string | null) {
  const { agentexClient } = useAgentex();

  return useQuery({
    queryKey: ['task', taskId],
    queryFn: () => agentexClient.tasks.retrieve(taskId!, null),
    enabled: !!taskId,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status === 'COMPLETED' || status === 'FAILED' || status === 'CANCELED') {
        return false;
      }
      return 2000;
    },
  });
}
