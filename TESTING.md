# OutcomeRelay testing

## Automated gates

Run from the repository root:

```cmd
npm ci
npm run verify
```

Expected result:

- 20 Node tests pass.
- 9 direct Python contract tests pass.
- The production bundle is created in `dist/`.

Verify the live Project deployment from Windows CMD:

```cmd
set CONTRACT_ADDRESS=0x7b0F25B38f590564ebB7a814444cD85067f767CC
npm run verify:deployed
npm run runtime:read
```

Expected evidence:

- `DEPLOYED_PARITY_PASS 358f4821dd72956e77ab3355e4e213a2db0ae9a7cf05b4b83fabde8b99c82e47`
- `name` is `SubstituteDuty`.
- `version` is `1.1`.
- `max_model_calls_per_obligation` is `8`.
- `clock_used` and `global_admin` are `false`.

## Reviewer flow

Use two distinct StudioNet wallets. Do not use a single wallet for both roles.

1. Connect wallet A (obligor).
2. Open **Create duty**.
3. Enter an original duty, a concrete protected outcome and wallet B as obligee.
4. Create the obligation and wait for `Postcondition verified`.
5. Open **Relay desk**, load the new obligation ID and confirm `OUTCOME_PENDING`.
6. As wallet A, try a proposal before acknowledgement. It must roll back and leave all counters unchanged.
7. Switch to an unrelated wallet if available and try acknowledgement. It must roll back.
8. Switch to wallet B and acknowledge. The status must become `OUTCOME_ARMED`; counters and active duty must remain unchanged.
9. Switch to wallet A and submit a substitute that clearly preserves the protected outcome.
10. Confirm the attempt verdict is `SUBSTITUTE_PRESERVES_OUTCOME`, the active duty changes and accepted count advances exactly once.
11. Submit a clearly inadequate substitute.
12. Confirm `SUBSTITUTE_INADEQUATE`, rejected count advances and the accepted active duty remains unchanged.
13. Open **Attempt ledger** and confirm both attempts appear in order with verdict source.
14. Open **Verification** and compare address, class, version and source hash.

## Transaction truth

For each write, the UI treats these as separate facts:

1. A wallet returned a transaction hash.
2. Consensus finalized the transaction.
3. Authoritative leader execution succeeded.
4. Accepted contract state satisfies the expected postcondition.

If execution fails, the UI reads the obligation again and verifies rollback. If execution evidence is unavailable, it shows a delayed/unknown state and tells the user not to resubmit blindly.

## Conservative StudioNet text budget

The contract accepts up to 4,000 characters, but the UI applies a conservative 150-byte UTF-8 soft limit to reduce StudioNet calldata risk. The counter measures bytes rather than JavaScript character units and follows Python-compatible outer whitespace stripping.
