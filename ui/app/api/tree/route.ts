import { NextRequest, NextResponse } from 'next/server';
import { readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

const SKIP = new Set(['.git', 'node_modules', '.next', 'dist', 'build', '__pycache__', '.venv', 'coverage']);

function walk(dir: string, root: string, depth = 0): string[] {
  if (depth > 8) return [];
  const out: string[] = [];
  try {
    for (const name of readdirSync(dir).sort()) {
      if (SKIP.has(name) || name.startsWith('.')) continue;
      const full = join(dir, name);
      try {
        const stat = statSync(full);
        if (stat.isDirectory()) out.push(...walk(full, root, depth + 1));
        else out.push(relative(root, full));
      } catch { /* skip unreadable */ }
    }
  } catch { /* dir unreadable */ }
  return out;
}

export async function GET(req: NextRequest) {
  const root = req.nextUrl.searchParams.get('root');
  if (!root) return NextResponse.json({ error: 'missing root' }, { status: 400 });
  return NextResponse.json({ files: walk(root, root) });
}
