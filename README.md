# Spigot

Metered stablecoin tap for AI agents — a 402-paid API gateway backed by the Tempo chain and Dynamic MPC wallets.

## Two concerns in this repo

### UI — `src/ui/`

The landing page is `src/ui/index.html`. It is a standalone HTML file with its own embedded styles and a hero canvas driven by `src/ui/main.js` (Three.js).

Open `src/ui/index.html` directly in a browser, or serve it with any static server. The Three.js scene uses no external texture files — it falls back to procedural materials.

### CLI — `src/tempo/`

A five-step walkthrough of the Dynamic server wallet → Tempo (MPP) integration:

1. build + authenticate a `DynamicEvmWalletClient`
2. create (or reuse) a `TWO_OF_TWO` MPC wallet backed up to Dynamic's client share service
3. fund it from the Tempo Moderato faucet
4. wrap the MPC signer in a Tempo-compatible viem `LocalAccount`
5. pay for a `402`-protected endpoint with MPP and print the receipt

See `src/tempo/run.js` for usage and flags.

## Setup

```sh
cp .env.example .env
# fill in DYNAMIC_ENVIRONMENT_ID, DYNAMIC_API_TOKEN, DYNAMIC_WALLET_PASSWORD in .env
npm install
```

Steps 1, 2 and the MPC signing calls need Linux or macOS (the Dynamic SDK ships Neon binaries for those platforms). On Windows, use `--dry-run` to sign with a local key instead:

```sh
npm run self-test     # offline validation of the Tempo signer adapter
npm run run:dry       # steps 3-5 with a local signer
```

## Scripts

| command | what it does |
|---|---|
| `npm run self-test` | offline self-test of the Dynamic → Tempo signer adapter (no credentials needed) |
| `npm run run` | full five-step walkthrough (Linux/macOS only) |
| `npm run run:dry` | steps 3–5 only, signing with a local private key (any platform) |

## Configuration

All values come from `.env` (see `.env.example`) or from the process environment. CLI flags override `.env` — run `node src/tempo/run.js --help` for the flags.

## License

No license yet — treat this as private until one is added.
