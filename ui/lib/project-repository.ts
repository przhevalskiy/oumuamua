export interface Project {
  id: string;
  name: string;
  slug: string;
  repo_path: string;
  created_at: string;
  github_url?: string;
  github_owner?: string;
  github_repo?: string;
}

export async function listProjects(): Promise<Project[]> {
  const res = await fetch('/api/projects');
  if (!res.ok) throw new Error('Failed to load projects');
  const data = await res.json();
  return data.projects as Project[];
}

export async function createProject(name: string, github_url?: string): Promise<Project> {
  const res = await fetch('/api/projects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, github_url }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? 'Failed to create project');
  }
  const data = await res.json();
  return data.project as Project;
}

export async function updateProject(id: string, patch: Partial<Omit<Project, 'id'>>): Promise<Project> {
  const res = await fetch('/api/projects', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, ...patch }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? 'Failed to update project');
  }
  const data = await res.json();
  return data.project as Project;
}

export async function deleteProject(id: string, taskIds: string[]): Promise<{ terminatedWorkflows: string[] }> {
  const res = await fetch('/api/projects', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, taskIds }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? 'Failed to delete project');
  }
  return res.json();
}

export async function listGithubRepos(token: string, q?: string, page = 1): Promise<GithubRepo[]> {
  const params = new URLSearchParams({ token, page: String(page), per_page: '30' });
  if (q) params.set('q', q);
  const res = await fetch(`/api/github/repos?${params}`);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? 'Failed to list GitHub repos');
  }
  const data = await res.json();
  return data.repos as GithubRepo[];
}

export interface GithubRepo {
  id: number;
  full_name: string;
  name: string;
  owner: string;
  private: boolean;
  description: string | null;
  html_url: string;
  clone_url: string;
  default_branch: string;
  pushed_at: string;
  language: string | null;
}
