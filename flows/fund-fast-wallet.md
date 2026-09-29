# Add fastUSD Through Supported Hosted Routes

Use this flow when the user needs more native **fastUSD** on Fast and may
already have a known `fast1...` address.

## Trigger

Offer this when:

- the next action requires fastUSD on Fast and the current balance is insufficient
- the user can open a browser and complete a hosted funding flow

Do not use this flow for an EVM-to-Fast bridge implementation or when the user
specifically wants to fund from an EVM wallet they control; use the bridge flow
for that case.

## Supported Routes

These are the only supported hosted funding URLs:

| Method        | URL                                                               |
| ------------- | ----------------------------------------------------------------- |
| Card          | `https://app.fast.xyz/card?to=<fast-address>`                     |
| External USDC | `https://app.fast.xyz/usdc?to=<fast-address>`                     |
| Coinbase      | `https://app.fast.xyz/crypto?supplier=coinbase&to=<fast-address>` |
| Swapper       | `https://app.fast.xyz/crypto?supplier=swapper&to=<fast-address>`  |

All four routes credit **fastUSD** on Fast. USDC is an external source asset;
there is no separate native USDC balance on Fast.

## Agent Behavior

1. Confirm or derive the user's Fast address.
2. Ask which supported route they prefer if it is not clear from the request.
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

These routes credit fastUSD on Fast. Complete the flow in your browser, then
tell me when you're done so I can re-check your balance.
```

## Checks

- `to` must be the intended valid `fast1...` receiver address
- hosted app links are mainnet-only
- use only the four listed routes; do not substitute an unverified provider URL
- always re-check balance after the user returns
