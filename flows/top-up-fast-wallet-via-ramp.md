# Add fastUSD Through Supported Hosted Routes

This historical flow path is retained for existing links. The hosted routes
below replace the retired ramp endpoint.

Use this flow when code (an app, a service, or a wallet it manages with the SDK)
needs to send someone to add native **fastUSD** to a known `fast1...` address on
Fast **mainnet**. A person topping up their own `fast` CLI wallet should use the
`fast` CLI skill instead; its `fast fund …` commands print these same links.

## Trigger

Offer this when:

- the wallet network is confirmed as Fast mainnet
- the next action requires fastUSD on Fast and the current balance is insufficient
- the user can open a browser and complete a hosted funding flow

The hosted `/usdc` route is suitable when the user wants the Fast app to guide
funding with USDC from another network, including from an EVM wallet they
control. Before any USDC transfer, confirm the source EVM network and token
are supported by the route shown in the app; do not infer that every EVM
network or USDC contract is accepted. If they instead want the agent to
construct and submit an EVM-to-Fast bridge transaction directly, use the
bridge flow.

## Supported Routes

These are the only supported hosted funding URLs:

| Method        | URL                                                               |
| ------------- | ----------------------------------------------------------------- |
| Card          | `https://app.fast.xyz/card?to=<fast-address>`                     |
| External USDC | `https://app.fast.xyz/usdc?to=<fast-address>`                     |
| Coinbase      | `https://app.fast.xyz/crypto?supplier=coinbase&to=<fast-address>` |
| Swapper       | `https://app.fast.xyz/crypto?supplier=swapper&to=<fast-address>`  |

All four routes are intended to credit **fastUSD** on Fast. USDC is an external
source asset; there is no separate native USDC balance on Fast. Depending on
the route, funds may first be in an EVM account or await a bridge/settlement
step. Opening a link or completing an initial payment does not prove the Fast
wallet has been credited; confirm its Fast balance before continuing.

## CLI Commands

`@fastxyz/cli` 1.5.0 and later print these links (the `fast` CLI skill covers
the rest of a person's wallet). The CLI prints the URL; it does not complete a
purchase.

```sh
fast fund --network mainnet
fast fund card --network mainnet
fast fund usdc --network mainnet
fast fund crypto --supplier coinbase --network mainnet
fast fund crypto --supplier swapper --network mainnet
```

`fast fund` opens the interactive method selector. For `--json` or
`--non-interactive`, use one of the four explicit route commands. The address
defaults to the active account; `--address` overrides it. Card and crypto
routes also accept `--amount` as an optional prefill. The separate
`fast fund usdc crypto <amount> --chain <chain>` command performs an EVM-to-Fast
bridge rather than printing a hosted purchase link.

## Agent Behavior

1. Confirm that the wallet is on Fast mainnet, then confirm or derive its Fast
   address. For testnet, use a separately verified testnet funding method.
2. Ask which supported route they prefer if it is not clear from the request.
   For external USDC, have the user confirm the source chain and token against
   the app's supported options before sending anything.
3. Use the exact route above and URL-encode the `to` address.
4. Tell the user to open the link and complete the hosted flow themselves. Do
   not imply the agent can complete card entry, KYC, or purchase steps.
5. After the user says they are done, re-check the Fast balance before proceeding.

## Example Response

```text
Your Fast wallet needs more fastUSD for the next step. Choose a supported
funding method:

Card: https://app.fast.xyz/card?to=fast1...
USDC from another network: https://app.fast.xyz/usdc?to=fast1...
Coinbase: https://app.fast.xyz/crypto?supplier=coinbase&to=fast1...
Swapper: https://app.fast.xyz/crypto?supplier=swapper&to=fast1...

These routes are intended to credit fastUSD on Fast. Funds may still be on an
EVM network or awaiting bridge/settlement after an intermediate step. Complete
the flow in your browser, then tell me when you're done so I can confirm the
Fast balance before continuing.
```

## Checks

- `to` must be the intended valid `fast1...` receiver address
- confirm Fast mainnet before offering a hosted app link or CLI route
- for external USDC, confirm the source EVM network and token are supported by
  the route before sending funds; do not assume an arbitrary chain is accepted
- use only the four listed routes; do not substitute an unverified provider URL
- always re-check balance after the user returns
