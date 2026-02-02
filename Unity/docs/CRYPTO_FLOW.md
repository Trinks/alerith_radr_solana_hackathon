# Crypto Stake Flow - Shadowwire Integration

## Overview

This document details the privacy-preserving crypto staking flow using Shadowwire SDK.

---

## Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                        STAKE LOCKING FLOW                           │
└─────────────────────────────────────────────────────────────────────┘

 Player A                  Player B                  Sidecar
    │                         │                         │
    │                         │                         │
 ┌──▼──────────────────────┐  │                         │
 │ 1. CONFIGURE STAKE      │  │                         │
 │    - Set SOL amount     │  │                         │
 │    - Connect Phantom    │  │                         │
 └──┬──────────────────────┘  │                         │
    │                         │                         │
    │                      ┌──▼──────────────────────┐  │
    │                      │ 1. CONFIGURE STAKE      │  │
    │                      │    - Set SOL amount     │  │
    │                      │    - Connect Phantom    │  │
    │                      └──┬──────────────────────┘  │
    │                         │                         │
 ┌──▼──────────────────────┐  │                         │
 │ 2. CONFIRM STAKE        │──┼────────────────────────►│
 │    - Server notified    │  │      Create Duel       │
 └──┬──────────────────────┘  │                         │
    │                         │                         │
    │                      ┌──▼──────────────────────┐  │
    │                      │ 2. CONFIRM STAKE        │──┼►
    │                      │    - Server notified    │  │
    │                      └──┬──────────────────────┘  │
    │                         │                         │
    │◄────────────────────────┼─────────────────────────│
    │    ReadyToLock (sidecarDuelId)                    │
    │                         │                         │
 ┌──▼──────────────────────┐  │                         │
 │ 3. GENERATE ZK PROOF    │  │                         │
 │                         │  │                         │
 │ ShadowPay.Generate(     │  │                         │
 │   amount,               │  │                         │
 │   escrow,               │  │                         │
 │   "Duel:{id}"           │  │                         │
 │ )                       │  │                         │
 └──┬──────────────────────┘  │                         │
    │                         │                         │
 ┌──▼──────────────────────┐  │                         │
 │ 4. LOCK STAKE           │──┼────────────────────────►│
 │                         │  │                         │
 │ POST /duel/lock-stake   │  │   ┌───────────────────┐ │
 │ {                       │  │   │ Verify ZK proof   │ │
 │   duelId,               │  │   │ Transfer to escrow│ │
 │   wallet,               │  │   │ Update duel state │ │
 │   paymentProof          │  │   └───────────────────┘ │
 │ }                       │  │                         │
 └──┬──────────────────────┘  │◄────────────────────────│
    │                         │    StakeLockStatus      │
    │                         │                         │
    │                      ┌──▼──────────────────────┐  │
    │                      │ 3-4. SAME FLOW          │──┼►
    │                      └──┬──────────────────────┘  │
    │                         │                         │
    │◄────────────────────────┼─────────────────────────│
    │    BothStakesLocked (totalSol)                    │
    │                         │                         │
 ┌──▼──────────────────────┐  │                         │
 │ 5. COMBAT               │  │                         │
 │    - Teleport to arena  │  │                         │
 │    - Auto-attack        │  │                         │
 │    - HP tracking        │  │                         │
 └──┬──────────────────────┘  │                         │
    │                         │                         │
    │         [Winner: Player A]                        │
    │                         │                         │
    │                                                   │
    │                      Server ──────────────────────►│
    │                            /settle-winner          │
    │                            {                       │
    │                              duelId,               │
    │                              winnerWallet          │
    │                            }                       │
    │                                                   │
    │                                   ┌──────────────┐│
    │                                   │ Transfer SOL ││
    │                                   │ to winner    ││
    │                                   └──────────────┘│
    │                                                   │
    │◄──────────────────────────────────────────────────│
    │    CryptoSettlement (txHash, amount)              │
    │                         │                         │
