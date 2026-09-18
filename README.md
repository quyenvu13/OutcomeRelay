# OutcomeRelay

OutcomeRelay is a GenLayer StudioNet application for controlled functional substitution. An obligor records an original duty and a protected outcome. The immutable obligee acknowledges that outcome, then GenLayer validators decide whether each proposed substitute preserves it.

The product changes the active duty only after semantic consensus returns `SUBSTITUTE_PRESERVES_OUTCOME`. Inadequate candidates are rejected and retained in the append-only attempt ledger.

## Live deployment

- Project: `OutcomeRelay`
- Network: GenLayer StudioNet (`61999`)
- Project contract: `0x7b0F25B38f590564ebB7a814444cD85067f767CC`
- Contract class: `SubstituteDuty`
- Version: `1.1`
- Explorer: <https://explorer-studio.genlayer.com/address/0x7b0F25B38f590564ebB7a814444cD85067f767CC>
- Frozen source SHA-256: `358f4821dd72956e77ab3355e4e213a2db0ae9a7cf05b4b83fabde8b99c82e47`

The repository exposes the frozen source as `contract/OutcomeRelay.py` for product clarity. Its bytes and Python class are identical to the deployed `SubstituteDuty` implementation.

## What the interface does

- Reads accepted `get_config()` state on load.
- Creates two-party obligations without hardcoded reviewer wallets.
- Enforces the obligee acknowledgement step in the UI and contract.
- Submits semantic substitute proposals and shows accepted/rejected outcomes.
- Reads the append-only attempt ledger, including `MODEL` versus `CACHE` provenance.
- Separates submission, finalization, execution success and postcondition verification.
- Links every transaction and the deployment to StudioNet Explorer.

The interface never reports a write as successful from `FINALIZED` alone. It inspects authoritative execution evidence, reads accepted contract state and checks method-specific invariants.

## Local development

Requirements: Node.js 20+ and Python 3.11+.

```bash
npm ci
npm run verify
npm run dev
```

Open `http://127.0.0.1:4173`.

## Vercel

Import the repository as a Vercel project. `vercel.json` declares the build command, `dist` output and StudioNet RPC proxy. No environment variable is required for the public deployment.

## Contract boundary

OutcomeRelay classifies whether proposed wording preserves an on-chain protected outcome. It does not execute the duty, verify off-chain performance, establish legal compliance or guarantee real-world facts.

See [TESTING.md](TESTING.md) for the exact reviewer path.
