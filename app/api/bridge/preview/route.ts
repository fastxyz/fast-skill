import {
  getBridgeProvider,
  listBridgeProviders,
} from '../../../../dist/src/providers/registry.js';
import { parseBridgeParams, toErrorResponse } from '../shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function supportsNetwork(providerNetworks: string[] | undefined, network: string): boolean {
  if (providerNetworks && providerNetworks.length > 0) {
    return providerNetworks.includes(network);
  }
  return network === 'mainnet';
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as unknown;
    const params = parseBridgeParams(body);
    const network = params.network ?? 'testnet';

    const providers = listBridgeProviders();
    const selected = getBridgeProvider(
      params.provider,
      params.from.chain,
      params.to.chain,
      network,
    );

    const selectedSummary = selected
      ? providers.find((entry) => entry.name === selected.name) ?? {
          name: selected.name,
          chains: [...selected.chains],
          networks: (selected as { networks?: string[] }).networks,
        }
      : null;

    const chainPairCompatible = selectedSummary
      ? selectedSummary.chains.includes(params.from.chain)
        && selectedSummary.chains.includes(params.to.chain)
      : false;
    const networkCompatible = selectedSummary
      ? supportsNetwork(selectedSummary.networks, network)
      : false;

    let ready = true;
    let code: string | undefined;
    let message = 'Bridge request is compatible with selected provider and network.';

    if (params.from.chain === params.to.chain) {
      ready = false;
      code = 'INVALID_PARAMS';
      message = 'Source and destination chain must be different.';
    } else if (!selectedSummary) {
      ready = false;
      code = 'UNSUPPORTED_OPERATION';
      message = 'No bridge provider is available for this chain pair.';
    } else if (!chainPairCompatible) {
      ready = false;
      code = 'UNSUPPORTED_OPERATION';
      message = `Bridge provider "${selectedSummary.name}" does not support chain pair ${params.from.chain} -> ${params.to.chain}.`;
    } else if (!networkCompatible) {
      ready = false;
      code = 'UNSUPPORTED_OPERATION';
      message = `Bridge provider "${selectedSummary.name}" does not support network "${network}".`;
    }

    const receiverMode = params.receiver ? 'explicit' : 'inferred';
    const notes = [
      receiverMode === 'explicit'
        ? 'Receiver is explicit and destination wallet setup is not required for receiver inference.'
        : 'Receiver omitted: SDK infers destination wallet if configured, otherwise bridge execution may require receiver or destination setup.',
      selectedSummary
        ? `Selected provider: ${selectedSummary.name}`
        : 'No provider selected for current chain pair.',
    ];

    return Response.json({
      request: params,
      network,
      receiverMode,
      providers,
      selectedProvider: selectedSummary
        ? {
            ...selectedSummary,
            chainPairCompatible,
            networkCompatible,
          }
        : null,
      validation: {
        ready,
        ...(code ? { code } : {}),
        message,
      },
      notes,
    });
  } catch (err: unknown) {
    return toErrorResponse(err);
  }
}
