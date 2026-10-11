import { NextResponse } from 'next/server';
import { getCurrentUser } from '../../../../lib/next/auth.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const user = await getCurrentUser();
    return NextResponse.json(
      { user },
      { headers: { 'Cache-Control': 'private, no-store, max-age=0' } },
    );
  } catch (error) {
    console.error('[api auth me]', error);
    return NextResponse.json(
      { error: 'Authentication service is unavailable.' },
      { status: 503, headers: { 'Cache-Control': 'private, no-store, max-age=0' } },
    );
  }
}
