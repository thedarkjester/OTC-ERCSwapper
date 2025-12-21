import { useState, useEffect, useCallback } from 'react';
import { useAccount, useChainId, usePublicClient } from 'wagmi';
import { type Address, zeroAddress, decodeEventLog } from 'viem';
import { 
  TOKEN_SWAPPER_ADDRESSES,
  TOKEN_SWAPPER_ABI,
} from '../config/contracts';
import { getCachedSwaps, saveCachedSwaps, getMaxBlockNumber, clearSwapCache } from '../utils/swapCache';
import { logger } from '../utils/logger';
import type { ParsedSwapEvent } from '../types';

function getHiddenSwapsKey(address: string): string {
  return `p2pswap_hidden_swaps_${address.toLowerCase()}`;
}

function getHiddenSwaps(address: string): Set<string> {
  if (!address) return new Set();
  try {
    const key = getHiddenSwapsKey(address);
    const stored = localStorage.getItem(key);
    return stored ? new Set(JSON.parse(stored)) : new Set();
  } catch {
    return new Set();
  }
}

function saveHiddenSwaps(address: string, swaps: Set<string>) {
  if (!address) return;
  try {
    const key = getHiddenSwapsKey(address);
    localStorage.setItem(key, JSON.stringify([...swaps]));
  } catch {
    logger.error('Failed to save hidden swaps');
  }
}

