# Alerith ShadowWire Sidecar

**Privacy-preserving duel arena with on-chain accountability** for the Alerith Duel Arena.

Built for the Solana Privacy Hack using the [Radr ShadowWire SDK](https://github.com/Radrdotfun/ShadowWire).

---

## About

The Duel Arena is a standalone preview of **Alerith**, an upcoming MMORPG on Solana. It lets players experience our combat system and stake real tokens before the full game launches - while keeping their wallets and amounts private.

---

## The Problem

Traditional on-chain gaming expose everything:
- **Wallet addresses** - Everyone sees who's playing
- **Stake amounts** - Competitors can see your bankroll
- **Win/loss history** - Your entire duel history is public

Players deserve privacy. But privacy without accountability enables fraud.

## Our Solution

**Private stakes + Provable fairness** using ShadowWire's shielded pools and a novel on-chain commitment system.

| Feature | How It Works |
|---------|--------------|
| **Hidden Amounts** | Bulletproof ZK range proofs hide all stake amounts |
| **Unlinkable Transfers** | Shielded pool transfers show only "something happened" |
| **Stealth Identities** | Wallet addresses immediately hashed (HMAC-SHA256) |
| **Provable Settlements** | Commitment hash posted on-chain BEFORE payout |

### The Innovation: Accountability Without Sacrificing Privacy

We solve the fundamental tension between privacy and trust:

```
BEFORE every settlement:
1. Create commitment: { duelId, winnerStealthId, loserStealthId, timestamp, gameServerSig }
2. Hash the commitment (SHA-256)
3. Post hash on-chain via Solana memo program (permanent, timestamped)
4. THEN execute the ZK transfer to winner

Result: If operator cheats, there's permanent blockchain proof.
```

**Privacy preserved**: The on-chain hash reveals nothing about wallets or amounts.
**Fraud detectable**: Any deviation from commitment is cryptographically provable.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                              DUEL FLOW                                        │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   ┌─────────┐         ┌─────────────┐         ┌─────────────────┐           │
│   │ Player  │◀───────▶│  Browser    │◀───────▶│    Sidecar      │           │
│   │ Wallet  │  sign   │  (ShadowWire│  API    │    (Node.js)    │           │
│   │(Phantom │  txs    │   SDK)      │         │                 │           │
│   │Solflare)│         └─────────────┘         └────────┬────────┘           │
│   └─────────┘                                          │                     │
│                                                        │                     │
│                          ┌─────────────────────────────┼─────────────────┐   │
│                          │                             │                 │   │
│                          ▼                             ▼                 ▼   │
│                   ┌─────────────┐             ┌─────────────┐    ┌──────────┐│
│                   │  ShadowWire │             │   Solana    │    │ In-Memory││
│                   │  Shielded   │             │   Memo      │    │  Store   ││
│                   │    Pool     │             │  Program    │    │          ││
│                   │  (ZK Txs)   │             │(Commitment) │    │ (Duels)  ││
│                   └─────────────┘             └─────────────┘    └──────────┘│
│                          │                             │                     │
│                          │    PRIVATE                  │   PUBLIC            │
│                          │    (amounts hidden)         │   (hash only)       │
│                          │                             │                     │
└──────────────────────────┴─────────────────────────────┴─────────────────────┘
```

### Data Flow

1. **Duel Creation**: Game server creates duel, wallets hashed to stealth IDs
2. **Stake Locking**: Players transfer via ShadowWire (ZK proofs hide amounts)
3. **Combat**: Game server determines winner
4. **Settlement**:
   - Commitment created with winner stealth ID
   - Hash posted on-chain (Solana memo)
   - ZK transfer to winner (amount hidden)
5. **Verification**: Anyone can verify commitment matches on-chain hash

---

## Trust Model

### What IS Private

| Data | Privacy Level | Implementation |
|------|---------------|----------------|
| Stake amounts | **Fully hidden** | Bulletproof ZK range proofs |
| Transfer details | **Fully hidden** | ShadowWire internal transfers |
| Wallet addresses | **Never stored** | HMAC-SHA256 → Stealth IDs |
| Player identities | **Protected** | Stealth IDs irreversible without pepper |
| Commitment contents | **Protected** | Only hash posted on-chain |

### What You Trust

| Component | Trust Level | Notes |
|-----------|-------------|-------|
| ShadowWire Protocol | Required | ZK proofs, shielded pool integrity |
| Game Server | Required | Determines duel winners |
| Escrow Wallet | Operator-controlled | **Mitigated by accountability** |
| Sidecar Service | Operator-controlled | **Mitigated by accountability** |

### Accountability = Fraud Detection

The operator holds the escrow wallet key. Without accountability, there's no way to verify settlements are correct.

**With accountability**: Every settlement has an on-chain commitment posted BEFORE the payout. This creates a verifiable audit trail:
1. The commitment proves who should have won
2. The payout proves who actually received funds
3. Any discrepancy = cryptographic proof of misconduct

Fraud becomes **provable** with permanent blockchain evidence.

### Path to True Trustlessness

On-chain PDAs won't work - releasing funds would require visible transactions, exposing amounts and wallets. True trustlessness requires native escrow within the shielded pool itself.

**ShadowPay x402** from Radr Labs will enable this - it's our top priority once available.

---

## Verification API

Anyone can verify a settlement was fair. Before paying the winner, we post a commitment hash on-chain - proving we decided the outcome before executing it.

### Quick Verify

Use the verification page at `/test/verify.html`, or call the API directly:

```
GET /duel/verify/{duelId}
```

**Response:**
```json
{
  "success": true,
  "verification": {
    "duelId": "4cccc0ba4153019f406cea46f35a601d",
    "winnerStealthId": "stealth_a1b2c3...",
    "loserStealthId": "stealth_d4e5f6...",
    "timestamp": 1699999999999
  },
  "commitment": {
    "rawData": "{\"duelId\":\"4cccc...\",\"winnerStealthId\":\"...\"}",
    "hash": "9f09f60e0c77cdaa...",
    "recomputedHash": "9f09f60e0c77cdaa...",
    "hashMatches": true
  },
  "onChain": {
    "posted": true,
    "txSignature": "5XyZ...",
    "solscanUrl": "https://solscan.io/tx/5XyZ..."
  }
}
```

If `hashMatches: true`, the settlement was provably fair.

### Manual Verification

For full trustless verification:
1. Copy `commitment.rawData` from the response
2. Hash it yourself:
   ```bash
   echo -n '{"duelId":"...","winnerStealthId":"..."}' | sha256sum
   ```
3. Confirm it matches `commitment.hash`
4. Open the `solscanUrl`, check the memo contains the same hash
5. Verify the memo timestamp is BEFORE the winner payout

If all match: **provably fair settlement.**

---

## Quick Start

### Prerequisites

- Node.js 18+
- Solana wallet with devnet SOL (for memo transactions)
- ShadowWire API access

### Installation

```bash
# Clone and install
git clone <repo>
cd alerith_sidecar
npm install

# Configure environment
cp .env.example .env
# Edit .env with your secrets (see .env.example)

# Start development server
npm run dev

# Open test page
open http://localhost:3002/test/duel-stake-test.html
```

---

## API Reference

### Public Endpoints (Development)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health status |
| `/duel/create` | POST | Create new duel |
| `/duel/lock-stake` | POST | Record stake lock |
| `/duel/settle` | POST | Settle duel |
| `/duel/refund` | POST | Refund stakes |
| `/duel/verify/:duelId` | GET | Verify settlement accountability |
| `/duel/:duelId` | GET | Get duel status |
| `/duel/service-info` | GET | Get escrow wallet info |

### Authentication Model

| Mode | Endpoint | Auth Required | Use Case |
|------|----------|---------------|----------|
| **Development** | `/duel/*` | None | Browser test page, demos |
| **Production** | `/api/v1/duel/*` | `X-Internal-Secret` header | Game server only |

**Development mode** (`NODE_ENV=development`): Public `/duel/*` routes are enabled for the browser test page. Anyone can call settle - this is intentional for demos.

**Production mode**: Only `/api/v1/duel/*` routes are available, protected by the `INTERNAL_API_KEY`. The game server includes this in the `X-Internal-Secret` header. Unauthorized settle attempts are rejected.

```bash
# Production settle call (game server only)
curl -X POST https://your-server/api/v1/duel/settle \
  -H "X-Internal-Secret: your-internal-api-key" \
  -H "Content-Type: application/json" \
  -d '{"duelId": "...", "winnerWallet": "...", ...}'
```

### Settlement Response

```json
{
  "success": true,
  "winnerTxSignature": "TX1:abc... TX2:def...",
  "treasuryTxSignature": "TX1:ghi... TX2:jkl...",
  "winnerPayoutLamports": "214522000",
  "treasuryFeeLamports": "4378000",
  "commitmentHash": "9f09f60e0c77cdaa...",
  "commitmentTxSignature": "5XyZ..."
}
```

---

## Test Pages

Browser-based test pages are included in `/public/`:

| Page | Description |
|------|-------------|
| `duel-stake-test.html` | Full duel flow testing |
| `deposit.html` | Deposit to shielded pool |
| `withdraw.html` | Withdraw from shielded pool |
| `lock-stake.html` | Lock stake for existing duel |
| `verify.html` | Verify settlement |

### Features
- **Multi-wallet support**: Phantom, Solflare, Backpack, Glow, Coinbase
- **Multi-token support**: SOL, USD1, RADR
- **Full duel flow**: Create → Lock Stakes → Settle/Refund
- **Balance tracking**: Per-token shielded pool balance
- **Transaction display**: Separate links for each ZK transfer
- **Verification**: Shows commitment TX with Solscan link

### Supported Tokens

| Token | Minimum | Decimals | Mint Address |
|-------|---------|----------|--------------|
| SOL | 0.11 | 9 | Native |
| USD1 | 5.5 | 6 | `USD1ttGY1N17NEEHLmELoaybftRBUSErhqYiQzvEmuB` |
| RADR | 11,000 | 9 | `CzFvsLdUazabdiu9TYXujj4EY495fG7VgJJ3vQs6bonk` |

### Supported Wallets

| Wallet | Status |
|--------|--------|
| Phantom | Supported |
| Solflare | Supported |
| Backpack | Supported |
| Glow | Supported |
| Coinbase | Supported |

---

## Privacy Guarantees

### On-Chain (Public Blockchain)

| What's Visible | What's Hidden |
|----------------|---------------|
| "A transfer happened" | Transfer amount |
| Commitment hash exists | Commitment contents |
| Memo timestamp | Wallet addresses |
| Pool activity | Player identities |

### Off-Chain (Sidecar)

| What's Stored | What's NOT Stored |
|---------------|-------------------|
| Stealth IDs (hashed) | Raw wallet addresses |
| Duel metadata | Plaintext identities |
| Commitment records | Amounts in logs |

### Even If Compromised

If the sidecar database is leaked:
- Stealth IDs cannot be reversed (HMAC with secret pepper)
- No wallet addresses to extract
- Commitment data reveals only stealth IDs

---

## Development

```bash
# Type checking
npm run typecheck

# Development mode (auto-reload)
npm run dev

# Production build
npm run build

# Start production
npm start
```

## Current Status: Private Testing

**The Duel Arena is not yet public.** We're in a private testing phase to ensure security and fairness before launch.

### Why We're Not Live Yet

| Area | Concern | Status |
|------|---------|--------|
| **Combat System** | Exploit prevention, outcome verification | Testing |
| **Game Server Privacy** | Secure player connections, no IP/identity leaks | In Development |
| **Escrow Security** | Operator-controlled wallet requires additional safeguards | Planned |
| **Anti-Cheat** | Combat manipulation, stake griefing prevention | Testing |

We want to get this right. Privacy-preserving gaming with real stakes requires thorough testing of both the cryptographic layer (ShadowWire) and the game logic layer (combat outcomes, anti-cheat).

### What Needs to Happen Before Launch

1. **Trustless escrow** - Migrate to ShadowPay x402 native escrow once available
2. **Combat system hardening** - Ensure no exploits in duel mechanics
3. **Game server ↔ client privacy** - Secure WebSocket connections, no metadata leaks
4. **Load testing** - Verify system handles concurrent duels without issues
5. **Third-party audit** - Independent review of settlement logic and accountability system

---

## Roadmap

1. **ShadowPay x402 / Native Escrow**: Upgrade to Radr Labs' reworked protocol once available, enabling trustless escrow within shielded pools
2. **Game Server Privacy**: End-to-end encrypted game connections with no IP correlation
3. **Rate Limiting**: Redis-based rate limiting for production scale
4. **Combat Verification**: Cryptographic proofs of valid combat outcomes
5. **Multi-token Extension**: Support for additional SPL tokens as ShadowWire adds them
6. **Wallet Adapter Integration**: Migrate to @solana/wallet-adapter for broader wallet support (Jupiter, etc.)
7. **Release of standalone game client**: A standalone game client that can run outside of the browser for users to play the game

---

## Summary

**Alerith ShadowWire Sidecar** demonstrates that privacy and accountability can coexist:

- **Full privacy**: Amounts, wallets, and identities all hidden
- **Provable fairness**: On-chain commitment before every settlement
- **Fraud detection**: Any cheating creates permanent blockchain evidence
- **Multi-token**: Support for SOL, USD1, and RADR
- **User-friendly**: Multi-wallet support, browser-based testing

**Privacy with accountability** - full ZK privacy for users, with verifiable proof that settlements are honest.

---

## License

**All Rights Reserved** © 2026 Alerith

This code is provided for review and educational purposes only. You may not use, copy, modify, or distribute this software without explicit written permission from Alerith.

For licensing inquiries, contact us via the links below.

---

## Links

- [ShadowWire SDK](https://github.com/Radrdotfun/ShadowWire)
- [Solana Privacy Hack](https://solana.com/privacyhack)
- [Alerith Game](https://alerith.com)
- [Alerith Twitter](https://x.com/PlayAlerith)
- [Alerith Telegram](https://t.me/alerith)
- [Alerith Discord](https://discord.gg/53xqK7Gfj)

