/**
 * Swap cache utility for storing and retrieving swaps per chain per address
 * Optimizes queries by tracking last known block number
 */

import type { ParsedSwapEvent } from '../types';
import { logger } from './logger';

// Cache structure with BigInt values as strings for JSON storage
interface CachedSwap {
  swapId: string;
  initiator: `0x${string}`;
  acceptor: `0x${string}`;
  swap: {
    expiryDate: string;
    initiatorERCContract: `0x${string}`;
    acceptorERCContract: `0x${string}`;
    initiator: `0x${string}`;
    initiatorTokenId: string;
    initiatorTokenQuantity: string;
    acceptor: `0x${string}`;
    acceptorTokenId: string;
    acceptorTokenQuantity: string;
    initiatorETHPortion: string;
    acceptorETHPortion: string;
    initiatorTokenType: number;
    acceptorTokenType: number;
  };
  blockNumber: string;
  transactionHash: `0x${string}`;
  completeTransactionHash?: `0x${string}`;
}

interface SwapCache {
  swaps: CachedSwap[];
  lastBlock: string; // Stored as string since localStorage can't handle BigInt
  timestamp: number; // When cache was last updated
}

const CACHE_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes cache expiry

function getCacheKey(chainId: number, address: string): string {
  return `p2pswap_swaps_cache_${chainId}_${address.toLowerCase()}`;
}

/**
 * Get cached swaps for a chain/address combination
 */
export function getCachedSwaps(chainId: number, address: string): {
  swaps: ParsedSwapEvent[];
  lastBlock: bigint | null;
} {
  if (!address) {
    return { swaps: [], lastBlock: null };
  }

  try {
    const key = getCacheKey(chainId, address);
    const stored = localStorage.getItem(key);
    
    if (!stored) {
      return { swaps: [], lastBlock: null };
    }

    const cache: SwapCache = JSON.parse(stored);
    
    // Check if cache is expired
    const now = Date.now();
    if (now - cache.timestamp > CACHE_EXPIRY_MS) {
      logger.log('Swap cache expired, clearing');
      localStorage.removeItem(key);
      return { swaps: [], lastBlock: null };
    }

    // Convert stored swaps back to ParsedSwapEvent format (BigInt conversion)
    const swaps: ParsedSwapEvent[] = cache.swaps.map((cachedSwap): ParsedSwapEvent => ({
      swapId: BigInt(cachedSwap.swapId),
      initiator: cachedSwap.initiator,
      acceptor: cachedSwap.acceptor,
      blockNumber: BigInt(cachedSwap.blockNumber),
      transactionHash: cachedSwap.transactionHash,
      completeTransactionHash: cachedSwap.completeTransactionHash,
      swap: {
        expiryDate: BigInt(cachedSwap.swap.expiryDate),
        initiatorERCContract: cachedSwap.swap.initiatorERCContract,
        acceptorERCContract: cachedSwap.swap.acceptorERCContract,
        initiator: cachedSwap.swap.initiator,
        initiatorTokenId: BigInt(cachedSwap.swap.initiatorTokenId),
        initiatorTokenQuantity: BigInt(cachedSwap.swap.initiatorTokenQuantity),
        acceptor: cachedSwap.swap.acceptor,
        acceptorTokenId: BigInt(cachedSwap.swap.acceptorTokenId),
        acceptorTokenQuantity: BigInt(cachedSwap.swap.acceptorTokenQuantity),
        initiatorETHPortion: BigInt(cachedSwap.swap.initiatorETHPortion),
        acceptorETHPortion: BigInt(cachedSwap.swap.acceptorETHPortion),
        initiatorTokenType: cachedSwap.swap.initiatorTokenType,
        acceptorTokenType: cachedSwap.swap.acceptorTokenType,
      },
    }));

    const lastBlock = cache.lastBlock ? BigInt(cache.lastBlock) : null;

    return { swaps, lastBlock };
  } catch (error) {
    logger.error('Error reading swap cache:', error);
    return { swaps: [], lastBlock: null };
  }
}

/**
 * Save swaps to cache with last known block number
 */
