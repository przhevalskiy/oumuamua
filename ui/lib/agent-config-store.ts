import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type AgentModel = 'claude-sonnet-4-6' | 'claude-haiku-4-5' | 'default';

export type AgentConfig = {
  swarmBranchPrefix: string;
  swarmMaxHealCycles: number;
  swarmMaxParallelTracks: number;
  modelArchitect: AgentModel;
  modelBuilder: AgentModel;
  modelInspector: AgentModel;
  modelSecurity: AgentModel;
  modelDevOps: AgentModel;
  showAgentTagsInFeed: boolean;
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
  showAgentTagsInFeed: false,
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
    { name: 'keystone_agent_config' }
  )
);
