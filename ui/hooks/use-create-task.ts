'use client';

import { useMutation } from '@tanstack/react-query';
import { agentRPCNonStreaming } from 'agentex/lib';
import { useAgentex } from '@/components/providers';

export function useCreateTask() {
  const { agentexClient, agentName } = useAgentex();

  return useMutation({
    mutationFn: async (query: string) => {
      const response = await agentRPCNonStreaming(
        agentexClient,
        { agentName },
        'task/create',
        { params: { query } }
      );

      if (response.error != null) {
        throw new Error(response.error.message);
      }

      return response.result;
    },
  });
}
