/**
 * Common utilities for Alerith test pages
 */

// API endpoints
const SIDECAR_BASE = window.location.origin;
const SHADOWPAY_API = 'https://shadow.radr.fun/shadowpay';

// Token configuration
const TOKEN_DECIMALS = { SOL: 9, USD1: 6, RADR: 9 };
const TOKEN_MINIMUMS = { SOL: 0.11, USD1: 5.5, RADR: 11000 };
const TOKEN_MINTS = {
    SOL: null,
    USD1: 'USD1ttGY1N17NEEHLmELoaybftRBUSErhqYiQzvEmuB',
    RADR: 'CzFvsLdUazabdiu9TYXujj4EY495fG7VgJJ3vQs6bonk'
};

// Wallet providers
const walletProviders = {
    phantom: {
        name: 'Phantom',
        check: () => window.phantom?.solana?.isPhantom || window.solana?.isPhantom,
        get: () => window.phantom?.solana || window.solana
    },
    solflare: {
        name: 'Solflare',
        check: () => window.solflare?.isSolflare,
        get: () => window.solflare
    },
    backpack: {
        name: 'Backpack',
        check: () => window.backpack?.isBackpack,
        get: () => window.backpack
    },
    glow: {
        name: 'Glow',
        check: () => window.glow?.isGlow,
        get: () => window.glow
    },
    coinbase: {
        name: 'Coinbase',
        check: () => window.coinbaseSolana,
        get: () => window.coinbaseSolana
    }
};

// State
let walletAddress = null;
let connectedProvider = null;
let selectedToken = 'SOL';

/**
 * Get minimum stake for selected token
 */
function getMinimum() {
    return TOKEN_MINIMUMS[selectedToken] || 0.1;
}

/**
 * Get formatted minimum (with locale separators)
 */
function getMinimumFormatted() {
    return getMinimum().toLocaleString();
}

/**
 * Get token mint address
 */
function getTokenMint() {
    return TOKEN_MINTS[selectedToken] || null;
}

/**
 * Get decimals for selected token
 */
function getDecimals() {
    return TOKEN_DECIMALS[selectedToken] || 9;
}

/**
 * Convert display amount to smallest unit
 */
function toSmallestUnit(amount) {
    return Math.floor(amount * Math.pow(10, getDecimals()));
}

/**
 * Convert smallest unit to display amount
 */
function fromSmallestUnit(amount) {
    return amount / Math.pow(10, getDecimals());
}

/**
 * Show status message
 */
function showStatus(elementId, message, type) {
    const el = document.getElementById(elementId);
    if (el) {
        el.innerHTML = `<div class="status ${type}">${message}</div>`;
    }
}

/**
 * Detect and render wallet buttons
 */
function detectWallets(containerId, onConnect) {
    const container = document.getElementById(containerId);
    if (!container) return;

    let found = 0;
    for (const [key, provider] of Object.entries(walletProviders)) {
        if (provider.check()) {
            found++;
            const btn = document.createElement('button');
            btn.textContent = provider.name;
            btn.onclick = () => connectWallet(key, onConnect);
            container.appendChild(btn);
        }
    }

    if (found === 0) {
        const noWalletMsg = document.getElementById('noWalletMsg');
        if (noWalletMsg) noWalletMsg.style.display = 'block';
    }
}

/**
 * Connect to wallet
 */
async function connectWallet(providerKey, onSuccess) {
    try {
        const provider = walletProviders[providerKey];
        const wallet = provider.get();
        const response = await wallet.connect();
        let publicKey = response?.publicKey || wallet.publicKey || response;
        if (!publicKey) throw new Error('Could not get public key');

        walletAddress = publicKey.toString();
        connectedProvider = { ...provider, wallet };

        // Update UI
        const walletButtons = document.getElementById('walletButtons');
        const walletConnected = document.getElementById('walletConnected');

        if (walletButtons) walletButtons.style.display = 'none';
        if (walletConnected) {
            walletConnected.style.display = 'block';
            walletConnected.textContent = `Connected: ${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)} (${provider.name})`;
        }

        if (onSuccess) onSuccess(walletAddress, connectedProvider);
    } catch (error) {
        showStatus('walletButtons', `Error: ${error.message}`, 'error');
    }
}

/**
 * Fetch shielded pool balance
 */
async function fetchBalance(wallet, onResult) {
    try {
        const mint = getTokenMint();
        let url = `${SHADOWPAY_API}/api/pool/balance/${wallet}`;
        if (mint) url += `?token_mint=${mint}`;

        const response = await fetch(url);
        const result = await response.json();
        const balance = result.available || result.balance || 0;

        if (onResult) onResult(balance);
        return balance;
    } catch (e) {
        console.error('Could not fetch balance:', e);
        if (onResult) onResult(0);
        return 0;
    }
}

/**
 * Handle token change
 */
function onTokenChange(tokenSelectId, callbacks) {
    const select = document.getElementById(tokenSelectId);
    if (select) {
        selectedToken = select.value;
    }

    // Update labels
    const tokenLabel = document.getElementById('tokenLabel');
    const minLabel = document.getElementById('minLabel');
    if (tokenLabel) tokenLabel.textContent = selectedToken;
    if (minLabel) minLabel.textContent = getMinimumFormatted();

    // Update input min
    const amountInput = document.getElementById('depositAmount') ||
                        document.getElementById('withdrawAmount') ||
                        document.getElementById('stakeAmount');
    if (amountInput) {
        amountInput.min = getMinimum();
        amountInput.value = Math.max(parseFloat(amountInput.value) || 0, getMinimum());
    }

    if (callbacks?.onTokenChange) callbacks.onTokenChange(selectedToken);
}
