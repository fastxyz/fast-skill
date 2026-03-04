import { NextResponse } from 'next/server';
import { paywallErrorResponse } from '../../../../lib/paywall/api-utils';
import { getPaywallProductBySlug } from '../../../../lib/paywall/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await context.params;
    const product = await getPaywallProductBySlug(slug);
    if (!product) {
      return NextResponse.json(
        { error: 'Product not found.', code: 'NOT_FOUND' },
        { status: 404 },
      );
    }
    return NextResponse.json({ product });
  } catch (err: unknown) {
    return paywallErrorResponse(err);
  }
}
