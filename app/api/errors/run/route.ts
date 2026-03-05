import { money } from '../../../../dist/src/index.js';
import {
  parseRunScenarioBody,
  serializeError,
  type ScenarioId,
  toErrorResponse,
} from '../shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type ScenarioResult =
  | { ok: true; data: unknown }
  | { ok: false; error: unknown };

type ScenarioDefinition = {
  id: ScenarioId;
  title: string;
  failRequest: unknown;
  recoveryRequest: unknown;
  failSnippet: string;
  recoverySnippet: string;
  runFail: () => Promise<unknown>;
  runRecovery: () => Promise<unknown>;
};

function scenarioCatalog(): Record<ScenarioId, ScenarioDefinition> {
  return {
    chain_not_configured: {
      id: 'chain_not_configured',
      title: 'Missing Chain Setup',
      failRequest: { chain: 'demo-unconfigured', network: 'mainnet' },
      recoveryRequest: { chain: 'base', network: 'mainnet' },
      failSnippet: 'await money.balance({ chain: "demo-unconfigured", network: "mainnet" });',
      recoverySnippet: [
        'await money.setup({ chain: "base", network: "mainnet" });',
        'await money.balance({ chain: "base", network: "mainnet" });',
      ].join('\n'),
      runFail: async () => money.balance({ chain: 'demo-unconfigured', network: 'mainnet' }),
      runRecovery: async () => {
        const setup = await money.setup({ chain: 'base', network: 'mainnet' });
        return {
          setup,
          note: 'Setup completed. Retry your original balance call with a configured chain.',
        };
      },
    },
    invalid_address: {
      id: 'invalid_address',
      title: 'Invalid Address Format',
      failRequest: { chain: 'ethereum', to: 'not-an-address', amount: '1', network: 'mainnet' },
      recoveryRequest: { address: '0x1111111111111111111111111111111111111111' },
      failSnippet: 'await money.send({ chain: "ethereum", to: "not-an-address", amount: "1", network: "mainnet" });',
      recoverySnippet: [
        'const checks = await money.identifyChains({ address: "0x1111111111111111111111111111111111111111" });',
        'console.log(checks.chains);',
      ].join('\n'),
      runFail: async () => money.send({ chain: 'ethereum', to: 'not-an-address', amount: '1', network: 'mainnet' }),
      runRecovery: async () => {
        const identify = await money.identifyChains({ address: '0x1111111111111111111111111111111111111111' });
        return {
          identify,
          note: 'Use identifyChains before send when address format is uncertain.',
        };
      },
    },
    insufficient_balance: {
      id: 'insufficient_balance',
      title: 'Insufficient Balance',
      failRequest: { chain: 'fast', network: 'testnet', amount: '999999999999999999', token: 'FAST' },
      recoveryRequest: { chain: 'fast', network: 'testnet', amount: '1', token: 'FAST' },
      failSnippet: [
        'const wallet = await money.setup({ chain: "fast", network: "testnet" });',
        'await money.send({',
        '  chain: "fast",',
        '  network: "testnet",',
        '  to: wallet.address,',
        '  amount: "999999999999999999"',
        '});',
      ].join('\n'),
      recoverySnippet: [
        'await money.faucet({ chain: "fast", network: "testnet" });',
        'await money.send({ chain: "fast", network: "testnet", to: "<valid set1...>", amount: "1" });',
      ].join('\n'),
      runFail: async () => {
        const setup = await money.setup({ chain: 'fast', network: 'testnet' });
        return money.send({
          chain: 'fast',
          network: 'testnet',
          to: setup.address,
          amount: '999999999999999999',
        });
      },
      runRecovery: async () => {
        const setup = await money.setup({ chain: 'fast', network: 'testnet' });
        return {
          setup,
          note: 'Fund via faucet or reduce amount before retrying send.',
        };
      },
    },
    unsupported_operation: {
      id: 'unsupported_operation',
      title: 'Mainnet-Only Quote Constraint',
      failRequest: { chain: 'base', from: 'ETH', to: 'USDC', amount: '1', network: 'testnet' },
      recoveryRequest: { chain: 'base', from: 'ETH', to: 'USDC', amount: '1', network: 'mainnet' },
      failSnippet: 'await money.quote({ chain: "base", from: "ETH", to: "USDC", amount: "1", network: "testnet" });',
      recoverySnippet: [
        'await money.quote({',
        '  chain: "base",',
        '  from: "ETH",',
        '  to: "USDC",',
        '  amount: "1",',
        '  network: "mainnet"',
        '});',
      ].join('\n'),
      runFail: async () => money.quote({ chain: 'base', from: 'ETH', to: 'USDC', amount: '1', network: 'testnet' }),
      runRecovery: async () => {
        const result = await money.toRawUnits({ amount: '1', decimals: 18 });
        return {
          converted: `${result.toString()}n`,
          note: 'Set network: "mainnet" before quote/swap. Conversion shown as preflight step.',
        };
      },
    },
    invalid_params: {
      id: 'invalid_params',
      title: 'Invalid Params',
      failRequest: { amount: '25' },
      recoveryRequest: { amount: '25', decimals: 6 },
      failSnippet: 'await money.toRawUnits({ amount: "25" });',
      recoverySnippet: 'await money.toRawUnits({ amount: "25", decimals: 6 });',
      runFail: async () => money.toRawUnits({ amount: '25' }),
      runRecovery: async () => {
        const raw = await money.toRawUnits({ amount: '25', decimals: 6 });
        return {
          raw: raw.toString(),
          rawBigintLiteral: `${raw.toString()}n`,
          note: 'Provide decimals explicitly when chain/token lookup is unavailable.',
        };
      },
    },
  };
}

