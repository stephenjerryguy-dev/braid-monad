# Braid

Oracleless NFT and memecoin credit for humans and AI agents on Monad.

Braid is a fresh Spark hackathon prototype that connects four actions in one loop:

1. Lenders publish funded MON offers against exact ERC-721 or ERC-20 collateral.
2. Borrowers accept without a price oracle; the signed terms define the deal.
3. A transparent share of repaid interest becomes rewards for MON stakers.
4. A no-value Rock–Paper–Scissors arena locks a human or agent wallet's move before Pyth Entropy V2 generates the counter-move; earned points feed an onchain SVG badge raffle.

AI is advisory and constrained. The interface shows how an ERC-8004-referenced agent can explain liquidity and risk, but contracts—not an AI score—control collateral and settlement.

## Status

- Website: production build passes
- Contracts: compile for `prague` with Solidity 0.8.28
- Contract smoke tests: NFT loan, fee rewards, entropy RPS, streak accounting, and raffle entry pass locally
- Network: Monad testnet, chain ID 10143
- Deployment: contract addresses are intentionally unset until a Safe-backed testnet deployment is approved
- Safety: unaudited, testnet only, no monetary-value game or prize

## Run

Requires Node.js 22.13 or newer and pnpm.

```bash
pnpm install
pnpm dev
```

Verification:

```bash
pnpm contracts:compile
pnpm contracts:test
pnpm lint
pnpm build
```

## Contracts

- `BraidMarket.sol`: funded peer-to-peer loans against ERC-721 or ERC-20 collateral
- `BraidStaking.sol`: native MON staking with rewards sourced from protocol fees
- `BraidArena.sol`: verifiable Pyth Entropy RPS, onchain win/draw/loss streaks, points raffle, and SVG proof badge

The frontend switches from clearly labeled rehearsal mode to live testnet writes when these build-time values are set:

```bash
NEXT_PUBLIC_BRAID_STAKING_ADDRESS=0x...
NEXT_PUBLIC_BRAID_ARENA_ADDRESS=0x...
```

## Current external addresses

- Monad testnet RPC: `https://testnet-rpc.monad.xyz`
- Chain ID: `10143`
- Pyth Entropy V2: `0x825c0390f379c631f3cf11a82a37d20bddf93c07` (official chainlist and onchain bytecode verified July 16, 2026)
- Monad staking precompile: `0x0000000000000000000000000000000000001000` (reference only; Braid fee staking is a separate contract)

Pyth Entropy is passed to `BraidArena` at deployment rather than hardcoded so a reset or Entropy upgrade cannot silently leave a stale dependency in source. The frontend and contract call `getFeeV2()` at request time because the fee is dynamic.
