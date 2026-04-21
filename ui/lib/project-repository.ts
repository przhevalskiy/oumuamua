export interface Project {
  id: string;
  name: string;
  slug: string;
  repo_path: string;
  created_at: string;
}

export async function listProjects(): Promise<Project[]> {
  const res = await fetch('/api/projects');
  if (!res.ok) throw new Error('Failed to load projects');
  const data = await res.json();
  return data.projects as Project[];
}

export async function createProject(name: string): Promise<Project> {
  const res = await fetch('/api/projects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? 'Failed to create project');
  }
  const data = await res.json();
  return data.project as Project;
}
