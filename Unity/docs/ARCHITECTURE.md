# Duel Arena Architecture

## System Overview

The duel arena is a modular system with clear separation between client, server, and blockchain layers.

---

## Component Diagram

```
┌────────────────────────────────────────────────────────────────────┐
│                           CLIENT LAYER                              │
├────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌──────────────────┐    ┌──────────────────┐                      │
│  │   DuelUIManager  │    │ DuelClientManager│                      │
│  │                  │◄───│                  │                      │
│  │  - Challenge UI  │    │  - State machine │                      │
│  │  - Staking UI    │    │  - Event system  │                      │
│  │  - Combat HUD    │    │  - Network msgs  │                      │
│  │  - Result Panel  │    │                  │                      │
│  └──────────────────┘    └────────┬─────────┘                      │
│                                   │                                 │
│  ┌──────────────────┐    ┌────────▼─────────┐                      │
│  │ ShadowWireBridge │◄───│ DuelStakeService │                      │
│  │                  │    │                  │                      │
│  │  - Phantom conn  │    │  - ZK proof gen  │                      │
│  │  - Pool balance  │    │  - Sidecar API   │                      │
│  │  - Stake lock    │    │  - Lock flow     │                      │
│  └──────────────────┘    └──────────────────┘                      │
│                                                                     │
└─────────────────────────────────┬──────────────────────────────────┘
                                  │ Mirror Networking
┌─────────────────────────────────▼──────────────────────────────────┐
│                           SERVER LAYER                              │
├────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌──────────────────┐    ┌──────────────────┐                      │
│  │   DuelManager    │───►│  DuelInstance    │                      │
│  │                  │    │                  │                      │
│  │  - Orchestration │    │  - Session state │                      │
│  │  - Msg handlers  │    │  - Player refs   │                      │
│  │  - Flow control  │    │  - Stakes data   │                      │
│  └────────┬─────────┘    └──────────────────┘                      │
│           │                                                         │
│  ┌────────▼─────────┐    ┌──────────────────┐                      │
│  │ DuelCombatSystem │    │  DuelArenaZone   │                      │
│  │                  │    │                  │                      │
│  │  - Tick system   │    │  - Ring alloc    │                      │
│  │  - Damage calc   │    │  - Spawn points  │                      │
│  │  - Death detect  │    │  - Teleport      │                      │
│  └──────────────────┘    └──────────────────┘                      │
│                                                                     │
└─────────────────────────────────┬──────────────────────────────────┘
                                  │ HTTP API
┌─────────────────────────────────▼──────────────────────────────────┐
│                         BLOCKCHAIN LAYER                            │
├────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌──────────────────┐    ┌──────────────────┐                      │
│  │ Shadowwire Sidecar│   │  Solana Chain    │                      │
│  │                  │───►│                  │                      │
│  │  - Duel records  │    │  - Escrow acct   │                      │
│  │  - ZK verify     │    │  - Transfers     │                      │
│  │  - Settlement    │    │  - TX history    │                      │
│  └──────────────────┘    └──────────────────┘                      │
│                                                                     │
└────────────────────────────────────────────────────────────────────┘
```

---

## State Machine

```
                    ┌─────────────────┐
                    │      NONE       │
                    └────────┬────────┘
                             │ SendChallenge()
                    ┌────────▼────────┐
              ┌─────│     PENDING     │─────┐
              │     └────────┬────────┘     │
        Decline/            │ AcceptChallenge()
        Cancel/             │
        Expire              │
              │     ┌────────▼────────┐
              │     │     STAKING     │◄────┐
              │     └────────┬────────┘     │
              │              │ ConfirmStake() x2
              │              │              │
              │     ┌────────▼────────┐     │
              │     │      READY      │     │ UnconfirmStake()
              │     └────────┬────────┘     │
              │              │ LockStake() x2
              │              │              │
              │     ┌────────▼────────┐     │
              └────►│    COUNTDOWN    │─────┘
                    └────────┬────────┘
                             │ 3 seconds
                    ┌────────▼────────┐
                    │   IN_PROGRESS   │
                    └────────┬────────┘
                             │ Death/Timeout/Forfeit
                    ┌────────▼────────┐
                    │    COMPLETED    │
                    └────────┬────────┘
                             │ 5 second delay
                    ┌────────▼────────┐
                    │      NONE       │
                    └─────────────────┘
```

---

## Message Flow

