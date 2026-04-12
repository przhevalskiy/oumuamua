'use client';

import { type ReactNode } from 'react';
import { QueryProvider } from './query-provider';
import { AgentexProvider } from './agentex-provider';

export { useAgentex } from './agentex-provider';

export function Providers({
  children,
  agentexAPIBaseURL,
  agentName,
}: {
  children: ReactNode;
  agentexAPIBaseURL: string;
  agentName: string;
}) {
  return (
    <QueryProvider>
      <AgentexProvider agentexAPIBaseURL={agentexAPIBaseURL} agentName={agentName}>
        {children}
      </AgentexProvider>
    </QueryProvider>
  );
}
