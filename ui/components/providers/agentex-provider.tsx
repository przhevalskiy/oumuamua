'use client';

import AgentexSDK from 'agentex';
import { createContext, useContext, useMemo, type ReactNode } from 'react';

interface AgentexContextValue {
  agentexClient: AgentexSDK;
  agentName: string;
}

const AgentexContext = createContext<AgentexContextValue | null>(null);

// Build the proxy URL once at module load time (client-only — 'use client' guarantees this).
// Next.js rewrites /api/agentex/* → http://localhost:5003/* server-side, avoiding CORS.
function getProxyBaseURL(): string {
  if (typeof window === 'undefined') {
    // SSR fallback — this path never makes real API calls
    return 'http://localhost:5003';
  }
  return `${window.location.origin}/api/agentex`;
}

const PROXY_BASE_URL = getProxyBaseURL();

export function AgentexProvider({
  children,
  agentName,
}: {
  children: ReactNode;
  agentexAPIBaseURL: string; // kept in signature so layout.tsx compiles unchanged
  agentName: string;
}) {
  const agentexClient = useMemo(
    () =>
      new AgentexSDK({
        baseURL: PROXY_BASE_URL,
        fetchOptions: { credentials: 'include' },
      }),
    []
  );

  return (
    <AgentexContext.Provider value={{ agentexClient, agentName }}>
      {children}
    </AgentexContext.Provider>
  );
}

export function useAgentex() {
  const context = useContext(AgentexContext);
  if (!context) {
    throw new Error('useAgentex must be used within AgentexProvider');
  }
  return context;
}