export function useSwapEvents() {
  const { address } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const [initiatedSwaps, setInitiatedSwaps] = useState<ParsedSwapEvent[]>([]);
  const [acceptableSwaps, setAcceptableSwaps] = useState<ParsedSwapEvent[]>([]);
  const [openSwaps, setOpenSwaps] = useState<ParsedSwapEvent[]>([]);
  const [completedSwaps, setCompletedSwaps] = useState<ParsedSwapEvent[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hiddenSwaps, setHiddenSwaps] = useState<Set<string>>(new Set());
  const [showHidden, setShowHidden] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);

  // Load hidden swaps when address changes
  useEffect(() => {
    if (address) {
      setHiddenSwaps(getHiddenSwaps(address));
    } else {
      setHiddenSwaps(new Set());
    }
  }, [address]);

  const contractAddress = TOKEN_SWAPPER_ADDRESSES[chainId] as Address | undefined;

  const hideSwap = useCallback((swapId: bigint) => {
    if (!address) return;
    const key = `${chainId}-${swapId.toString()}`;
    setHiddenSwaps(prev => {
      const next = new Set(prev);
      next.add(key);
      saveHiddenSwaps(address, next);
      return next;
    });
  }, [chainId, address]);

  const unhideSwap = useCallback((swapId: bigint) => {
    if (!address) return;
    const key = `${chainId}-${swapId.toString()}`;
    setHiddenSwaps(prev => {
      const next = new Set(prev);
      next.delete(key);
      saveHiddenSwaps(address, next);
      return next;
    });
  }, [chainId, address]);

  const isHidden = useCallback((swapId: bigint) => {
    const key = `${chainId}-${swapId.toString()}`;
    return hiddenSwaps.has(key);
  }, [chainId, hiddenSwaps]);

  const fetchSwaps = useCallback(async () => {
    if (!address || !contractAddress || !publicClient) return;
    
    setIsLoading(true);
    try {
      // Load cached swaps first
      const { swaps: cachedSwaps, lastBlock: cachedLastBlock } = getCachedSwaps(chainId, address);
      
      // Determine starting block: use cached last block + 1, or 0 if no cache
      const fromBlock = cachedLastBlock ? cachedLastBlock + 1n : 0n;
      
      logger.log(`Fetching swaps from block ${fromBlock} to latest (${cachedSwaps.length} cached swaps)`);
      
      // Note: We'll show cached swaps after filtering, but first we need to get removed/completed status
      // So we'll skip showing them immediately and show them after filtering
      
      // Extract event definitions from ABI
      const swapInitiatedEvent = TOKEN_SWAPPER_ABI.find(
        (item) => item.type === 'event' && item.name === 'SwapInitiated'
      );
      const swapRemovedEvent = TOKEN_SWAPPER_ABI.find(
        (item) => item.type === 'event' && item.name === 'SwapRemoved'
      );
      const swapCompleteEvent = TOKEN_SWAPPER_ABI.find(
        (item) => item.type === 'event' && item.name === 'SwapComplete'
      );

      if (!swapInitiatedEvent || !swapRemovedEvent || !swapCompleteEvent) {
        logger.error('Missing event definitions in ABI');
        setIsLoading(false);
        return;
      }

      // Get initiated swaps (where user is initiator)
      const initiatedLogs = await publicClient.getLogs({
        address: contractAddress,
        event: swapInitiatedEvent as any,
        args: {
          initiator: address,
        },
        fromBlock,
        toBlock: 'latest',
      });

      // Get swaps where user is explicitly the acceptor
      const acceptorLogs = await publicClient.getLogs({
        address: contractAddress,
        event: swapInitiatedEvent as any,
        args: {
          acceptor: address,
        },
        fromBlock,
        toBlock: 'latest',
      });

      // Get OPEN swaps (where acceptor is zero address - anyone can accept)
      const openLogs = await publicClient.getLogs({
        address: contractAddress,
        event: swapInitiatedEvent as any,
        args: {
          acceptor: zeroAddress,
        },
        fromBlock,
        toBlock: 'latest',
      });

      // Get removed swaps - ALWAYS query from block 0 to get all removals
      // This is necessary to filter out cached swaps that were removed
      const removedLogs = await publicClient.getLogs({
        address: contractAddress,
        event: swapRemovedEvent as any,
        fromBlock: 0n,
        toBlock: 'latest',
      });

      // Get completed swaps - ALWAYS query from block 0 to get all completions
      // This is necessary to filter out cached swaps that were completed
      const completedLogs = await publicClient.getLogs({
        address: contractAddress,
        event: swapCompleteEvent as any,
        fromBlock: 0n,
        toBlock: 'latest',
      });

      // Decode removed and completed logs to get swap IDs and transaction hashes
      const removedIds = new Set<string>();
      const completedIds = new Set<string>();
      const completeTxHashes = new Map<string, `0x${string}`>(); // swapId -> completeTransactionHash
      
      for (const log of removedLogs) {
        try {
          const decoded = decodeEventLog({
            abi: TOKEN_SWAPPER_ABI,
            data: log.data,
            topics: log.topics,
          });
          if (decoded.eventName === 'SwapRemoved' && decoded.args && 'swapId' in decoded.args) {
            removedIds.add(decoded.args.swapId?.toString() || '');
          }
          } catch (err) {
            logger.error('Error decoding SwapRemoved log:', err);
          }
        }
      
      for (const log of completedLogs) {
        try {
          const decoded = decodeEventLog({
            abi: TOKEN_SWAPPER_ABI,
            data: log.data,
            topics: log.topics,
          });
          if (decoded.eventName === 'SwapComplete' && decoded.args && 'swapId' in decoded.args) {
            const swapId = decoded.args.swapId?.toString() || '';
            completedIds.add(swapId);
            // Store the transaction hash for the complete transaction
            completeTxHashes.set(swapId, log.transactionHash);
          }
        } catch (err) {
          logger.error('Error decoding SwapComplete log:', err);
        }
      }
      
      // Separate cached swaps into active and completed
      // Update completeTransactionHash for completed cached swaps
      const activeCachedSwaps: ParsedSwapEvent[] = [];
      const completedCachedSwaps: ParsedSwapEvent[] = [];
      
      for (const cachedSwap of cachedSwaps) {
        const swapIdStr = cachedSwap.swapId.toString();
        
        if (removedIds.has(swapIdStr)) {
          // This swap was removed, exclude it completely
          continue;
        }
        
        // Check if completed: either in completedIds set OR has completeTransactionHash
        const isCompleted = completedIds.has(swapIdStr) || !!cachedSwap.completeTransactionHash;
        
        if (isCompleted) {
          // This swap is completed
          // Update completeTransactionHash if available from new logs
          if (completeTxHashes.has(swapIdStr)) {
            cachedSwap.completeTransactionHash = completeTxHashes.get(swapIdStr);
          }
          completedCachedSwaps.push(cachedSwap);
          continue;
        }
        
        // Check if expired
        if (cachedSwap.swap.expiryDate <= BigInt(Math.floor(Date.now() / 1000))) {
          // Expired, exclude from active
          continue;
        }
        
        // Active swap
        activeCachedSwaps.push(cachedSwap);
      }
      
      const filterActive = (logs: typeof initiatedLogs, excludeOwnInitiated = false) => {
        return logs
          .map(log => {
            try {
              const decoded = decodeEventLog({
                abi: TOKEN_SWAPPER_ABI,
                data: log.data,
                topics: log.topics,
              });
              
              if (decoded.eventName !== 'SwapInitiated' || !decoded.args || !('swapId' in decoded.args)) {
                return null;
              }
              
              const args = decoded.args as { swapId: bigint; initiator: Address; acceptor: Address; swap: any };
              const swapId = args.swapId?.toString();
              if (!swapId || removedIds.has(swapId) || completedIds.has(swapId)) return null;
              
              // For open swaps, exclude ones the user initiated themselves
              if (excludeOwnInitiated && address && args.initiator?.toLowerCase() === address.toLowerCase()) return null;
              
              const swapIdStr = args.swapId?.toString() || '';
              return {
                swapId: args.swapId!,
                initiator: args.initiator!,
                acceptor: args.acceptor!,
                swap: args.swap!,
                blockNumber: log.blockNumber,
                transactionHash: log.transactionHash,
                completeTransactionHash: completeTxHashes.get(swapIdStr),
              } as ParsedSwapEvent;
            } catch (err) {
              logger.error('Error decoding SwapInitiated log:', err);
              return null;
            }
          })
          .filter((swap): swap is ParsedSwapEvent => swap !== null)
          .filter(swap => swap.swap.expiryDate > BigInt(Math.floor(Date.now() / 1000)));
      };

      // Get completed swaps (for display in separate section)
      const getCompletedSwaps = (logs: typeof initiatedLogs, excludeOwnInitiated = false) => {
        return logs
          .map(log => {
            try {
              const decoded = decodeEventLog({
                abi: TOKEN_SWAPPER_ABI,
                data: log.data,
                topics: log.topics,
              });
              
              if (decoded.eventName !== 'SwapInitiated' || !decoded.args || !('swapId' in decoded.args)) {
                return null;
              }
              
              const args = decoded.args as { swapId: bigint; initiator: Address; acceptor: Address; swap: any };
              const swapId = args.swapId?.toString();
              // Only include if it's completed (not removed)
              if (!swapId || removedIds.has(swapId) || !completedIds.has(swapId)) return null;
              
              // For open swaps, exclude ones the user initiated themselves
              if (excludeOwnInitiated && address && args.initiator?.toLowerCase() === address.toLowerCase()) return null;
              
              const swapIdStr = args.swapId?.toString() || '';
              return {
                swapId: args.swapId!,
                initiator: args.initiator!,
                acceptor: args.acceptor!,
                swap: args.swap!,
                blockNumber: log.blockNumber,
                transactionHash: log.transactionHash,
                completeTransactionHash: completeTxHashes.get(swapIdStr),
              } as ParsedSwapEvent;
            } catch (err) {
              logger.error('Error decoding SwapInitiated log:', err);
              return null;
            }
          })
          .filter((swap): swap is ParsedSwapEvent => swap !== null);
      };

      // Get new swaps from queries
      const newInitiated = filterActive(initiatedLogs);
      const newAcceptable = filterActive(acceptorLogs);
      const newOpen = filterActive(openLogs, true);
      
      // Merge with cached swaps (deduplicate by swapId)
      const mergeSwaps = (cached: ParsedSwapEvent[], newSwaps: ParsedSwapEvent[]): ParsedSwapEvent[] => {
        const swapMap = new Map<string, ParsedSwapEvent>();
        
        // Add cached swaps first
        cached.forEach(swap => {
          const key = swap.swapId.toString();
          swapMap.set(key, swap);
        });
        
        // Add/update with new swaps (new swaps take precedence)
        newSwaps.forEach(swap => {
          const key = swap.swapId.toString();
          swapMap.set(key, swap);
        });
        
        return Array.from(swapMap.values());
      };
      
      // Filter active cached swaps by type
      const activeCachedInitiated = activeCachedSwaps.filter(s => 
        s.initiator.toLowerCase() === address.toLowerCase()
      );
      const activeCachedAcceptable = activeCachedSwaps.filter(s => 
        s.acceptor.toLowerCase() === address.toLowerCase() && s.acceptor !== zeroAddress
      );
      const activeCachedOpen = activeCachedSwaps.filter(s => 
        s.acceptor === zeroAddress && s.initiator.toLowerCase() !== address.toLowerCase()
      );
      
      // Merge swaps
      const mergedInitiated = mergeSwaps(activeCachedInitiated, newInitiated);
      const mergedAcceptable = mergeSwaps(activeCachedAcceptable, newAcceptable);
      const mergedOpen = mergeSwaps(activeCachedOpen, newOpen);
      
      // Sort pending swaps oldest first (by block number ascending)
      const sortedInitiated = mergedInitiated.sort((a, b) => 
        Number(a.blockNumber - b.blockNumber)
      );
      const sortedAcceptable = mergedAcceptable.sort((a, b) => 
        Number(a.blockNumber - b.blockNumber)
      );
      const sortedOpen = mergedOpen.sort((a, b) => 
        Number(a.blockNumber - b.blockNumber)
      );
      
      setInitiatedSwaps(sortedInitiated);
      setAcceptableSwaps(sortedAcceptable);
      setOpenSwaps(sortedOpen);
      
      // Get completed swaps - for swaps where user is initiator OR acceptor
      // Completed swaps should only show in "My Swaps", not in "Accept Swaps"
      const completedInitiated = getCompletedSwaps(initiatedLogs, false);
      const completedAccepted = getCompletedSwaps(acceptorLogs, false);
      
      // Also check open swaps that were completed by the user
      // Find SwapComplete events where user was the acceptor, then match with open swaps
      const completedOpenSwaps: ParsedSwapEvent[] = [];
      if (address) {
        // Create a map of swapId -> SwapInitiated event for all open swaps (from both cache and new logs)
        const openSwapsMap = new Map<string, { swap: ParsedSwapEvent; log?: typeof openLogs[0] }>();
        
        // Add cached open swaps (both active and completed, since completed open swaps should also be tracked)
        const allCachedOpen = [...activeCachedOpen, ...completedCachedSwaps.filter(s => s.acceptor === zeroAddress)];
        allCachedOpen.forEach(swap => {
          openSwapsMap.set(swap.swapId.toString(), { swap });
        });
        
        // Add new open swaps from logs
        for (const openLog of openLogs) {
          try {
            const decoded = decodeEventLog({
              abi: TOKEN_SWAPPER_ABI,
              data: openLog.data,
              topics: openLog.topics,
            });
            if (decoded.eventName === 'SwapInitiated' && decoded.args && 'swapId' in decoded.args) {
              const swapId = decoded.args.swapId?.toString();
              if (swapId) {
                const args = decoded.args as { swapId: bigint; initiator: Address; acceptor: Address; swap: any };
                const swap: ParsedSwapEvent = {
                  swapId: args.swapId!,
                  initiator: args.initiator!,
                  acceptor: args.acceptor!,
                  swap: args.swap!,
                  blockNumber: openLog.blockNumber,
                  transactionHash: openLog.transactionHash,
                };
                openSwapsMap.set(swapId, { swap, log: openLog });
              }
            }
          } catch (err) {
            // Skip invalid logs
          }
        }
        
        // Check SwapComplete events to find where user was the acceptor
        for (const log of completedLogs) {
          try {
            const decoded = decodeEventLog({
              abi: TOKEN_SWAPPER_ABI,
              data: log.data,
              topics: log.topics,
            });
            
            if (decoded.eventName === 'SwapComplete' && decoded.args && 'swapId' in decoded.args) {
              const args = decoded.args as { swapId: bigint; initiator: Address; acceptor: Address; swap: any };
              const swapId = args.swapId?.toString();
              
              // Check if user was the acceptor
              if (swapId && args.acceptor?.toLowerCase() === address.toLowerCase()) {
                // Check if this swap was originally an open swap
                const openSwapData = openSwapsMap.get(swapId);
                if (openSwapData) {
                  // This was an open swap that the user completed
                  completedOpenSwaps.push({
                    ...openSwapData.swap,
                    completeTransactionHash: log.transactionHash,
                  });
                }
              }
            }
          } catch (err) {
            logger.error('Error processing SwapComplete log:', err);
          }
        }
      }
      
      // Filter completed cached swaps to only include ones where user is initiator or acceptor
      const relevantCompletedCached = completedCachedSwaps.filter(cachedSwap => {
        const isInitiator = cachedSwap.initiator.toLowerCase() === address.toLowerCase();
        const isAcceptor = cachedSwap.acceptor.toLowerCase() === address.toLowerCase();
        const isOpenSwap = cachedSwap.acceptor === zeroAddress;
        // Include if user is initiator, explicit acceptor, or it's an open swap (anyone can complete)
        return isInitiator || isAcceptor || isOpenSwap;
      });
      
      // Combine and deduplicate by swapId (include cached completed swaps)
      const allCompleted = [...completedInitiated, ...completedAccepted, ...completedOpenSwaps, ...relevantCompletedCached];
      const uniqueCompleted = Array.from(
        new Map(allCompleted.map(s => [s.swapId.toString(), s])).values()
      );
      // Sort completed swaps newest first (by block number descending)
      const sortedCompleted = uniqueCompleted.sort((a, b) => 
        Number(b.blockNumber - a.blockNumber)
      );
      setCompletedSwaps(sortedCompleted);
      
      // Update cache with all swaps and last block number
      const allSwaps = [...sortedInitiated, ...sortedAcceptable, ...sortedOpen, ...sortedCompleted];
      const maxBlock = getMaxBlockNumber(allSwaps);
      
      if (maxBlock !== null) {
        // Use the maximum of cached block and new max block
        const finalBlock = cachedLastBlock && cachedLastBlock > maxBlock ? cachedLastBlock : maxBlock;
        saveCachedSwaps(chainId, address, allSwaps, finalBlock);
      } else if (cachedLastBlock !== null && allSwaps.length > 0) {
        // If no new swaps found but we have cached swaps, update cache with current state
        saveCachedSwaps(chainId, address, allSwaps, cachedLastBlock);
      }
    } catch (error) {
      logger.error('Error fetching swaps:', error);
      // On error, clear cache to force full refresh next time
      clearSwapCache(chainId, address);
    } finally {
      setIsLoading(false);
    }
  }, [address, chainId, contractAddress, publicClient]);

  useEffect(() => {
    fetchSwaps();
  }, [fetchSwaps]);

  // Filter out hidden swaps unless showHidden is true
  const filterHidden = useCallback((swaps: ParsedSwapEvent[]) => {
    if (showHidden) return swaps;
    return swaps.filter(s => !isHidden(s.swapId));
  }, [showHidden, isHidden]);

  // Function to add a swap from a transaction receipt
  const addSwapFromTx = useCallback(async (txHash: `0x${string}`, receipt?: any) => {
    if (!publicClient || !contractAddress) return null;

    try {
      // Use provided receipt or wait for it
      let txReceipt = receipt;
      if (!txReceipt) {
        txReceipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      }
      
      // Find SwapInitiated event in logs
      const swapInitiatedEvent = TOKEN_SWAPPER_ABI.find(
        (item) => item.type === 'event' && item.name === 'SwapInitiated'
      );
      
      if (!swapInitiatedEvent) {
        logger.error('SwapInitiated event not found in ABI');
        return null;
      }

      // Decode the event from receipt logs
      for (const log of txReceipt.logs) {
        if (log.address.toLowerCase() !== contractAddress.toLowerCase()) continue;
        
        try {
          const decoded = decodeEventLog({
            abi: TOKEN_SWAPPER_ABI,
            data: log.data,
            topics: log.topics,
          });
          
          if (decoded.eventName === 'SwapInitiated' && decoded.args && 'swapId' in decoded.args) {
            const args = decoded.args as { swapId: bigint; initiator: Address; acceptor: Address; swap: any };
            const newSwap: ParsedSwapEvent = {
              swapId: args.swapId!,
              initiator: args.initiator!,
              acceptor: args.acceptor!,
              swap: args.swap!,
              blockNumber: txReceipt.blockNumber,
              transactionHash: txHash,
            };

            logger.log('Adding swap from transaction:', newSwap);

            // Add to appropriate list based on user's role
            if (address && args.initiator?.toLowerCase() === address.toLowerCase()) {
              // User is initiator - add to initiatedSwaps
              setInitiatedSwaps(prev => {
                // Check if already exists
                if (prev.some(s => s.swapId === newSwap.swapId)) {
                  logger.log('Swap already exists in initiatedSwaps, skipping');
                  return prev;
                }
                // Insert in sorted order (oldest first)
                const updated = [...prev, newSwap];
                return updated.sort((a, b) => Number(a.blockNumber - b.blockNumber));
              });
            } else if (address && args.acceptor?.toLowerCase() === address.toLowerCase() && args.acceptor !== zeroAddress) {
              // User is acceptor - add to acceptableSwaps
              setAcceptableSwaps(prev => {
                if (prev.some(s => s.swapId === newSwap.swapId)) {
                  logger.log('Swap already exists in acceptableSwaps, skipping');
                  return prev;
                }
                const updated = [...prev, newSwap];
                return updated.sort((a, b) => Number(a.blockNumber - b.blockNumber));
              });
            } else if (args.acceptor === zeroAddress) {
              // Open swap - add to openSwaps (if user is not initiator)
              if (address && args.initiator?.toLowerCase() !== address.toLowerCase()) {
                setOpenSwaps(prev => {
                  if (prev.some(s => s.swapId === newSwap.swapId)) {
                    logger.log('Swap already exists in openSwaps, skipping');
                    return prev;
                  }
                  const updated = [...prev, newSwap];
                  return updated.sort((a, b) => Number(a.blockNumber - b.blockNumber));
                });
              }
            }

            logger.log('Swap added successfully:', newSwap.swapId.toString());
            
            // Update cache after state updates (use setTimeout to ensure state is updated)
            setTimeout(() => {
              // Get current state from the setters - we'll update cache in the next fetch
              // For now, just trigger a refetch which will update the cache
              fetchSwaps();
            }, 100);
            
            return newSwap;
          }
        } catch (err) {
          // Not the event we're looking for, continue
          logger.log('Error decoding log (not SwapInitiated):', err);
          continue;
        }
      }
      
      logger.warn('No SwapInitiated event found in transaction receipt');
      return null;
    } catch (err) {
      logger.error('Error adding swap from transaction:', err);
      return null;
    }
  }, [publicClient, contractAddress, address, chainId, fetchSwaps]);

  // Function to update a single swap (for transaction tracking)
  const updateSwap = useCallback((updatedSwap: ParsedSwapEvent) => {
    const swapIdStr = updatedSwap.swapId.toString();
    
    // Update in initiated swaps
    setInitiatedSwaps(prev => {
      const index = prev.findIndex(s => s.swapId.toString() === swapIdStr);
      if (index >= 0) {
        const updated = [...prev];
        updated[index] = updatedSwap;
        return updated;
      }
      return prev;
    });
    
    // Update in acceptable swaps
    setAcceptableSwaps(prev => {
      const index = prev.findIndex(s => s.swapId.toString() === swapIdStr);
      if (index >= 0) {
        const updated = [...prev];
        updated[index] = updatedSwap;
        return updated;
      }
      return prev;
    });
    
    // Update in open swaps
    setOpenSwaps(prev => {
      const index = prev.findIndex(s => s.swapId.toString() === swapIdStr);
      if (index >= 0) {
        const updated = [...prev];
        updated[index] = updatedSwap;
        return updated;
      }
      return prev;
    });
    
    // Update in completed swaps
    setCompletedSwaps(prev => {
      const index = prev.findIndex(s => s.swapId.toString() === swapIdStr);
      if (index >= 0) {
        const updated = [...prev];
        updated[index] = updatedSwap;
        return updated;
      }
      return prev;
    });
  }, []);

  // Separate active and completed swaps
  const activeInitiated = filterHidden(initiatedSwaps);
  const activeAcceptable = filterHidden(acceptableSwaps);
  const activeOpen = filterHidden(openSwaps);
  const activeCompleted = filterHidden(completedSwaps);

  return {
    // Active (pending) swaps
    initiatedSwaps: activeInitiated,
    acceptableSwaps: activeAcceptable,
    openSwaps: activeOpen,
    // Completed swaps
    completedSwaps: activeCompleted,
    // All swaps (unfiltered) for counting
    allInitiatedSwaps: initiatedSwaps,
    allAcceptableSwaps: acceptableSwaps,
    allOpenSwaps: openSwaps,
    isLoading,
    refetch: fetchSwaps,
    updateSwap,
    addSwapFromTx,
    hideSwap,
    unhideSwap,
    isHidden,
    showHidden,
    setShowHidden,
    showCompleted,
    setShowCompleted,
    hiddenCount: initiatedSwaps.filter(s => isHidden(s.swapId)).length +
                 acceptableSwaps.filter(s => isHidden(s.swapId)).length +
                 openSwaps.filter(s => isHidden(s.swapId)).length +
                 completedSwaps.filter(s => isHidden(s.swapId)).length, // Only counts for initiator
  };
}
