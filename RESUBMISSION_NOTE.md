# OutcomeRelay resubmission note

Apologies — the demo link you had was stale, and the submission did not carry a current one.

**Live app: https://outcome-relay.vercel.app**

It is now listed as an evidence item, and as the first line of the README's *Live deployment* section and step 0 of the reviewer flow in `TESTING.md`, so it cannot go missing again.

Verified before sending: `/`, `/assets/main.js`, `/assets/styles.css` and `/favicon.svg` all return 200, and `POST /api/rpc` returns chain ID `0xf22f` (61999) through the StudioNet proxy declared in `vercel.json`.

Nothing on-chain changed: `contract/OutcomeRelay.py` is unchanged (SHA-256 `358f4821dd72956e77ab3355e4e213a2db0ae9a7cf05b4b83fabde8b99c82e47`) and the deployment at `0x7b0F25B38f590564ebB7a814444cD85067f767CC` is untouched.
