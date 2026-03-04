import { NextResponse } from 'next/server';
import { z } from 'zod';
import { paywallErrorResponse } from '../../../lib/paywall/api-utils';
import { createPaywallProduct, listPaywallProducts } from '../../../lib/paywall/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CreateProductBody = z.object({
  slug: z.string().min(1).optional(),
  title: z.string().min(1),
  description: z.string().optional(),
  amount: z.union([z.string(), z.number()]),
  chain: z.string().optional(),
  network: z.enum(['testnet', 'mainnet']).optional(),
  tokenAddress: z.string().optional(),
  tokenSymbol: z.string().optional(),
  decimals: z.number().int().positive().optional(),
  assetId: z.string().optional(),
  assetData: z.unknown().optional(),
  assetContentType: z.string().optional(),
});

export async function GET() {
  try {
    const products = await listPaywallProducts();
    return NextResponse.json({ products });
  } catch (err: unknown) {
    return paywallErrorResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    const body = CreateProductBody.parse(await request.json().catch(() => ({})));
    const product = await createPaywallProduct(body);
    return NextResponse.json({ product }, { status: 201 });
  } catch (err: unknown) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request body', details: err.flatten() },
        { status: 400 },
      );
    }
    return paywallErrorResponse(err);
  }
}

