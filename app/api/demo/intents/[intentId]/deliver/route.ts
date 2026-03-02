import { NextResponse } from 'next/server';
import { demoErrorResponse } from '../../../../../lib/demo/api-utils';
import { deliverIntent } from '../../../../../lib/demo/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(
  _request: Request,
  context: { params: Promise<{ intentId: string }> },
) {
  try {
    const { intentId } = await context.params;
    const intent = await deliverIntent(intentId);
    return NextResponse.json({ intent });
  } catch (err: unknown) {
    return demoErrorResponse(err);
  }
}
