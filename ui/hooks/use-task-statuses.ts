'use client';

import { useQuery } from '@tanstack/react-query';
import { useAgentex } from '@/components/providers';

export type LiveTaskStatus = {
  taskId: string;
  status: string; // RUNNING | COMPLETED | FAILED | CANCELED | TERMINATED | TIMED_OUT
  isAwaitingFollowUp: boolean; // RUNNING but Foreman is in the 24h wait loop
};

/**
 * Fetches live status for a list of task IDs from Agentex.
 * Polls every 5s while any task is RUNNING.
 * Used by the projects page to show real workflow state.
 */
export function useTaskStatuses(taskIds: string[]) {
  const { agentexClient } = useAgentex();

  return useQuery({
    queryKey: ['task-statuses', taskIds.join(',')],
    queryFn: async (): Promise<LiveTaskStatus[]> => {
      if (taskIds.length === 0) return [];

      const results = await Promise.allSettled(
        taskIds.map(id => agentexClient.tasks.retrieve(id, null))
      );

      return results.map((result, i) => {
        if (result.status === 'rejected') {
          return { taskId: taskIds[i], status: 'UNKNOWN', isAwaitingFollowUp: false };
        }
        const task = result.value;
        const status = task?.status ?? 'UNKNOWN';

        // Detect "awaiting follow-up" — task is RUNNING but the last message
        // from the Foreman says it's waiting for the next instruction.
        // We can't read messages here cheaply, so we use a heuristic:
        // a RUNNING task whose workflow has been alive > 2 minutes is likely
        // in the follow-up wait loop rather than actively building.
        // The swarm-view component sets a more precise flag via message parsing.
        const isAwaitingFollowUp = false; // refined in projects page via message store

        return { taskId: taskIds[i], status, isAwaitingFollowUp };
      });
    },
    enabled: taskIds.length > 0,
    refetchInterval: (query) => {
      const data = query.state.data ?? [];
      const anyRunning = data.some(t => t.status === 'RUNNING');
      return anyRunning ? 5000 : 30000; // fast poll while building, slow poll otherwise
    },
    staleTime: 3000,
  });
}