export function saveCachedSwaps(
  chainId: number,
  address: string,
  swaps: ParsedSwapEvent[],
  lastBlock: bigint
): void {
  if (!address) return;

  try {
    const key = getCacheKey(chainId, address);
    
    // Convert BigInt values to strings for JSON storage
    const cache: SwapCache = {
      swaps: swaps.map((swap): CachedSwap => ({
        swapId: swap.swapId.toString(),
        initiator: swap.initiator,
        acceptor: swap.acceptor,
        blockNumber: swap.blockNumber.toString(),
        transactionHash: swap.transactionHash,
        completeTransactionHash: swap.completeTransactionHash,
        swap: {
          expiryDate: swap.swap.expiryDate.toString(),
          initiatorERCContract: swap.swap.initiatorERCContract,
          acceptorERCContract: swap.swap.acceptorERCContract,
          initiator: swap.swap.initiator,
          initiatorTokenId: swap.swap.initiatorTokenId.toString(),
          initiatorTokenQuantity: swap.swap.initiatorTokenQuantity.toString(),
          acceptor: swap.swap.acceptor,
          acceptorTokenId: swap.swap.acceptorTokenId.toString(),
          acceptorTokenQuantity: swap.swap.acceptorTokenQuantity.toString(),
          initiatorETHPortion: swap.swap.initiatorETHPortion.toString(),
          acceptorETHPortion: swap.swap.acceptorETHPortion.toString(),
          initiatorTokenType: swap.swap.initiatorTokenType,
          acceptorTokenType: swap.swap.acceptorTokenType,
        },
      })),
      lastBlock: lastBlock.toString(),
      timestamp: Date.now(),
    };

    localStorage.setItem(key, JSON.stringify(cache));
    logger.log(`Saved ${swaps.length} swaps to cache for chain ${chainId}, lastBlock: ${lastBlock}`);
  } catch (error) {
    logger.error('Error saving swap cache:', error);
    // If storage is full, try to clear old caches
    try {
      clearExpiredCaches();
      // Retry once with reduced data
      const key = getCacheKey(chainId, address);
      const cache: SwapCache = {
        swaps: swaps.slice(-100).map((swap): CachedSwap => ({ // Keep only last 100 swaps
          swapId: swap.swapId.toString(),
          initiator: swap.initiator,
          acceptor: swap.acceptor,
          blockNumber: swap.blockNumber.toString(),
          transactionHash: swap.transactionHash,
          completeTransactionHash: swap.completeTransactionHash,
          swap: {
            expiryDate: swap.swap.expiryDate.toString(),
            initiatorERCContract: swap.swap.initiatorERCContract,
            acceptorERCContract: swap.swap.acceptorERCContract,
            initiator: swap.swap.initiator,
            initiatorTokenId: swap.swap.initiatorTokenId.toString(),
            initiatorTokenQuantity: swap.swap.initiatorTokenQuantity.toString(),
            acceptor: swap.swap.acceptor,
            acceptorTokenId: swap.swap.acceptorTokenId.toString(),
            acceptorTokenQuantity: swap.swap.acceptorTokenQuantity.toString(),
            initiatorETHPortion: swap.swap.initiatorETHPortion.toString(),
            acceptorETHPortion: swap.swap.acceptorETHPortion.toString(),
            initiatorTokenType: swap.swap.initiatorTokenType,
            acceptorTokenType: swap.swap.acceptorTokenType,
          },
        })),
        lastBlock: lastBlock.toString(),
        timestamp: Date.now(),
      };
      localStorage.setItem(key, JSON.stringify(cache));
    } catch (retryError) {
      logger.error('Failed to save swap cache even after cleanup:', retryError);
    }
  }
}

/**
 * Clear expired caches to free up storage
 */
function clearExpiredCaches(): void {
  try {
    const now = Date.now();
    const keysToRemove: string[] = [];

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('p2pswap_swaps_cache_')) {
        try {
          const stored = localStorage.getItem(key);
          if (stored) {
            const cache: SwapCache = JSON.parse(stored);
            if (now - cache.timestamp > CACHE_EXPIRY_MS) {
              keysToRemove.push(key);
            }
          }
        } catch {
          // Invalid cache entry, remove it
          if (key) keysToRemove.push(key);
        }
      }
    }

    keysToRemove.forEach(key => localStorage.removeItem(key));
    if (keysToRemove.length > 0) {
      logger.log(`Cleared ${keysToRemove.length} expired swap caches`);
    }
  } catch (error) {
    logger.error('Error clearing expired caches:', error);
  }
}

/**
 * Clear cache for a specific chain/address
 */
export function clearSwapCache(chainId: number, address: string): void {
  if (!address) return;
  
  try {
    const key = getCacheKey(chainId, address);
    localStorage.removeItem(key);
    logger.log(`Cleared swap cache for chain ${chainId}, address ${address}`);
  } catch (error) {
    logger.error('Error clearing swap cache:', error);
  }
}

/**
 * Get the highest block number from an array of swaps
 */
export function getMaxBlockNumber(swaps: ParsedSwapEvent[]): bigint | null {
  if (swaps.length === 0) return null;
  
  return swaps.reduce((max, swap) => {
    return swap.blockNumber > max ? swap.blockNumber : max;
  }, swaps[0].blockNumber);
}

