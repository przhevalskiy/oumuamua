import { NextRequest, NextResponse } from 'next/server';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const { taskId } = await params;
  const agentexBase = process.env.NEXT_PUBLIC_AGENTEX_API_BASE_URL ?? 'http://localhost:5003';

  try {
    // Call the Agentex API's own terminate endpoint — this updates the task status
    // in Agentex's database AND terminates the Temporal workflow in one call.
    // Going directly to Temporal bypasses the Agentex DB, causing status to stay RUNNING.
    const res = await fetch(`${agentexBase}/tasks/${taskId}/terminate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: 'stopped by user' }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const message = (body as { detail?: string; message?: string }).detail
        ?? (body as { detail?: string; message?: string }).message
        ?? `HTTP ${res.status}`;
      return NextResponse.json({ error: message }, { status: res.status });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
