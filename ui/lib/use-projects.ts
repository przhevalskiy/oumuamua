'use client';

import { useState, useEffect, useCallback } from 'react';
import { listProjects, createProject, type Project } from './project-repository';
import { useProjectStore } from './project-store';

export type { Project };

export function useProjects() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const list = await listProjects();
      setProjects(list);
    } catch {
      // swallow — empty list shown
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return { projects, loading, refresh };
}

export function useActiveProject() {
  const { activeProjectId, setActiveProjectId } = useProjectStore();
  const { projects, loading, refresh } = useProjects();

  const activeProject = projects.find(p => p.id === activeProjectId) ?? null;

  const selectProject = useCallback((id: string) => {
    setActiveProjectId(id);
  }, [setActiveProjectId]);

  const addProject = useCallback(async (name: string): Promise<Project> => {
    const project = await createProject(name);
    await refresh();
    setActiveProjectId(project.id);
    return project;
  }, [refresh, setActiveProjectId]);

  return { activeProject, projects, loading, selectProject, addProject };
}
