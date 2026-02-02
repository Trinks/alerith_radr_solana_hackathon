/**
 * Duel Arena - Network Protocol Definitions
 *
 * This file defines the message protocol for the duel arena system,
 * including state enums, data structures, and network messages.
 *
 * Built for Solana Hackathon - Shadowwire SDK Integration
 */

using System;

namespace Alerith.Duel.Protocol
{
    // =============================================================
    // ENUMS
    // =============================================================

    /// <summary>
    /// Duel session state machine states
    /// </summary>
    public enum DuelState
    {
        None = 0,           // No active duel
        Pending = 1,        // Challenge sent, waiting for response
        Staking = 2,        // Both players configuring stakes
        Ready = 3,          // Stakes confirmed, waiting for crypto lock
        Countdown = 4,      // Teleporting to arena
        InProgress = 5,     // Combat active
        Completed = 6,      // Duel finished
        Cancelled = 7,      // Duel cancelled
        Surrendered = 8     // Player surrendered
    }

    /// <summary>
    /// Reason the duel ended
    /// </summary>
    public enum DuelEndReason
    {
        None = 0,
        Death = 1,          // Player HP reached 0
        Timeout = 2,        // Time limit reached
        Forfeit = 3,        // Player surrendered
        Disconnect = 4,     // Player disconnected
        Draw = 5,           // Both players died simultaneously
        Cancelled = 6       // Duel cancelled before start
    }

    /// <summary>
    /// Type of duel - determines staking behavior
    /// </summary>
    public enum DuelType
    {
        Friendly = 0,       // No wager, just for fun
        Wager = 1           // Crypto/gold staking enabled
    }

    // =============================================================
    // DATA STRUCTURES
    // =============================================================

    /// <summary>
    /// Duel rules configuration - toggles for allowed combat options
    /// </summary>
    [Serializable]
    public struct DuelRulesNetwork
    {
        public bool allowPotions;
        public bool allowPrayer;
        public bool allowMovement;
        public bool noEquipment;
        public bool noWeapons;
        public bool noArmor;
        public bool noMagic;
        public bool noMelee;
        public bool noRanged;
        public bool noSpecialAttacks;
        public int timeLimitSeconds;

        public static DuelRulesNetwork Default => new DuelRulesNetwork
        {
            allowPotions = false,
            allowPrayer = false,
            allowMovement = true,
            noEquipment = false,
            noWeapons = false,
            noArmor = false,
            noMagic = false,
            noMelee = false,
            noRanged = false,
            noSpecialAttacks = false,
            timeLimitSeconds = 300
        };
    }

    /// <summary>
    /// Staked item info for network transmission
    /// </summary>
    [Serializable]
    public struct StakedItemNetwork
    {
        public long instanceId;
        public int baseItemId;
        public string name;
        public int quantity;
        public int quality;
        public string iconPath;
    }

    /// <summary>
    /// Stake information for network transmission
    /// Supports both in-game gold/items AND crypto (SOL) staking
    /// </summary>
    [Serializable]
    public struct DuelStakeNetwork
    {
        public long characterId;
        public string characterName;
        public long goldAmount;
        public StakedItemNetwork[] items;
        public bool confirmed;
        public bool locked;

        // Crypto stake (Solana via Shadowwire)
        public string cryptoWallet;  // Solana wallet address
        public float cryptoAmount;   // SOL amount
    }

    // =============================================================
    // CLIENT -> SERVER MESSAGES
    // =============================================================

    /// <summary>
    /// Client requests to challenge another player to a duel
    /// </summary>
    public struct DuelChallengeRequestMessage
    {
        public long targetCharacterId;
        public DuelType duelType;
        public DuelRulesNetwork rules;
    }

    /// <summary>
    /// Client accepts a duel challenge
    /// </summary>
    public struct DuelAcceptChallengeMessage
    {
        public long sessionId;
    }

    /// <summary>
    /// Client declines a duel challenge
    /// </summary>
    public struct DuelDeclineChallengeMessage
    {
        public long sessionId;
    }

    /// <summary>
    /// Client updates their stake configuration
    /// </summary>
    public struct DuelUpdateStakeMessage
    {
        public long sessionId;
        public long goldAmount;
        public long[] itemInstanceIds;
        public float cryptoAmount;      // SOL stake amount
        public string walletAddress;    // Solana wallet for escrow
    }

