import { NextRequest, NextResponse } from 'next/server';
import { Connection, Client } from '@temporalio/client';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  // Generic signal proxy.
  // Approval checkpoints:    { workflow_id, approved: boolean }
  // Clarification responses: { workflow_id, signal: 'submit', payload: Record<string, string> }
  const body = await req.json();
  const { workflow_id } = body;

  if (!workflow_id) {
    return NextResponse.json({ error: 'workflow_id is required' }, { status: 400 });
  }

  // Determine signal name + payload
  // Legacy approve shape: { workflow_id, approved }
  // Generic shape:        { workflow_id, signal, payload }
  const signalName: string = body.signal ?? 'approve';
  const signalPayload = body.payload !== undefined ? body.payload : body.approved;

  if (signalPayload === undefined) {
    return NextResponse.json({ error: 'signal payload is required' }, { status: 400 });
  }

  const address = process.env.TEMPORAL_ADDRESS ?? 'localhost:7233';

  let connection: Connection | null = null;
  try {
    connection = await Connection.connect({ address });
    const client = new Client({ connection });
    const handle = client.workflow.getHandle(workflow_id);
    await handle.signal(signalName, signalPayload);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    await connection?.close();
  }
}