```

---

## Code Examples

### 1. Generate ZK Proof

```csharp
// Called when player confirms stake with crypto
public async Task<bool> ConfirmStakeWithCryptoAsync(string wallet, float solAmount)
{
    // Convert SOL to lamports
    long lamports = (long)(solAmount * 1_000_000_000);

    // Generate ZK proof via ShadowPay SDK
    string proof = await ShadowPayBridge.Instance.GeneratePaymentAsync(
        lamports,
        DuelStakeService.Instance.EscrowWallet,
        $"Duel:{SidecarDuelId}"
    );

    // Proof is a JSON object like:
    // {
    //   "x402Version": 1,
    //   "scheme": "zkproof",
    //   "network": "solana-mainnet",
    //   "payload": {
    //     "amount": 100000000,
    //     "sender": "commitment_hash...",
    //     "recipient": "escrow_wallet...",
    //     "resource": "Duel:abc123",
    //     "proof": "zk_proof_data..."
    //   }
    // }

    return proof;
}
```

### 2. Lock Stake via Sidecar

```csharp
// Send proof to sidecar for escrow locking
public async Task<LockStakeResponse> LockStakeAsync(string duelId, string wallet, long lamports)
{
    // Generate ZK proof
    var proof = await ShadowPayBridge.Instance.GeneratePaymentAsync(
        lamports,
        _escrowWallet,
        $"Duel:{duelId}"
    );

    // POST to sidecar
    var request = new LockStakeRequest
    {
        duelId = duelId,
        playerWallet = wallet,
        paymentProof = proof
    };

    var response = await PostAsync<LockStakeResponse>(
        $"{_sidecarUrl}/duel/lock-stake",
        request
    );

    // Response includes:
    // - success: bool
    // - txSignature: on-chain tx hash
    // - bothLocked: true if both players locked
    // - duelStatus: current state

    return response;
}
```

### 3. Notify Game Server

```csharp
// After successful lock, notify game server
NetworkClient.Send(new DuelLockStakeMessage
{
    sessionId = CurrentSessionId,
    walletAddress = wallet,
    stealthId = ShadowPayBridge.Instance.PlayerCommitment,
    transactionHash = response.txSignature,
    amountLocked = solAmount
});
```

---

## API Endpoints

### POST /api/v1/duel/lock-stake

**Request:**
```json
{
  "duelId": "abc123def456...",
  "playerWallet": "7xKXt...",
  "paymentProof": "{\"x402Version\":1,...}"
}
```

**Response:**
```json
{
  "success": true,
  "txSignature": "5eyJh...",
  "duelStatus": "PENDING_OPPONENT",
  "bothLocked": false,
  "error": null
}
```

### GET /api/v1/duel/{duelId}

**Response:**
```json
{
  "success": true,
  "duel": {
    "duelId": "abc123...",
    "status": "BOTH_LOCKED",
    "player1StealthId": "commit1...",
    "player2StealthId": "commit2...",
    "player1Locked": true,
    "player2Locked": true,
    "stakeAmountLamports": "200000000",
    "expiresAt": 1704067200
  }
}
```

---

## Privacy Properties

| Property | Description |
|----------|-------------|
| **Sender Anonymity** | ZK proof hides sender identity |
| **Amount Privacy** | Only total stake visible, not individual |
| **Stealth IDs** | Players identified by commitment hash |
| **Escrow Privacy** | Funds pooled in shared escrow |

---

## Error Handling

| Error Code | Description | User Action |
|------------|-------------|-------------|
| `INSUFFICIENT_BALANCE` | Shielded pool balance too low | Deposit more SOL |
| `PROOF_INVALID` | ZK proof verification failed | Retry generation |
| `DUEL_EXPIRED` | Lock window expired | Start new duel |
| `ALREADY_LOCKED` | Stake already locked | Wait for opponent |
| `WALLET_DISCONNECTED` | Phantom not connected | Reconnect wallet |

---

## Timing

| Phase | Duration |
|-------|----------|
| Stake confirm window | 5 minutes |
| Lock stake window | 2 minutes |
| Teleport countdown | 3 seconds |
| Combat timeout | 5 minutes |
| Settlement | ~10 seconds |
