'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAgentex } from '@/components/providers';

export function useTask(taskId: string | null) {
  const { agentexClient } = useAgentex();

  return useQuery({
    queryKey: ['task', taskId],
    queryFn: () => agentexClient.tasks.retrieve(taskId!, null),
    enabled: !!taskId,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status === 'COMPLETED' || status === 'FAILED' || status === 'CANCELED' || status === 'TERMINATED' || status === 'TIMED_OUT' || status === 'DELETED') {
        return false; // stop polling once terminal
      }
      return 2000;
    },
  });
}

/**
 * Returns a function that immediately marks a task as TERMINATED in the
 * React Query cache, then triggers a background refetch after a delay
 * to confirm the real server state.
 */
export function useOptimisticTerminate(taskId: string | null) {
  const queryClient = useQueryClient();

  return () => {
    if (!taskId) return;
    // Cancel any in-flight refetch so it can't overwrite the optimistic state
    queryClient.cancelQueries({ queryKey: ['task', taskId] });
    // Optimistically set status to TERMINATED in the cache immediately
    queryClient.setQueryData(['task', taskId], (old: unknown) => {
      if (!old || typeof old !== 'object') return old;
      return { ...(old as object), status: 'TERMINATED' };
    });
    // Refetch after 3s — enough time for the Agentex API to reflect Temporal's state.
    // Do NOT invalidate immediately or the refetch will return RUNNING and overwrite
    // the optimistic state before the API has caught up.
    setTimeout(() => {
      queryClient.invalidateQueries({ queryKey: ['task', taskId] });
    }, 3000);
  };
}
