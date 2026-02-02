/**
 * Duel Client State - Public State Properties
 *
 * Exposes the public state properties tracked by the duel client manager.
 * UI components can read these to display current duel status.
 *
 * Built for Solana Hackathon - Shadowwire SDK Integration
 */

using System;
using Alerith.Duel.Protocol;

namespace Alerith.Duel.Client
{
    /// <summary>
    /// Interface exposing duel client state.
    /// Read these properties to display current duel information in UI.
    /// </summary>
    public interface IDuelClientState
    {
        // =============================================================
        // DUEL SESSION STATE
        // =============================================================

        /// <summary>
        /// Current duel state (None, Pending, Staking, InProgress, etc.)
        /// </summary>
        DuelState CurrentState { get; }

        /// <summary>
        /// Game server session ID for this duel
        /// </summary>
        long CurrentSessionId { get; }

        /// <summary>
        /// Sidecar duel ID (32-char) for crypto operations.
        /// Used when calling Shadowwire stake locking APIs.
        /// </summary>
        string SidecarDuelId { get; }

        /// <summary>
        /// Current duel type (Friendly or Wager)
        /// </summary>
        DuelType CurrentDuelType { get; }

        /// <summary>
        /// Current duel rules configuration
        /// </summary>
        DuelRulesNetwork CurrentRules { get; }

        // =============================================================
        // OPPONENT INFO
        // =============================================================

        /// <summary>
        /// Opponent's character ID
        /// </summary>
        long OpponentCharacterId { get; }

        /// <summary>
        /// Opponent's display name
        /// </summary>
        string OpponentName { get; }

        // =============================================================
        // STAKE INFO
        // =============================================================

        /// <summary>
        /// Your current stake (gold, items, crypto)
        /// </summary>
        DuelStakeNetwork MyStake { get; }

        /// <summary>
        /// Opponent's current stake (gold, items, crypto)
        /// </summary>
        DuelStakeNetwork OpponentStake { get; }

        /// <summary>
        /// Whether this is a crypto stake duel
        /// </summary>
        bool IsCryptoStakeDuel { get; }

        // =============================================================
        // COMBAT STATE
        // =============================================================

        /// <summary>
        /// Your current HP during combat
        /// </summary>
        int MyCurrentHp { get; }

        /// <summary>
        /// Your max HP during combat
        /// </summary>
        int MyMaxHp { get; }

        /// <summary>
        /// Opponent's current HP during combat
        /// </summary>
        int OpponentCurrentHp { get; }

        /// <summary>
        /// Opponent's max HP during combat
        /// </summary>
        int OpponentMaxHp { get; }

        // =============================================================
        // TIMER
        // =============================================================

        /// <summary>
        /// Remaining seconds in the duel
        /// </summary>
        int RemainingSeconds { get; }

        /// <summary>
        /// When the duel started (for elapsed time calculation)
        /// </summary>
        DateTime DuelStartTime { get; }

        // =============================================================
        // CONVENIENCE PROPERTIES
        // =============================================================

        /// <summary>
        /// Whether currently in any duel phase
        /// </summary>
        bool IsInDuel { get; }

        /// <summary>
        /// Whether can send a new challenge
        /// </summary>
        bool CanChallenge { get; }

        /// <summary>
        /// Whether in staking phase
        /// </summary>
        bool IsStaking { get; }

        /// <summary>
        /// Whether combat is active
        /// </summary>
        bool IsFighting { get; }
    }

    /// <summary>
    /// Interface for duel client actions.
    /// Call these methods to interact with the duel system.
    /// </summary>
    public interface IDuelClientActions
    {
        /// <summary>
        /// Send a duel challenge to another player
        /// </summary>
        void SendChallenge(long targetCharacterId, DuelRulesNetwork rules, DuelType duelType = DuelType.Friendly);

        /// <summary>
        /// Accept a pending duel challenge
        /// </summary>
        void AcceptChallenge(long sessionId);

        /// <summary>
        /// Decline a pending duel challenge
        /// </summary>
        void DeclineChallenge(long sessionId);

        /// <summary>
        /// Cancel a challenge you sent
        /// </summary>
        void CancelChallenge();

        /// <summary>
        /// Update your stake during staking phase
        /// </summary>
        void UpdateStake(long goldAmount, System.Collections.Generic.List<long> itemInstanceIds, float cryptoAmount = 0);

        /// <summary>
        /// Confirm your stake (ready up) - for non-crypto duels
        /// </summary>
        void ConfirmStake(string walletAddress = null);

        /// <summary>
        /// Confirm stake with crypto - generates ZK proof and locks via Shadowwire.
        /// This is the main integration point for crypto duels.
        /// </summary>
        /// <returns>True if stake was successfully locked</returns>
        System.Threading.Tasks.Task<bool> ConfirmStakeWithCryptoAsync(string walletAddress, float cryptoAmountSol);

        /// <summary>
        /// Unconfirm your stake
        /// </summary>
        void UnconfirmStake();

        /// <summary>
        /// Update the duel rules during staking phase
        /// </summary>
        void UpdateRules(DuelRulesNetwork rules);

        /// <summary>
        /// Surrender the duel
        /// </summary>
        void Surrender();

        /// <summary>
        /// Check shielded pool balance for a wallet
        /// </summary>
        System.Threading.Tasks.Task<(bool hasBalance, long balanceLamports)> CheckShieldedBalanceAsync(string walletAddress);
    }

    /// <summary>
    /// Listener management interface
    /// </summary>
    public interface IDuelListenerManager
    {
        /// <summary>
        /// Add a listener to receive duel events
        /// </summary>
        void AddListener(IDuelListener listener);

        /// <summary>
        /// Remove a listener
        /// </summary>
        void RemoveListener(IDuelListener listener);
    }
}