    /// <summary>
    /// Client confirms their stake (ready up)
    /// </summary>
    public struct DuelConfirmStakeMessage
    {
        public long sessionId;
        public string walletAddress;    // Required for crypto stakes
    }

    /// <summary>
    /// Client notifies server that crypto stake is locked via Shadowwire ZK transfer
    /// </summary>
    public struct DuelLockStakeMessage
    {
        public long sessionId;
        public string walletAddress;    // Player's Solana wallet
        public string stealthId;        // Shadowwire stealth ID for verification
        public string transactionHash;  // On-chain tx hash (optional)
        public float amountLocked;      // SOL amount locked
    }

    /// <summary>
    /// Client surrenders the duel
    /// </summary>
    public struct DuelSurrenderMessage
    {
        public long sessionId;
    }

    // =============================================================
    // SERVER -> CLIENT MESSAGES
    // =============================================================

    /// <summary>
    /// Server notifies client of incoming duel challenge
    /// </summary>
    public struct DuelChallengeReceivedMessage
    {
        public long sessionId;
        public long challengerCharacterId;
        public string challengerName;
        public int challengerLevel;
        public DuelRulesNetwork rules;
        public long expiresAtTicks;
    }

    /// <summary>
    /// Server notifies challenge was accepted - entering staking phase
    /// </summary>
    public struct DuelChallengeAcceptedMessage
    {
        public long sessionId;
        public long opponentCharacterId;
        public string opponentName;
        public DuelType duelType;
        public DuelRulesNetwork rules;
    }

    /// <summary>
    /// Server sends stake update (stakes changed by either player)
    /// </summary>
    public struct DuelStakeUpdatedMessage
    {
        public long sessionId;
        public DuelStakeNetwork yourStake;
        public DuelStakeNetwork opponentStake;
    }

    /// <summary>
    /// Server notifies both players ready for stake locking
    /// Contains sidecar duel ID for crypto operations
    /// </summary>
    public struct DuelReadyToLockMessage
    {
        public long sessionId;
        public string sidecarDuelId;    // 32-char duel ID from sidecar
        public float stakeAmountSol;
        public long expiresAt;          // Unix timestamp when lock expires
    }

    /// <summary>
    /// Server notifies stake lock status changed
    /// </summary>
    public struct DuelStakeLockStatusMessage
    {
        public long sessionId;
        public long lockedByCharacterId;
        public string lockedByName;
        public bool yourLocked;
        public bool opponentLocked;
    }

    /// <summary>
    /// Server notifies both stakes locked - combat countdown begins
    /// </summary>
    public struct DuelBothStakesLockedMessage
    {
        public long sessionId;
        public int teleportCountdownSeconds;
        public float totalStakeSol;
    }

    /// <summary>
    /// Server notifies countdown started
    /// </summary>
    public struct DuelCountdownMessage
    {
        public long sessionId;
        public int countdownSeconds;
    }

    /// <summary>
    /// Server notifies duel started (combat begins)
    /// </summary>
    public struct DuelStartedMessage
    {
        public long sessionId;
        public long opponentCharacterId;
        public string opponentName;
        public int timeLimitSeconds;
        public long startTimeTicks;
    }

    /// <summary>
    /// Server sends combat hit during auto-attack
    /// </summary>
    public struct DuelCombatHitMessage
    {
        public long sessionId;
        public long attackerCharacterId;
        public long defenderCharacterId;
        public int damage;
        public int hitType;             // 0=Miss, 1=Normal, 2=Special
        public int attackerCurrentHp;
        public int attackerMaxHp;
        public int defenderCurrentHp;
        public int defenderMaxHp;
    }

    /// <summary>
    /// Server notifies duel ended
    /// </summary>
    public struct DuelEndedMessage
    {
        public long sessionId;
        public bool youWon;
        public long winnerCharacterId;
        public string winnerName;
        public long loserCharacterId;
        public string loserName;
        public DuelEndReason reason;
        public DuelType duelType;
        public long goldWon;
        public StakedItemNetwork[] itemsWon;
        public int durationSeconds;
    }

    /// <summary>
    /// Server notifies crypto settlement complete
    /// </summary>
    public struct DuelCryptoSettlementMessage
    {
        public long sessionId;
        public bool youWon;
        public float amountSol;         // Amount won/lost
        public string transactionHash;  // Settlement tx hash
        public string winnerWallet;     // Truncated for display
    }

    /// <summary>
    /// Generic duel error message
    /// </summary>
    public struct DuelErrorMessage
    {
        public string errorCode;
        public string message;
    }
}
