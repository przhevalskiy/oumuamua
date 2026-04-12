'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { subscribeTaskState } from 'agentex/lib';
import { useAgentex } from '@/components/providers';
import type { TaskMessage } from 'agentex/resources';

export function taskMessagesKey(taskId: string) {
  return ['task-messages', taskId];
}

function hasFinalAnswer(messages: TaskMessage[]): boolean {
  for (let i = messages.length - 1; i >= 0; i--) {
    const c = messages[i].content as unknown as { type?: string; content?: unknown };
    if (typeof c?.content === 'string') {
      if (c.content.includes('## Summary') || c.content.includes('## Key Findings')) {
        return true;
      }
    }
  }
  return false;
}

export function useTaskMessages(taskId: string | null) {
  const { agentexClient } = useAgentex();
  const queryClient = useQueryClient();
  const abortRef = useRef<AbortController | null>(null);

  const query = useQuery({
    queryKey: taskMessagesKey(taskId ?? ''),
    queryFn: async () => {
      const msgs = await agentexClient.messages.list(
        { task_id: taskId!, limit: 200 },
      );
      return msgs.slice().reverse() as TaskMessage[];
    },
    enabled: !!taskId,
    // Poll every 3s as a fallback until the final answer arrives.
    // The subscription handles real-time updates; polling catches cases where
    // the SSE stream misses the final message (SDK 50-msg limit race).
    refetchInterval: (query) => {
      const messages = query.state.data;
      if (!messages || messages.length === 0) return 3000;
      return hasFinalAnswer(messages) ? false : 3000;
    },
  });

  // Real-time subscription for live updates while running
  useEffect(() => {
    if (!taskId) return;

    abortRef.current = new AbortController();
    const { signal } = abortRef.current;

    subscribeTaskState(
      agentexClient,
      { taskID: taskId },
      {
        onMessagesChange(messages) {
          queryClient.setQueryData<TaskMessage[]>(
            taskMessagesKey(taskId),
            [...messages]
          );
        },
        onTaskChange(task) {
          queryClient.setQueryData(['task', taskId], task);
        },
        onAgentsChange() {},
        onStreamStatusChange() {},
        onError() {},
      },
      { signal }
    );

    return () => {
      abortRef.current?.abort();
    };
  }, [taskId, agentexClient, queryClient]);

  return query;
}
