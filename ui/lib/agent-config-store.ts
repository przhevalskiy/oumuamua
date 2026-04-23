import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type AgentModel = 'claude-sonnet-4-6' | 'claude-haiku-4-5' | 'mistral-large-latest' | 'mistral-small-latest' | 'default';

export type AgentConfig = {
  swarmBranchPrefix: string;
  swarmMaxHealCycles: number;
  swarmMaxParallelTracks: number;
  // Model overrides — note: backend auto-routes by tier (Haiku for tier 0/1, Sonnet for tier 2+).
  // These are only used when tierOverride is set to an explicit tier value.
  modelArchitect: AgentModel;
  modelBuilder: AgentModel;
  modelInspector: AgentModel;
  modelSecurity: AgentModel;
  modelDevOps: AgentModel;
  // -1 = auto-classify (default). 0-3 = force a specific tier.
  tierOverride: number;
  showAgentTagsInFeed: boolean;
  // GitHub PAT — stored in localStorage, sent to the backend as a task param.
  // Never sent to third parties. Used only for clone + push operations.
  githubToken: string;
};

export const DEFAULT_CONFIG: AgentConfig = {
  swarmBranchPrefix: 'swarm',
  swarmMaxHealCycles: 3,
  swarmMaxParallelTracks: 4,
  modelArchitect: 'default',
  modelBuilder: 'default',
  modelInspector: 'default',
  modelSecurity: 'default',
  modelDevOps: 'default',
  tierOverride: -1,
  showAgentTagsInFeed: false,
  githubToken: '',
};

type AgentConfigStore = {
  config: AgentConfig;
  setConfig: (patch: Partial<AgentConfig>) => void;
  resetConfig: () => void;
  isDirty: () => boolean;
};

export const useAgentConfigStore = create<AgentConfigStore>()(
  persist(
    (set, get) => ({
      config: DEFAULT_CONFIG,
      setConfig: (patch) => set(s => ({ config: { ...s.config, ...patch } })),
      resetConfig: () => set({ config: DEFAULT_CONFIG }),
      isDirty: () => {
        const c = get().config;
        return (Object.keys(DEFAULT_CONFIG) as (keyof AgentConfig)[]).some(
          k => c[k] !== DEFAULT_CONFIG[k]
        );
      },
    }),
    { name: 'gantry_agent_config' }
  )
);
