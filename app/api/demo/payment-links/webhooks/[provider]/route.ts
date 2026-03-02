import { NextResponse } from 'next/server';
import { demoErrorResponse } from '../../../../../lib/demo/api-utils';
import { tryGetPaymentLinkProvider } from '../../../../../lib/demo/payment-links/registry';
import { handlePaymentLinkWebhook } from '../../../../../lib/demo/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Demo security limitations:
// - This endpoint does not verify provider signatures.
// - Payload schema is trusted and provider refs are accepted as-is.
// - Only enable when explicitly testing mocked webhook flows in non-production setups.
const DEMO_ENABLE_MOCK_WEBHOOKS = (process.env.DEMO_ENABLE_MOCK_WEBHOOKS ?? '').trim() === '1';

export async function POST(
  request: Request,
  context: { params: Promise<{ provider: string }> },
) {
  try {
    if (!DEMO_ENABLE_MOCK_WEBHOOKS) {
      return NextResponse.json(
        {
          ok: false,
          message: 'Mock webhook endpoint disabled. Set DEMO_ENABLE_MOCK_WEBHOOKS=1 to enable for local demo testing.',
        },
        { status: 403 },
      );
    }

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
    return demoErrorResponse(err);
  }
}
