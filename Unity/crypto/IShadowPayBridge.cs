/**
 * ShadowPay Bridge Interface
 *
 * Defines the interface for ZK proof generation using ShadowPay SDK.
 * Enables privacy-preserving payments for duel stakes.
 *
 * Built for Solana Hackathon - Zero-Knowledge Proof Integration
 */

using System;
using System.Threading.Tasks;

namespace Alerith.Wallet.ShadowPay
{
    // =============================================================
    // ZK PAYMENT STRUCTURES
    // =============================================================

    /// <summary>
    /// ZK proof payment structure.
    /// This is the format sent to the sidecar for settlement.
    /// </summary>
    [Serializable]
    public class ZKPayment
    {
        /// <summary>
        /// Protocol version (currently 1)
        /// </summary>
        public int x402Version;

        /// <summary>
        /// Payment scheme - always "zkproof" for ShadowPay
        /// </summary>
        public string scheme;

        /// <summary>
        /// Network identifier (e.g., "solana-mainnet", "solana-devnet")
        /// </summary>
        public string network;

        /// <summary>
        /// Payment payload containing amount, addresses, and proof
        /// </summary>
        public ZKPaymentPayload payload;
    }

    /// <summary>
    /// Inner payload of ZK payment
    /// </summary>
    [Serializable]
    public class ZKPaymentPayload
    {
        /// <summary>
        /// Amount in lamports (1 SOL = 1,000,000,000 lamports)
        /// </summary>
        public long amount;

        /// <summary>
        /// Sender's stealth/commitment ID (privacy-preserving)
        /// </summary>
        public string sender;

        /// <summary>
        /// Recipient wallet address (escrow for duels)
        /// </summary>
        public string recipient;

        /// <summary>
        /// Resource identifier linking payment to specific duel
        /// Format: "Duel:{duelId}"
        /// </summary>
        public string resource;

        /// <summary>
        /// Zero-knowledge proof data
        /// </summary>
        public string proof;
    }

    // =============================================================
    // BRIDGE INTERFACE
    // =============================================================

    /// <summary>
    /// Interface for ShadowPay ZK proof generation.
    /// Handles player registration and payment proof creation.
    /// </summary>
    public interface IShadowPayBridge
    {
        /// <summary>
        /// Whether the SDK is initialized
        /// </summary>
        bool IsInitialized { get; }

        /// <summary>
        /// Player's commitment (ShadowID) for ZK proofs
        /// </summary>
        string PlayerCommitment { get; }

        /// <summary>
        /// Initialize the ShadowPay SDK
        /// </summary>
        Task<bool> InitializeAsync();

        /// <summary>
        /// Register player's ShadowID to get their commitment for ZK proofs.
        /// Must be called after wallet connection.
        /// </summary>
        /// <param name="walletAddress">Player's Solana wallet address</param>
        /// <param name="signature">Signature of registration message</param>
        /// <param name="message">Original message that was signed</param>
        /// <returns>Player's commitment hash for future proofs</returns>
        Task<string> RegisterShadowIdAsync(string walletAddress, string signature, string message);

        /// <summary>
        /// Generate a ZK proof payment for staking.
        /// This creates a privacy-preserving payment proof that can be
        /// verified without revealing the sender's identity.
        /// </summary>
        /// <param name="amountLamports">Amount in lamports</param>
        /// <param name="recipient">Escrow wallet address</param>
        /// <param name="resource">Resource identifier (e.g., "Duel:abc123")</param>
        /// <returns>JSON string containing the ZK proof payment</returns>
        Task<string> GeneratePaymentAsync(long amountLamports, string recipient, string resource);
    }

    // =============================================================
    // WEBGL JAVASCRIPT INTEROP (Method Signatures)
    // =============================================================

    /// <summary>
    /// JavaScript function names for WebGL DllImport
    /// </summary>
    public static class ShadowPayJSMethods
    {
        public const string Init = "ShadowPay_Init";
        public const string RegisterShadowId = "ShadowPay_RegisterShadowId";
        public const string GeneratePayment = "ShadowPay_GeneratePayment";
    }

    /// <summary>
    /// JavaScript callback method names
    /// </summary>
    public static class ShadowPayJSCallbacks
    {
        public const string OnInitialized = "OnShadowPayInitialized";
        public const string OnShadowIdRegistered = "OnShadowIdRegistered";
        public const string OnPaymentGenerated = "OnPaymentGenerated";
        public const string OnError = "OnShadowPayError";
    }
}
