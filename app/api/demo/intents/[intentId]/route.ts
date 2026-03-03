import { NextResponse } from 'next/server';
import { demoErrorResponse } from '../../../../lib/demo/api-utils';
import { getPaymentIntent } from '../../../../lib/demo/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  context: { params: Promise<{ intentId: string }> },
) {
  try {
    const { intentId } = await context.params;
    const intent = await getPaymentIntent(intentId);
    if (!intent) {
      return NextResponse.json({ error: 'Intent not found.' }, { status: 404 });
    }
    return NextResponse.json({ intent });
  } catch (err: unknown) {
    return demoErrorResponse(err);
  }
}
