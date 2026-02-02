/**
 * Shadowwire Bridge Interface
 *
 * Defines the interface for Phantom wallet integration and
 * Shadowwire SDK operations including ZK-proof stake locking.
 *
 * Built for Solana Hackathon - Privacy-Preserving Duel Stakes
 */

using System;
using System.Threading.Tasks;

namespace Alerith.Wallet.Shadowwire
{
    // =============================================================
    // RESPONSE TYPES
    // =============================================================

    /// <summary>
    /// Response from shielded pool balance query
    /// </summary>
    [Serializable]
    public class PoolBalanceResponse
    {
        public bool success;
        public long balanceLamports;
        public string balanceSol;
        public string wallet;
    }

    /// <summary>
    /// Service configuration from sidecar
    /// </summary>
    [Serializable]
    public class ServiceInfoResponse
    {
        public bool success;
        public string escrowWallet;
        public string treasuryWallet;
        public float minStakeSol;
        public float maxStakeSol;
        public float houseFeePercent;
    }

    /// <summary>
    /// Generic transaction result
    /// </summary>
    [Serializable]
    public class TransactionResult
    {
        public bool success;
        public string txSignature;
        public long amountLamports;
        public string error;
    }

    /// <summary>
    /// Result from stake locking operation
    /// </summary>
    [Serializable]
    public class StakeLockResult
    {
        public bool success;
        public string txSignature;
        public string duelId;
        public bool bothLocked;         // True when both players have locked
        public string duelStatus;       // Current duel state from sidecar
        public string error;
    }

    /// <summary>
    /// Message signature result
    /// </summary>
    [Serializable]
    public class SignatureResult
    {
        public string message;
        public string signature;
    }

    // =============================================================
    // BRIDGE INTERFACE
    // =============================================================

    /// <summary>
    /// Interface for Shadowwire SDK bridge.
    /// Handles Phantom wallet connection and ZK-proof operations.
    /// </summary>
    public interface IShadowWireBridge
    {
        /// <summary>
        /// Whether the bridge is initialized and ready
        /// </summary>
        bool IsInitialized { get; }

        /// <summary>
        /// Whether a wallet is currently connected
        /// </summary>
        bool IsWalletConnected { get; }

        /// <summary>
        /// Connected wallet address (null if not connected)
        /// </summary>
        string WalletAddress { get; }

        /// <summary>
        /// Escrow wallet address from service info
        /// </summary>
        string EscrowWallet { get; }

        // Events
        event Action OnInitializedEvent;
        event Action<string> OnWalletConnectedEvent;
        event Action OnWalletDisconnectedEvent;
        event Action<PoolBalanceResponse> OnBalanceReceivedEvent;
        event Action<StakeLockResult> OnStakeLockedEvent;
        event Action<string> OnStakeLockFailedEvent;
        event Action<string> OnLockStakeStatusUpdateEvent;
        event Action<string> OnErrorEvent;

        /// <summary>
        /// Initialize the Shadowwire bridge
        /// </summary>
        Task<bool> InitializeAsync();

        /// <summary>
        /// Connect to Phantom wallet
        /// </summary>
        /// <returns>Connected wallet public key</returns>
        Task<string> ConnectWalletAsync();

        /// <summary>
        /// Disconnect wallet
        /// </summary>
        void DisconnectWallet();

        /// <summary>
        /// Get shielded pool balance for a wallet
        /// </summary>
        Task<PoolBalanceResponse> GetPoolBalanceAsync(string wallet = null);

        /// <summary>
        /// Get service info (escrow wallet, fees, limits)
        /// </summary>
        Task<ServiceInfoResponse> GetServiceInfoAsync();

        /// <summary>
        /// Deposit SOL to shielded pool
        /// </summary>
        Task<TransactionResult> DepositAsync(long amountLamports);

        /// <summary>
        /// Withdraw SOL from shielded pool
        /// </summary>
        Task<TransactionResult> WithdrawAsync(long amountLamports, string destination = null);

        /// <summary>
        /// Lock stake for duel using ZK proof.
        /// Opens Phantom for user to sign the shielded transfer.
        /// </summary>
        /// <param name="duelId">Duel session ID</param>
        /// <param name="escrowWallet">Escrow wallet address</param>
        /// <param name="amountLamports">Stake amount in lamports</param>
        Task<StakeLockResult> LockStakeAsync(string duelId, string escrowWallet, long amountLamports);

        /// <summary>
        /// Request refund for a cancelled duel
        /// </summary>
        Task<TransactionResult> RequestRefundAsync(string duelId);

        /// <summary>
        /// Sign an arbitrary message with Phantom
        /// </summary>
        Task<SignatureResult> SignMessageAsync(string message);
    }

    // =============================================================
    // WEBGL JAVASCRIPT INTEROP (Method Signatures)
    // =============================================================

    /// <summary>
    /// JavaScript function names for WebGL DllImport.
    /// These map to the Shadowwire SDK JavaScript implementation.
    /// </summary>
    public static class ShadowWireJSMethods
    {
        // Initialization
        public const string Init = "ShadowWire_Init";
        public const string SetSidecarUrl = "ShadowWire_SetSidecarUrl";

        // Wallet Management
        public const string ConnectWallet = "ShadowWire_ConnectWallet";
        public const string DisconnectWallet = "ShadowWire_DisconnectWallet";
        public const string IsWalletConnected = "ShadowWire_IsWalletConnected";
        public const string GetWalletAddress = "ShadowWire_GetWalletAddress";

        // Balance Operations
        public const string GetPoolBalance = "ShadowWire_GetPoolBalance";
        public const string GetServiceInfo = "ShadowWire_GetServiceInfo";

        // Transaction Operations
        public const string CreateDeposit = "ShadowWire_CreateDeposit";
        public const string Withdraw = "ShadowWire_Withdraw";

        // Duel Stake Operations (Key Feature)
        public const string LockStakeWithProof = "ShadowWire_LockStakeWithProof";
        public const string RequestRefund = "ShadowWire_RequestRefund";

        // Signing
        public const string SignMessage = "ShadowWire_SignMessage";
    }

    /// <summary>
    /// JavaScript callback method names that Unity receives.
    /// </summary>
    public static class ShadowWireJSCallbacks
    {
        public const string OnInitialized = "OnInitialized";
        public const string OnWalletConnected = "OnWalletConnected";
        public const string OnWalletDisconnected = "OnWalletDisconnected";
        public const string OnBalanceReceived = "OnBalanceReceived";
        public const string OnServiceInfoReceived = "OnServiceInfoReceived";
        public const string OnDepositSuccess = "OnDepositSuccess";
        public const string OnWithdrawSuccess = "OnWithdrawSuccess";
        public const string OnStakeLocked = "OnStakeLocked";
        public const string OnLockStakeFailed = "OnLockStakeFailed";
        public const string OnLockStakeStatusUpdate = "OnLockStakeStatusUpdate";
        public const string OnMessageSigned = "OnMessageSigned";
        public const string OnError = "OnError";
    }
}
