# Spigot

A 402-paid API gateway. Agents pay per call in TIP-20 stablecoins on Tempo Moderato, and a receipt is the only credential — no API keys, no sessions.

The app lives in [`spigot-docs/`](spigot-docs). This file is the short version; the real documentation is served at `/docs` by the running app.

## What it does

```
GET /api/weather      → 402 { price: 0.005, howToPay }
POST /api/pay         → 200 { receipt }          signs + broadcasts a real transfer
GET /api/weather      → 200 { data }             Payment-Receipt header, verified on chain
GET /api/weather      → 402                      same receipt again: replay
```

Payment is settled by the server with a wallet it holds. The client never signs anything.

## Quick start

```sh
cd spigot-docs
npm install
cp .env.example .env.local    # fill in Clerk keys, and one Tempo signer
npm run dev                    # http://localhost:3000
```

Minimum working config:

```dotenv
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_...
CLERK_SECRET_KEY=sk_...

TEMPO_SIGNER=privateKey
TEMPO_PRIVATE_KEY=0x...
TEMPO_MERCHANT_ADDRESS=0xYourAddress     # defaults to a burn address
```

Without the Tempo keys the docs, the landing page and every free route still work. Without Clerk the app builds but every page renders a provider with no publishable key.

Fund the wallet:

```sh
curl -X POST https://rpc.moderato.tempo.xyz \
  -H "content-type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tempo_fundAddress","params":["0xYourAddress"]}'
```

## Scripts

Run from `spigot-docs/`:

| command | what it does |
|---|---|
| `npm run dev` | Next.js dev server |
| `npm run build` / `npm run start` | production build and serve |
| `npm run types:check` | `tsc --noEmit` |
| `npm run lint` | ESLint — currently broken, see Known issues |
| `npm run self-test` | offline signing/serialization assertions, no credentials |
| `npm run cli:dry` | CLI walkthrough signing with a local key |
| `npm run cli` | CLI walkthrough using Dynamic MPC |

## Layout

```
spigot-docs/
  app/            Next.js App Router — pages and API route handlers
  components/     hero scene (Three.js), nav, search, markdown
  lib/            pricing, store, llm, agent-graph
    tempo/        chain, signer, dynamic-signer, payment
  content/docs/   the documentation (MDX)
  cli/tempo/      standalone ESM walkthrough of the Dynamic + Tempo integration
  proxy.ts        Clerk middleware and docs content negotiation
```

## Known issues

- **`npm run lint` fails** — `typescript: ^7.0.2` is not supported by `eslint-config-next` 16.3.5. Either drop TypeScript to 6.x or upgrade the config.
- **`/api/agent/status` balance is nonsense** — `toNumber()` assumes 18 decimals for the native coin. Token balances, which is what payments use, are correct.
- **`LLM_GATEWAY_API_KEY` ships empty** — the agent routes need a key before they run.
- **Single instance only** — replay protection, `lib/store.ts` and the LangGraph checkpointer are all process-local.
- **No rate limiting** — nothing caps request volume, and `POST /api/pay` is unmetered.
- **No database** — transactions, revenue and agent memory reset on restart.

## Docs

- [API reference](spigot-docs/content/docs/api.mdx)
- [Payments](spigot-docs/content/docs/payments.mdx) — receipt format and the verification chain
- [Architecture](spigot-docs/content/docs/architecture.mdx)
- [Setup](spigot-docs/content/docs/setup.mdx)
