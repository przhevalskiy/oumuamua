import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type ProjectStore = {
  activeProjectId: string | null;
  setActiveProjectId: (id: string | null) => void;
};

export const useProjectStore = create<ProjectStore>()(
  persist(
    (set) => ({
      activeProjectId: null,
      setActiveProjectId: (id) => set({ activeProjectId: id }),
    }),
    { name: 'gantry_active_project' }
  )
);
