# Top Up Fast Wallet Via Hosted Ramp

Use this flow when the user needs more Fast-side USDC for the next step and may already have a known
`fast1...` address.

## Trigger

Offer this when:

- the next action requires Fast-side USDC or `fastUSDC`
- the current Fast balance is insufficient for that action
- the user can open a browser and complete a hosted payment flow

Do not use this flow if the user asked for a code-level bridge
implementation instead of an interactive top-up path.

## Link Contract

Base URL:

```text
https://ramp.fast.xyz/
```

Parameters:

- `to`: Fast receiver wallet address query parameter
- no amount prefill is currently documented for the hosted root flow

Examples:

```text
https://ramp.fast.xyz/?to=fast1...
```

## Agent Behavior

1. Confirm or derive the user's Fast address.
2. If the Fast address is known, prefer a direct link with `to`.
3. If the Fast address is not known, send the bare hosted ramp link and tell the user they can enter the receiver wallet address on the page.
4. Tell the user to open the hosted ramp link and complete the payment in the browser.
5. Do not claim the agent can complete KYC, card entry, or the purchase itself.
6. After the user says they are done, re-check the Fast balance before proceeding.

## Messaging Guidance

Keep the language simple and operational:

- say the link tops up Fast-side USDC to their `fast1...` wallet
- say `to` fills the receiver wallet address on the hosted page
- if the address is unknown, tell the user they can open the bare link and enter it there
- tell the user to come back after the payment completes

## Example Response

```text
Your Fast-side USDC balance is too low for the next step.

Top up here:
https://ramp.fast.xyz/?to=fast1...

That link prefills your Fast receiver wallet address on the hosted page. Complete the purchase in the browser, then tell me when you're done and I'll re-check your balance before continuing.
```

## Checks

- `to` must be a valid `fast1...` address when included
- the hosted root ramp flow is mainnet-only
- always re-check balance after the user returns
