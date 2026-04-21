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
}

function getBase(): string {
  return process.env.KEYSTONE_FILES_BASE ?? join(os.homedir(), '.keystone', 'projects');
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
  mkdirSync(repo_path, { recursive: true });

  const project: Project = {
    id: randomUUID(),
    name,
    slug,
    repo_path,
    created_at: new Date().toISOString(),
  };

  projects.push(project);
  saveRegistry(projects);

  return NextResponse.json({ project }, { status: 201 });
}
