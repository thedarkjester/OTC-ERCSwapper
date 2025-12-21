import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { mainnet, sepolia, linea, lineaSepolia } from 'wagmi/chains';
import { http, custom, fallback } from 'viem';

/**
 * Wagmi configuration
 * 
 * Uses injected provider (e.g., MetaMask) for all RPC calls to avoid CORS issues.
 * Falls back to default wagmi HTTP RPC endpoints if injected provider is not available.
 */
function getTransport() {
  const transports = [];
  
  // Prefer injected provider when available
  if (typeof window !== 'undefined' && window.ethereum) {
    transports.push(custom(window.ethereum));
  }
  
  // Fallback to default HTTP RPC endpoints from chain configs
  transports.push(http());
  
  // Use fallback to try injected first, then HTTP
  return fallback(transports);
}

export const config = getDefaultConfig({
  appName: 'P2PSwap',
  projectId: 'p2pswap-demo', // Replace with your WalletConnect project ID in production
  chains: [mainnet, sepolia, linea, lineaSepolia],
  ssr: false,
  // Use injected provider when available, fallback to HTTP RPC endpoints
  transports: {
    [mainnet.id]: getTransport(),
    [sepolia.id]: getTransport(),
    [linea.id]: getTransport(),
    [lineaSepolia.id]: getTransport(),
  },
});


