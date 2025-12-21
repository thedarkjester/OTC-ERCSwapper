import { useEffect, useRef } from 'react';
import { usePublicClient } from 'wagmi';
import type { ParsedSwapEvent } from '../types';

interface UseSwapTransactionTrackingProps {
  swap: ParsedSwapEvent;
  onUpdate?: (updatedSwap: ParsedSwapEvent) => void;
}

/**
 * Hook to track pending transactions for a swap and update swap details when transactions complete.
 * This runs in the background and updates the swap without refreshing the whole page.
 * 
 * Note: This hook is intentionally minimal. The main transaction tracking happens when:
 * 1. User completes a swap - the tx hash is immediately added via handleComplete
 * 2. Events are fetched - completeTransactionHash is added from SwapComplete events
 * 
 * This hook only watches for when a transaction that was already added becomes confirmed,
 * to ensure the UI stays in sync.
 */
export function useSwapTransactionTracking({ swap, onUpdate }: UseSwapTransactionTrackingProps) {
  const publicClient = usePublicClient();
  const trackedTxsRef = useRef<Set<string>>(new Set());
  const updateTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isProcessingRef = useRef<boolean>(false);

  // Only track if we have a completeTransactionHash that might be pending
  const completeTxHash = swap.completeTransactionHash;

  useEffect(() => {
    // If we have a completeTransactionHash but it's not confirmed yet, track it
    if (!completeTxHash || !publicClient || !onUpdate) return;
    
    // Skip if already tracked or processing
    if (trackedTxsRef.current.has(completeTxHash) || isProcessingRef.current) return;
    
    // Skip if transaction is already confirmed (we already have it from events)
    // We only need to track if it was added manually (from handleComplete)
    trackedTxsRef.current.add(completeTxHash);
    
    // Check if transaction is already confirmed
    const checkTransaction = async () => {
      try {
        const receipt = await publicClient.getTransactionReceipt({ hash: completeTxHash as `0x${string}` });
        
        // If already confirmed, no need to track
        if (receipt) {
          trackedTxsRef.current.delete(completeTxHash);
          return;
        }
        
        // Transaction is pending, wait for it
        isProcessingRef.current = true;
        const confirmedReceipt = await publicClient.waitForTransactionReceipt({ 
          hash: completeTxHash as `0x${string}`,
          timeout: 60000,
        });
        
        if (confirmedReceipt && confirmedReceipt.status === 'success') {
          // Transaction confirmed, update is already done via handleComplete
          // Just ensure UI is in sync
          if (updateTimeoutRef.current) {
            clearTimeout(updateTimeoutRef.current);
          }
          
          updateTimeoutRef.current = setTimeout(() => {
            onUpdate(swap);
            isProcessingRef.current = false;
          }, 500);
        } else {
          isProcessingRef.current = false;
        }
      } catch (err) {
        // Transaction might not exist yet or error occurred
        isProcessingRef.current = false;
        trackedTxsRef.current.delete(completeTxHash);
      }
    };
    
    checkTransaction();

    return () => {
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
      }
    };
  }, [completeTxHash, publicClient, onUpdate, swap]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
      }
    };
  }, []);
}

