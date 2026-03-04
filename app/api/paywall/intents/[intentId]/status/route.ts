import { NextResponse } from 'next/server';
import { paywallErrorResponse } from '../../../../../lib/paywall/api-utils';
import { refreshPaywallIntentStatus } from '../../../../../lib/paywall/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  context: { params: Promise<{ intentId: string }> },
) {
  try {
    const { intentId } = await context.params;
    const intent = await refreshPaywallIntentStatus(intentId);
    return NextResponse.json({
      intent,
      canUnlock: intent.status === 'settled',
    });
  } catch (err: unknown) {
    return paywallErrorResponse(err);
  }
}