async function execute(fn: () => Promise<unknown>): Promise<ScenarioResult> {
  try {
    const data = await fn();
    return { ok: true, data };
  } catch (err: unknown) {
    return { ok: false, error: err };
  }
}

export async function POST(request: Request) {
  try {
    const parsed = parseRunScenarioBody((await request.json().catch(() => ({}))) as unknown);
    const catalog = scenarioCatalog();
    const scenario = catalog[parsed.scenarioId];

    const mode = parsed.mode;
    const runResult = await execute(mode === 'fail' ? scenario.runFail : scenario.runRecovery);

    if (mode === 'fail') {
      if (runResult.ok) {
        return Response.json({
          scenarioId: scenario.id,
          title: scenario.title,
          mode,
          status: 'unexpected_success',
          request: scenario.failRequest,
          failSnippet: scenario.failSnippet,
          recoverySnippet: scenario.recoverySnippet,
          result: runResult.data,
          ranAt: new Date().toISOString(),
        });
      }
      const serialized = serializeError(runResult.error);
      return Response.json({
        scenarioId: scenario.id,
        title: scenario.title,
        mode,
        status: 'failed',
        request: scenario.failRequest,
        failSnippet: scenario.failSnippet,
        recoveryRequest: scenario.recoveryRequest,
        recoverySnippet: scenario.recoverySnippet,
        error: serialized,
        matchedExpectedCode: serialized.code === expectedCode(scenario.id),
        ranAt: new Date().toISOString(),
      });
    }

    if (runResult.ok) {
      return Response.json({
        scenarioId: scenario.id,
        title: scenario.title,
        mode,
        status: 'recovered',
        request: scenario.recoveryRequest,
        failSnippet: scenario.failSnippet,
        recoverySnippet: scenario.recoverySnippet,
        result: runResult.data,
        ranAt: new Date().toISOString(),
      });
    }

    return Response.json({
      scenarioId: scenario.id,
      title: scenario.title,
      mode,
      status: 'recovery_failed',
      request: scenario.recoveryRequest,
      failSnippet: scenario.failSnippet,
      recoverySnippet: scenario.recoverySnippet,
      error: serializeError(runResult.error),
      ranAt: new Date().toISOString(),
    });
  } catch (err: unknown) {
    return toErrorResponse(err);
  }
}

function expectedCode(scenarioId: ScenarioId): string {
  if (scenarioId === 'chain_not_configured') return 'CHAIN_NOT_CONFIGURED';
  if (scenarioId === 'invalid_address') return 'INVALID_ADDRESS';
  if (scenarioId === 'insufficient_balance') return 'INSUFFICIENT_BALANCE';
  if (scenarioId === 'unsupported_operation') return 'UNSUPPORTED_OPERATION';
  return 'INVALID_PARAMS';
}
