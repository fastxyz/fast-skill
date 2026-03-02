import { NextResponse } from 'next/server';
import { tryGetPaymentLinkProvider } from '../../../../../lib/demo/payment-links/registry';
import { DemoError, handlePaymentLinkWebhook } from '../../../../../lib/demo/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function errorResponse(err: unknown) {
  if (err instanceof DemoError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  const message = err instanceof Error ? err.message : String(err);
  return NextResponse.json({ error: message }, { status: 500 });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ provider: string }> },
) {
  try {
    const { provider } = await context.params;
    const adapter = tryGetPaymentLinkProvider(provider);
    if (!adapter) {
      return NextResponse.json(
        {
          ok: false,
          message: `Unknown payment-link provider "${provider}".`,
        },
        { status: 400 },
      );
    }
    if (!adapter.parseWebhook) {
      return NextResponse.json(
        {
          ok: false,
          message: `Provider "${adapter.id}" does not implement webhook parsing.`,
        },
        { status: 501 },
      );
    }

    const rawText = await request.text().catch(() => '');
    let payload: unknown = rawText;
    if (rawText) {
      try {
        payload = JSON.parse(rawText) as unknown;
      } catch {
        payload = rawText;
      }
    }
    const parsed = await adapter.parseWebhook(payload, Object.fromEntries(request.headers.entries()));
    const applied = await handlePaymentLinkWebhook({
      provider: adapter.id,
      providerReference: parsed.providerReference,
      status: parsed.status,
    });

    return NextResponse.json({
      ok: true,
      provider: adapter.id,
      parsed,
      applied,
    });
  } catch (err: unknown) {
    return errorResponse(err);
  }
}
