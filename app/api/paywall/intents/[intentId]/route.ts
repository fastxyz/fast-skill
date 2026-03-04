import { NextResponse } from 'next/server';
import { paywallErrorResponse } from '../../../../lib/paywall/api-utils';
import { getPaywallIntent } from '../../../../lib/paywall/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  context: { params: Promise<{ intentId: string }> },
) {
  try {
    const { intentId } = await context.params;
    const intent = await getPaywallIntent(intentId);
    if (!intent) {
      return NextResponse.json(
        { error: 'Intent not found.', code: 'NOT_FOUND' },
        { status: 404 },
      );
    }
    return NextResponse.json({ intent });
  } catch (err: unknown) {
    return paywallErrorResponse(err);
  }
}