### Challenge Phase
```
Player A                    Server                    Player B
    │                          │                          │
    │──ChallengeRequest───────►│                          │
    │                          │──ChallengeReceived──────►│
    │                          │◄──AcceptChallenge────────│
    │◄──ChallengeAccepted──────│──ChallengeAccepted──────►│
    │                          │                          │
```

### Staking Phase
```
Player A                    Server                    Player B
    │                          │                          │
    │──UpdateStake────────────►│                          │
    │◄──StakeUpdated───────────│──StakeUpdated───────────►│
    │                          │                          │
    │──ConfirmStake───────────►│                          │
    │◄──StakeConfirmed─────────│──StakeConfirmed─────────►│
    │                          │◄──ConfirmStake───────────│
    │◄──StakeConfirmed─────────│──StakeConfirmed─────────►│
    │                          │                          │
    │◄──ReadyToLock────────────│──ReadyToLock────────────►│
    │                          │                          │
```

### Crypto Lock Phase
```
Player A                    Server                    Sidecar
    │                          │                          │
    │══ZK Proof Gen═══════════►│                          │
    │──POST /lock-stake────────│─────────────────────────►│
    │◄─────────────────────────│◄────────────────────────│
    │                          │                          │
    │──LockStakeMessage───────►│                          │
    │◄──StakeLockStatus────────│──StakeLockStatus────────►│
    │                          │                          │
    │                     [Both locked]                   │
    │                          │                          │
    │◄──BothStakesLocked───────│──BothStakesLocked───────►│
    │                          │                          │
```

### Combat Phase
```
Player A                    Server                    Player B
    │                          │                          │
    │◄──Countdown(3)───────────│──Countdown(3)───────────►│
    │◄──Teleport───────────────│──Teleport───────────────►│
    │                          │                          │
    │◄──DuelStarted────────────│──DuelStarted────────────►│
    │                          │                          │
    │           [Combat ticks every 0.6s]                 │
    │                          │                          │
    │◄──CombatHit──────────────│──CombatHit──────────────►│
    │◄──CombatHit──────────────│──CombatHit──────────────►│
    │                     ...                             │
    │                          │                          │
    │                    [Player B dies]                  │
    │                          │                          │
    │◄──DuelEnded(won)─────────│──DuelEnded(lost)────────►│
    │                          │                          │
```

### Settlement Phase
```
Server                      Sidecar                   Solana
    │                          │                          │
    │──/settle-winner─────────►│                          │
    │                          │──Transfer───────────────►│
    │                          │◄──TX Hash────────────────│
    │◄──Settlement Result──────│                          │
    │                          │                          │

Server                     Player A                   Player B
    │                          │                          │
    │──CryptoSettlement(won)──►│                          │
    │──CryptoSettlement(lost)──│─────────────────────────►│
    │                          │                          │
```

---

## Data Structures

### DuelInstance (Server)
```
DuelInstance
├── SessionId: long
├── State: DuelState
├── DuelType: DuelType (Friendly/Wager)
├── SidecarDuelId: string (32-char)
│
├── Challenger
│   ├── CharacterId: long
│   ├── ConnectionId: int
│   ├── WalletAddress: string
│   └── StealthId: string
│
├── Opponent
│   ├── CharacterId: long
│   ├── ConnectionId: int
│   ├── WalletAddress: string
│   └── StealthId: string
│
├── Stakes
│   ├── ChallengerStake: DuelStakeNetwork
│   └── OpponentStake: DuelStakeNetwork
│
├── Rules: DuelRulesNetwork
│
└── Timing
    ├── CreatedAt: DateTime
    ├── ExpiresAt: DateTime
    └── StartedAt: DateTime
```

### DuelStakeNetwork
```
DuelStakeNetwork
├── characterId: long
├── characterName: string
├── goldAmount: long
├── items: StakedItemNetwork[]
├── confirmed: bool
├── locked: bool
├── cryptoWallet: string
└── cryptoAmount: float (SOL)
```

---

## Security Considerations

1. **Server Authority** - All game logic runs server-side
2. **Stake Validation** - Server verifies stakes before locking
3. **ZK Verification** - Sidecar validates all ZK proofs
4. **Timeout Handling** - Automatic refunds on lock expiry
5. **Disconnect Protection** - Auto-attack continues, forfeit timer

---

## Performance

- **Tick Rate**: 0.6 seconds 
- **Network**: Mirror with reliable/unreliable channels
- **Concurrent Duels**: Limited by arena ring count
- **State Sync**: On reconnect, full state sent to client
