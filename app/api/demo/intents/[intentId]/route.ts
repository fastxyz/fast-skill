import { NextResponse } from 'next/server';
import { DemoError, getPaymentIntent } from '../../../../lib/demo/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function errorResponse(err: unknown) {
  if (err instanceof DemoError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  const message = err instanceof Error ? err.message : String(err);
  return NextResponse.json({ error: message }, { status: 500 });
}

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
    return errorResponse(err);
  }
}

