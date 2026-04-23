import { NextRequest, NextResponse } from 'next/server';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import os from 'os';
import { randomUUID } from 'crypto';

export interface Project {
  id: string;
  name: string;
  slug: string;
  repo_path: string;
  created_at: string;
  // GitHub integration fields
  github_url?: string;       // HTTPS clone URL, e.g. https://github.com/owner/repo
  github_owner?: string;     // owner/org extracted from URL
  github_repo?: string;      // repo name extracted from URL
}

function getBase(): string {
  return process.env.GANTRY_FILES_BASE ?? join(os.homedir(), '.gantry', 'projects');
}

function getRegistryPath(): string {
  return join(getBase(), 'registry.json');
}

function loadRegistry(): Project[] {
  const p = getRegistryPath();
  if (!existsSync(p)) return [];
  try {
    return JSON.parse(readFileSync(p, 'utf-8')) as Project[];
  } catch {
    return [];
  }
}

function saveRegistry(projects: Project[]): void {
  const base = getBase();
  mkdirSync(base, { recursive: true });
  writeFileSync(getRegistryPath(), JSON.stringify(projects, null, 2));
}

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Parse owner and repo name from a GitHub HTTPS URL. */
function parseGithubUrl(url: string): { owner: string; repo: string } | null {
  const m = url.match(/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?(?:\/.*)?$/);
  if (!m) return null;
  return { owner: m[1], repo: m[2] };
}

export async function GET() {
  const projects = loadRegistry();
  return NextResponse.json({ projects });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const name = (body.name ?? '').trim();
  if (!name) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }

  const github_url: string = (body.github_url ?? '').trim();

  const projects = loadRegistry();
  let slug = toSlug(name);

  // ensure slug uniqueness
  const existing = new Set(projects.map(p => p.slug));
  let candidate = slug;
  let n = 2;
  while (existing.has(candidate)) {
    candidate = `${slug}-${n++}`;
  }
  slug = candidate;

  const repo_path = join(getBase(), slug);
  // Only create the directory for local projects — GitHub repos are cloned by the worker
  if (!github_url) {
    mkdirSync(repo_path, { recursive: true });
  }

  const parsed = github_url ? parseGithubUrl(github_url) : null;

  const project: Project = {
    id: randomUUID(),
    name,
    slug,
    repo_path,
    created_at: new Date().toISOString(),
    ...(github_url ? {
      github_url,
      github_owner: parsed?.owner,
      github_repo: parsed?.repo,
    } : {}),
  };

  projects.push(project);
  saveRegistry(projects);

  return NextResponse.json({ project }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  /** Update an existing project (e.g. attach a GitHub URL after creation). */
  const body = await req.json();
  const { id, ...updates } = body;
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

  const projects = loadRegistry();
  const idx = projects.findIndex(p => p.id === id);
  if (idx === -1) return NextResponse.json({ error: 'project not found' }, { status: 404 });

  if (updates.github_url) {
    const parsed = parseGithubUrl(updates.github_url);
    updates.github_owner = parsed?.owner;
    updates.github_repo = parsed?.repo;
  }

  projects[idx] = { ...projects[idx], ...updates };
  saveRegistry(projects);
  return NextResponse.json({ project: projects[idx] });
}

export async function DELETE(req: NextRequest) {
  /**
   * Hard-delete a project:
   * 1. Remove from registry.json
   * 2. Delete repo directory from disk (rm -rf)
   * 3. Terminate all Temporal workflows associated with the project's task IDs
   *    (task IDs are passed from the client via the request body since they live in localStorage)
   * 4. Return the list of terminated workflow IDs so the client can clear localStorage
   */
  const body = await req.json();
  const { id, taskIds = [] } = body as { id: string; taskIds: string[] };
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

  const projects = loadRegistry();
  const project = projects.find(p => p.id === id);
  if (!project) return NextResponse.json({ error: 'project not found' }, { status: 404 });

  const errors: string[] = [];

  // 1. Remove from registry
  saveRegistry(projects.filter(p => p.id !== id));

  // 2. Delete repo directory
  if (project.repo_path) {
    try {
      const { rmSync, existsSync: fsExists } = await import('fs');
      if (fsExists(project.repo_path)) {
        rmSync(project.repo_path, { recursive: true, force: true });
      }
    } catch (e) {
      errors.push(`Failed to delete repo directory: ${e}`);
    }
  }

  // 3. Terminate Temporal workflows for each task ID
  // The workflow ID for a swarm task is the task ID itself (Agentex convention)
  const terminatedWorkflows: string[] = [];
  if (taskIds.length > 0) {
    const temporalAddress = process.env.TEMPORAL_ADDRESS ?? 'localhost:7233';
    const namespace = process.env.TEMPORAL_NAMESPACE ?? 'default';

    for (const taskId of taskIds) {
      try {
        const { execSync } = await import('child_process');
        // Terminate the parent SwarmOrchestrator workflow
        execSync(
          `temporal workflow terminate --workflow-id "${taskId}" --namespace "${namespace}" --reason "project deleted" 2>/dev/null || true`,
          { env: { ...process.env, TEMPORAL_ADDRESS: temporalAddress }, timeout: 5000 }
        );
        terminatedWorkflows.push(taskId);
      } catch {
        // Non-fatal — workflow may already be complete
      }
    }
  }

  return NextResponse.json({
    deleted: id,
    terminatedWorkflows,
    errors: errors.length > 0 ? errors : undefined,
  });
}
