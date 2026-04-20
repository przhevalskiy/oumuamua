import { NextRequest, NextResponse } from 'next/server';
import { readFileSync } from 'fs';

export async function GET(req: NextRequest) {
  const path = req.nextUrl.searchParams.get('path');
  if (!path) return NextResponse.json({ error: 'missing path' }, { status: 400 });
  try {
    const content = readFileSync(path, 'utf-8');
    return NextResponse.json({ content });
  } catch {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
}
