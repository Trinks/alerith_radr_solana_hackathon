/**
 * Duel Stake Service - Privacy-Preserving Stake Management
 *
 * Orchestrates the stake locking flow for crypto duels:
 * 1. Generate ZK proof via ShadowPay SDK
 * 2. Send proof to sidecar for escrow locking
 * 3. Await both players locked confirmation
 *
 * Built for Solana Hackathon - Shadowwire SDK Integration
 */

using System;
using System.Threading.Tasks;

namespace Alerith.Wallet.ShadowPay
{
    // =============================================================
    // REQUEST/RESPONSE DTOs
    // =============================================================

    /// <summary>
    /// Request to lock stake via sidecar API
    /// </summary>
    [Serializable]
    public class LockStakeRequest
    {
        /// <summary>
        /// Duel session ID from CreateDuel response
        /// </summary>
        public string duelId;

        /// <summary>
        /// Player's Solana wallet address
        /// </summary>
        public string playerWallet;

        /// <summary>
        /// JSON-serialized ZK proof payment from ShadowPay
        /// </summary>
        public string paymentProof;
    }

    /// <summary>
    /// Response from stake lock operation
    /// </summary>
    [Serializable]
    public class LockStakeResponse
    {
        /// <summary>
        /// Whether the lock was successful
        /// </summary>
        public bool success;

        /// <summary>
        /// On-chain transaction signature
        /// </summary>
        public string txSignature;

        /// <summary>
        /// Current duel status from sidecar
        /// </summary>
        public string duelStatus;

        /// <summary>
        /// Whether both players have now locked their stakes
        /// </summary>
        public bool bothLocked;

        /// <summary>
        /// Error message if failed
        /// </summary>
        public string error;
    }

    /// <summary>
    /// Response from get duel status
    /// </summary>
    [Serializable]
    public class GetDuelResponse
    {
        public bool success;
        public DuelInfo duel;
        public string error;
    }

    /// <summary>
    /// Duel information from sidecar
    /// </summary>
    [Serializable]
    public class DuelInfo
    {
        public string duelId;
        public string status;
        public string player1StealthId;
        public string player2StealthId;
        public string player1Name;
        public string player2Name;
        public bool player1Locked;
        public bool player2Locked;
        public string stakeAmountLamports;
        public string token;
        public long expiresAt;
        public string winnerStealthId;
    }

    /// <summary>
    /// Escrow balance response
    /// </summary>
    [Serializable]
    public class EscrowBalanceResponse
    {
        public string wallet_address;
        public long balance;
    }

    // =============================================================
    // SERVICE INTERFACE
    // =============================================================

    /// <summary>
    /// Interface for duel stake service.
    /// Handles the orchestration between ShadowPay SDK and sidecar API.
    /// </summary>
    public interface IDuelStakeService
    {
        /// <summary>
        /// Sidecar API base URL
        /// </summary>
        string SidecarUrl { get; }

        /// <summary>
        /// Escrow wallet address for stake locking
        /// </summary>
        string EscrowWallet { get; }

        /// <summary>
        /// Lock stake for a duel using ZK proof.
        ///
        /// Flow:
        /// 1. Generate ZK proof via ShadowPayBridge.GeneratePaymentAsync()
        /// 2. POST proof to sidecar /duel/lock-stake endpoint
        /// 3. Return result with bothLocked flag
        /// </summary>
        /// <param name="duelId">Duel ID from sidecar</param>
        /// <param name="playerWallet">Player's Solana wallet</param>
        /// <param name="stakeLamports">Stake amount in lamports</param>
        Task<LockStakeResponse> LockStakeAsync(string duelId, string playerWallet, long stakeLamports);

        /// <summary>
        /// Get current duel status from sidecar
        /// </summary>
        Task<GetDuelResponse> GetDuelStatusAsync(string duelId);

        /// <summary>
        /// Check escrow balance for a wallet
        /// </summary>
        Task<EscrowBalanceResponse> GetEscrowBalanceAsync(string walletAddress);
    }

    // =============================================================
    // STAKE LOCKING FLOW DOCUMENTATION
    // =============================================================

    /// <summary>
    /// Documents the complete stake locking flow for crypto duels.
    /// This is the key integration point with Shadowwire SDK.
    /// </summary>
    public static class StakeLockingFlow
    {
        /*
         * CRYPTO STAKE LOCKING SEQUENCE:
         *
         * 1. BOTH PLAYERS CONFIRM STAKES (Game Server)
         *    - Server creates duel record in sidecar
         *    - Server sends DuelReadyToLockMessage with sidecarDuelId
         *
         * 2. CLIENT GENERATES ZK PROOF (ShadowPay SDK)
         *    var proof = await ShadowPayBridge.GeneratePaymentAsync(
         *        stakeLamports,
         *        escrowWallet,
         *        $"Duel:{duelId}"
         *    );
         *
         * 3. CLIENT SENDS TO SIDECAR (DuelStakeService)
         *    POST /api/v1/duel/lock-stake
         *    {
         *        duelId: string,
         *        playerWallet: string,
         *        paymentProof: string (JSON ZK proof)
         *    }
         *
         * 4. SIDECAR VERIFIES & LOCKS (Shadowwire Backend)
         *    - Verifies ZK proof validity
         *    - Transfers funds to escrow
         *    - Updates duel status
         *    - Returns bothLocked flag
         *
         * 5. CLIENT NOTIFIES GAME SERVER (Network Message)
         *    Send DuelLockStakeMessage with:
         *    - sessionId
         *    - walletAddress
         *    - stealthId
         *    - transactionHash
         *
         * 6. WHEN BOTH LOCKED (Game Server)
         *    - Server sends DuelBothStakesLockedMessage
         *    - Teleport countdown begins
         *    - Combat starts
         *
         * 7. DUEL ENDS (Settlement)
         *    - Server calls sidecar /settle-winner endpoint
         *    - Sidecar transfers escrowed funds to winner
         *    - Server sends DuelCryptoSettlementMessage with TX hash
         */
    }
}
