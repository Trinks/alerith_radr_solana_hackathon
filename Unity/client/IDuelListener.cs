/**
 * Duel Listener Interface
 *
 * Event-driven interface for UI components to receive duel state updates.
 * Implements observer pattern for decoupled UI updates.
 *
 * Built for Solana Hackathon - Shadowwire SDK Integration
 */

using Alerith.Duel.Protocol;

namespace Alerith.Duel.Client
{
    /// <summary>
    /// Interface for listening to duel events.
    /// Implement this in UI components to receive real-time duel state updates.
    /// </summary>
    public interface IDuelListener
    {
        // =============================================================
        // CHALLENGE PHASE
        // =============================================================

        /// <summary>
        /// Called when a duel challenge is received from another player
        /// </summary>
        void OnChallengeReceived(long sessionId, long challengerCharacterId, string challengerName, int challengerLevel, DuelRulesNetwork rules);

        /// <summary>
        /// Called when a duel challenge we sent has been acknowledged by server
        /// </summary>
        void OnChallengeSent(long sessionId, long targetCharacterId, string targetName);

        /// <summary>
        /// Called when a duel is accepted and enters staking phase
        /// </summary>
        void OnDuelAccepted(long sessionId, long opponentCharacterId, string opponentName, DuelType duelType, DuelRulesNetwork rules);

        /// <summary>
        /// Called when a challenge is declined
        /// </summary>
        void OnChallengeDeclined(long sessionId, string reason);

        /// <summary>
        /// Called when a challenge is cancelled
        /// </summary>
        void OnChallengeCancelled(long sessionId, string reason);

        // =============================================================
        // STAKING PHASE
        // =============================================================

        /// <summary>
        /// Called when stakes are updated (either player)
        /// </summary>
        void OnStakeUpdated(long sessionId, DuelStakeNetwork myStake, DuelStakeNetwork opponentStake);

        /// <summary>
        /// Called when stake confirmation status changes
        /// </summary>
        void OnStakeConfirmed(long sessionId, bool myConfirmed, bool opponentConfirmed);

        /// <summary>
        /// Called when duel rules are updated by either player
        /// </summary>
        void OnRulesUpdated(long sessionId, long updatedByCharacterId, DuelRulesNetwork rules);

        // =============================================================
        // CRYPTO STAKE LOCKING (Shadowwire Integration)
        // =============================================================

        /// <summary>
        /// Called when both players have confirmed and duel is ready for stake locking.
        /// Contains sidecar duel ID for crypto locking via Shadowwire.
        /// </summary>
        void OnReadyToLock(long sessionId, string sidecarDuelId, float stakeAmountSol, long expiresAt);

        /// <summary>
        /// Called when a player locks their crypto stake via Shadowwire ZK transfer
        /// </summary>
        void OnStakeLockStatus(long sessionId, long lockedByCharacterId, string lockedByName, bool yourLocked, bool opponentLocked);

        /// <summary>
        /// Called when both players have locked their stakes and teleport will begin
        /// </summary>
        void OnBothStakesLocked(long sessionId, int teleportCountdownSeconds, float totalStakeSol);

        // =============================================================
        // COMBAT PHASE
        // =============================================================

        /// <summary>
        /// Called when countdown starts before duel begins
        /// </summary>
        void OnCountdownStarted(long sessionId, int seconds);

        /// <summary>
        /// Called when the duel starts (combat begins)
        /// </summary>
        void OnDuelStarted(long sessionId, long opponentCharacterId, string opponentName, int timeLimitSeconds);

        /// <summary>
        /// Called when duel time is updated
        /// </summary>
        void OnTimeUpdated(long sessionId, int remainingSeconds);

        /// <summary>
        /// Called when a combat hit occurs during auto-attack
        /// </summary>
        /// <param name="hitType">0=Miss, 1=Normal, 2=Special</param>
        void OnCombatHit(long attackerCharacterId, long defenderCharacterId, int damage, int hitType,
            int attackerCurrentHp, int attackerMaxHp, int defenderCurrentHp, int defenderMaxHp);

        // =============================================================
        // RESOLUTION PHASE
        // =============================================================

        /// <summary>
        /// Called when the duel ends
        /// </summary>
        /// <param name="duelType">Friendly or Wager - affects spoils display</param>
        /// <param name="goldWon">Gold won if wager duel and won, 0 otherwise</param>
        void OnDuelEnded(long sessionId, bool youWon, long winnerCharacterId, string winnerName, DuelEndReason reason, DuelType duelType, long goldWon);

        /// <summary>
        /// Called when crypto settlement is complete after duel ends.
        /// Contains transaction hash for on-chain verification.
        /// </summary>
        void OnCryptoSettlement(long sessionId, bool youWon, float amountSol, string transactionHash);

        // =============================================================
        // CONNECTION HANDLING
        // =============================================================

        /// <summary>
        /// Called when opponent disconnects during duel
        /// </summary>
        void OnOpponentDisconnected(long sessionId, string opponentName, int logoutTimerSeconds);

        /// <summary>
        /// Called when opponent reconnects during duel
        /// </summary>
        void OnOpponentReconnected(long sessionId, string opponentName);

        // =============================================================
        // ERRORS & INFO
        // =============================================================

        /// <summary>
        /// Called when an error occurs
        /// </summary>
        void OnDuelError(string errorCode, string message);

        /// <summary>
        /// Called for informational messages
        /// </summary>
        void OnDuelInfo(string message);
    }
}
