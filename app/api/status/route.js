import { NextResponse } from 'next/server';
import { getStatus } from '../../../lib/fivem.js';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const status = await getStatus();
    return NextResponse.json(status, {
      headers: { 'Cache-Control': 'public, s-maxage=10, stale-while-revalidate=20' },
    });
  } catch (error) {
    console.error('[api status]', error);
    return NextResponse.json({ online: false, players: 0 }, { status: 503 });
  }
}
