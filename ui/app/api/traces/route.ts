import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const GANTRY_HOME = process.env.GANTRY_HOME ?? path.join(process.env.HOME ?? '/tmp', '.gantry');

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const taskId = searchParams.get('task_id');
  const repoPath = searchParams.get('repo_path');

  if (!taskId) {
    return NextResponse.json({ error: 'task_id required' }, { status: 400 });
  }

  // Resolve traces directory — prefer repo_path if provided, else fall back to GANTRY_HOME
  const tracesDir = repoPath
    ? path.join(repoPath, '.gantry', 'traces')
    : path.join(GANTRY_HOME, 'traces');

  const tracePath = path.join(tracesDir, `${taskId}.jsonl`);

  try {
    if (!fs.existsSync(tracePath)) {
      return NextResponse.json([]);
    }

    const raw = fs.readFileSync(tracePath, 'utf-8');
    const records = raw
      .split('\n')
      .filter(Boolean)
      .map(line => {
        try { return JSON.parse(line); }
        catch { return null; }
      })
      .filter(Boolean);

    return NextResponse.json(records);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
