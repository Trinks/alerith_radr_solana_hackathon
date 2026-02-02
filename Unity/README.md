# Alerith Duel Arena - Shadowwire SDK Integration

**Privacy-Preserving PvP Dueling with Crypto Stakes on Solana**

Built for the Solana Privacy Hack | Unity WebGL + Shadowwire SDK

---

## Overview

Alerith Duel Arena is a real-time PvP dueling system that integrates Shadowwire SDK for **privacy-preserving crypto staking**. Players can wager SOL on duels using zero-knowledge proofs, ensuring stake privacy while maintaining verifiable settlement.

### Key Features

- **Phantom Wallet Integration** - Seamless wallet connection in WebGL
- **ZK-Proof Stake Locking** - Privacy-preserving stake transfers via Shadowwire
- **Dual Staking System** - Support for both in-game gold/items AND SOL crypto
- **Real-time Combat** - OSRS-style tick-based auto-attack system
- **Multi-ring Arena** - Concurrent duels with dedicated rings
- **Verifiable Settlement** - On-chain transaction hashes for transparency

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         PLAYER CLIENT                           │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │
│  │   Duel UI   │  │   Client    │  │    Shadowwire Bridge    │ │
│  │   Panels    │──│   Manager   │──│  (Phantom + ZK Proofs)  │ │
│  └─────────────┘  └─────────────┘  └───────────┬─────────────┘ │
└────────────────────────┬────────────────────────┼───────────────┘
                         │ Mirror                 │ WebGL JS Interop
                         │ Networking             │
┌────────────────────────▼────────────────────────▼───────────────┐
│                       GAME SERVER               │               │
│  ┌─────────────┐  ┌─────────────┐              │               │
│  │    Duel     │  │   Combat    │              │               │
│  │   Manager   │──│   System    │              │               │
│  └──────┬──────┘  └─────────────┘              │               │
└─────────┼───────────────────────────────────────┼───────────────┘
          │ HTTP                                  │
┌─────────▼───────────────────────────────────────▼───────────────┐
│                    SHADOWWIRE SIDECAR                           │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │
│  │    Duel     │  │    Stake    │  │      Settlement         │ │
│  │   Records   │──│   Escrow    │──│       Engine            │ │
│  └─────────────┘  └─────────────┘  └───────────┬─────────────┘ │
└─────────────────────────────────────────────────┼───────────────┘
                                                  │
┌─────────────────────────────────────────────────▼───────────────┐
│                         SOLANA                                  │
│              (On-chain escrow + settlement)                     │
└─────────────────────────────────────────────────────────────────┘
```

---

## Crypto Stake Flow

### 1. Challenge & Accept
```
Player A ──[Challenge]──► Game Server ──[Notify]──► Player B
                                       ◄──[Accept]──
```

### 2. Configure Stakes
Both players set their wager amount (SOL) in the staking UI.

### 3. ZK Proof Generation (Shadowwire SDK)
```csharp
// Generate privacy-preserving payment proof
var proof = await ShadowPayBridge.GeneratePaymentAsync(
    stakeLamports,      // Amount in lamports
    escrowWallet,       // Sidecar escrow address
    $"Duel:{duelId}"    // Resource identifier
);
```

### 4. Stake Locking
```
Client ──[POST /duel/lock-stake]──► Sidecar
         {
           duelId: "abc123",
           playerWallet: "...",
           paymentProof: "{ZK proof JSON}"
         }
                                    ◄── { bothLocked: true }
```

### 5. Combat
- Players teleported to arena ring
- Auto-attack combat begins
- Real-time HP updates via network messages

### 6. Settlement
```
Game Server ──[Winner declared]──► Sidecar ──[Transfer]──► Winner Wallet
                                            ◄── TX Hash
             ◄──[DuelCryptoSettlementMessage]──
```

---

## File Structure

```
Unity/
├── protocol/
│   └── DuelMessages.cs         # Network protocol definitions
├── crypto/
│   ├── IShadowWireBridge.cs    # Phantom wallet + pool operations
│   ├── IShadowPayBridge.cs     # ZK proof generation interface
│   └── DuelStakeService.cs     # Stake locking orchestration
├── client/
│   ├── IDuelListener.cs        # Event listener interface
│   └── DuelClientState.cs      # Client state properties
└── README.md
```

---

## Key Integration Points

### Shadowwire Bridge (WebGL)
JavaScript interop for Phantom wallet operations:
- `ShadowWire_ConnectWallet()` - Connect Phantom
- `ShadowWire_GetPoolBalance()` - Check shielded balance
- `ShadowWire_LockStakeWithProof()` - Lock stake with ZK proof

### ShadowPay Bridge (ZK Proofs)
Zero-knowledge proof generation:
- `ShadowPay_RegisterShadowId()` - Register player commitment
- `ShadowPay_GeneratePayment()` - Create ZK proof for stake

### Network Protocol
Mirror networking messages for duel state sync:
- `DuelLockStakeMessage` - Client notifies stake locked
- `DuelBothStakesLockedMessage` - Server confirms both locked
- `DuelCryptoSettlementMessage` - Settlement confirmation with TX hash

---

## Privacy Features

1. **Stealth IDs** - Players identified by commitment hash, not wallet
2. **ZK Proofs** - Stake transfers verified without revealing sender
3. **Escrow System** - Funds held in shielded escrow until settlement
4. **On-chain Verification** - Settlement transactions publicly verifiable

---

## Technical Stack

- **Unity 2022.3** - Game engine
- **Mirror Networking** - Real-time multiplayer
- **WebGL** - Browser deployment
- **Shadowwire SDK** - Privacy-preserving payments
- **Solana** - Blockchain settlement

---

## Demo

[Screenshots/Video link here]

---

## Team

Built for Solana Privacy Hack 2026