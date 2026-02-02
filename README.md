# Alerith Duel Arena

**Privacy-Preserving PvP Dueling with Crypto Stakes on Solana**

Built for the Solana Privacy Hack 2026 | Shadowwire SDK Integration

---

## What We Built

A fully-functional **PvP duel arena** where players can wager SOL on 1v1 combat with complete privacy. Using Shadowwire's ZK proofs and shielded pools, neither wallets nor amounts are ever exposed on-chain.

### The Problem

Traditional on-chain gaming exposes everything:
- Wallet addresses visible to all
- Stake amounts publicly trackable
- Win/loss history creates target profiles
- Competitors can analyze your bankroll

### Our Solution

**Private stakes + Provable fairness** using:
- ZK range proofs to hide stake amounts
- Shielded pool transfers for unlinkable payments
- Stealth IDs (hashed wallets) for player anonymity
- On-chain commitment hashes for accountability

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                           SYSTEM OVERVIEW                           │
└─────────────────────────────────────────────────────────────────────┘

  ┌────────────────────────────────────────────────────────────────┐
  │                     UNITY GAME CLIENT                          │
  │  ┌────────────┐  ┌────────────┐  ┌────────────────────────┐   │
  │  │  Duel UI   │  │  Combat    │  │  Shadowwire Bridge     │   │
  │  │  System    │  │  System    │  │  (Phantom + ZK Proofs) │   │
  │  └────────────┘  └────────────┘  └───────────┬────────────┘   │
  └──────────────────────────┬───────────────────┼────────────────┘
                             │                   │
                      Mirror │              HTTP │ WebGL JS
                   Networking│                   │
  ┌──────────────────────────▼───────────────────▼────────────────┐
  │                     SIDECAR (Node.js)                         │
  │  ┌────────────┐  ┌────────────┐  ┌────────────────────────┐   │
  │  │   Duel     │  │   Stake    │  │     Settlement         │   │
  │  │  Manager   │  │   Escrow   │  │  + Commitment System   │   │
  │  └────────────┘  └────────────┘  └───────────┬────────────┘   │
  └──────────────────────────────────────────────┼────────────────┘
                                                 │
                    ┌────────────────────────────┼────────────────┐
                    │                            │                │
                    ▼                            ▼                │
  ┌─────────────────────────────┐  ┌─────────────────────────────┐│
  │   SHADOWWIRE SHIELDED POOL  │  │     SOLANA MEMO PROGRAM     ││
  │   (Private ZK Transfers)    │  │   (Commitment Anchoring)    ││
  └─────────────────────────────┘  └─────────────────────────────┘│
                    │                            │                │
                    └────────────────────────────┴────────────────┘
                                  SOLANA
```

---

## Repository Structure

```
Solana Hackathon/
├── README.md           # This file
│
├── Unity/              # Game client (Unity/C# - WebGL)
│   ├── README.md       # Client overview
│   ├── protocol/       # Network message definitions
│   ├── crypto/         # Shadowwire SDK integration
│   ├── client/         # Client state management
│   └── docs/           # Architecture documentation
│
└── sidecar/            # Backend service (Node.js/TypeScript)
    ├── README.md       # Sidecar overview
    ├── src/            # Source code
    ├── scripts/        # Setup & test scripts
    └── public/         # Browser SDK bundle
```

---

## Key Features

| Feature | Implementation |
|---------|----------------|
| **Phantom Wallet** | WebGL JS interop for seamless connection |
| **ZK Stake Locking** | ShadowPay proof generation + escrow |
| **Privacy** | Stealth IDs, hidden amounts, unlinkable transfers |
| **Accountability** | On-chain commitment hashes before settlement |
| **Real-time Combat** | Tick-based auto-attack (0.6s ticks) |
| **Multi-ring Arena** | Concurrent duels with dedicated rings |

---

## How It Works

### 1. Challenge & Configure Stakes
Players challenge each other and set their SOL wager amount in the UI.

### 2. ZK Proof Generation
```
Player wallet ──► ShadowPay SDK ──► ZK Proof (amount hidden)
```

### 3. Stake Locking
```
ZK Proof ──► Sidecar ──► Shadowwire Pool (escrow)
```

### 4. Combat
Real-time PvP with OSRS-style mechanics. Winner determined by HP depletion.

### 5. Settlement
```
Winner declared ──► Commitment hash on-chain ──► ZK transfer to winner
```

---

## Privacy Properties

| What's Hidden | How |
|---------------|-----|
| Wallet addresses | Hashed to stealth IDs (HMAC-SHA256) |
| Stake amounts | Bulletproof ZK range proofs |
| Transfer links | Shielded pool mixing |
| Win/loss history | No public wallet association |

| What's Verifiable | How |
|-------------------|-----|
| Fair settlement | Commitment hash posted BEFORE payout |
| Correct amounts | ZK proofs verify without revealing |
| No operator fraud | Commitment mismatch = proof of cheating |

---

## Tech Stack

### Unity Client
- Unity 6 (WebGL)
- Mirror Networking
- C# with async/await
- JavaScript interop for wallet

### Sidecar
- Node.js 20+
- TypeScript
- Express.js
- @radr/shadowwire SDK
- @solana/web3.js

### Blockchain
- Solana (devnet/mainnet)
- Shadowwire shielded pools
- Memo program for commitments

---

## Quick Start

### Sidecar
```bash
cd sidecar
npm install
cp .env.example .env
# Edit .env with your keys
npm run dev
```

### Unity Client
Open `Unity/` folder documentation to understand the integration points. Full game client source not included (see Unity/README.md for what's exposed).

---

## API Endpoints (Sidecar)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/duel` | POST | Create new duel |
| `/api/v1/duel/:id` | GET | Get duel status |
| `/api/v1/duel/lock-stake` | POST | Lock stake with ZK proof |
| `/api/v1/duel/settle` | POST | Settle duel (internal) |
| `/health` | GET | Health check |

---

## Demo Video

https://x.com/PlayAlerith/status/2018337290397810760

---

## Team

Built for Solana Privacy Hack 2026

---

## Links

- [Shadowwire SDK](https://github.com/Radrdotfun/ShadowWire)
- [Alerith Game](https://alerith.com) *(coming soon)*
- [Alerith X](https://x.com/PlayAlerith) *(coming soon)*
