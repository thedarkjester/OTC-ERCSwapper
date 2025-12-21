import { useState, useEffect, useRef } from 'react';
import { formatEther, zeroAddress, type Address, isAddress, isHex } from 'viem';
import { format } from 'date-fns';
import { useWatchPendingTransactions, useChainId, useAccount, usePublicClient } from 'wagmi';
import { 
  ArrowRight, 
  Clock, 
  User, 
  CheckCircle, 
  XCircle, 
  Loader2,
  AlertCircle,
  EyeOff,
  Eye,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { TokenType, TOKEN_TYPE_LABELS, ERC20_ABI, ERC721_ABI, ERC1155_ABI, TOKEN_SWAPPER_ADDRESSES, type Swap, type SwapStatus } from '../config/contracts';
import { useSwapContract } from '../hooks/useSwapContract';
import { useTokenApproval } from '../hooks/useTokenApproval';
import { useSwapTransactionTracking } from '../hooks/useSwapTransactionTracking';
import { useToastContext } from '../contexts/ToastContext';
import { TokenInfo } from './TokenInfo';
import { logger } from '../utils/logger';
import type { ParsedSwapEvent } from '../types';

interface SwapCardProps {
  swapEvent: ParsedSwapEvent;
  mode: 'initiator' | 'acceptor';
  onAction?: () => void;
  onUpdate?: (updatedSwap: ParsedSwapEvent) => void;
  onHide?: () => void;
  onUnhide?: () => void;
  isHidden?: boolean;
  isCompleted?: boolean;
}

// Valid chain IDs
const VALID_CHAIN_IDS = [1, 11155111, 59144, 59141];

// Helper to get explorer URL for transaction
function getExplorerTxUrl(chainId: number, txHash: string): string {
  // Validate chain ID
  if (!VALID_CHAIN_IDS.includes(chainId)) {
    logger.error('Invalid chain ID:', chainId);
    return '#';
  }
  
  // Validate transaction hash format
  if (!isHex(txHash) || txHash.length !== 66) {
    logger.error('Invalid transaction hash:', txHash);
    return '#';
  }
  
  // Sanitize for URL usage
  const sanitized = encodeURIComponent(txHash);
  const explorers: Record<number, string> = {
    1: `https://etherscan.io/tx/${sanitized}`, // Ethereum Mainnet
    11155111: `https://sepolia.etherscan.io/tx/${sanitized}`, // Sepolia
    59144: `https://lineascan.build/tx/${sanitized}`, // Linea Mainnet
    59141: `https://sepolia.lineascan.build/tx/${sanitized}`, // Linea Sepolia
  };
  return explorers[chainId] || `https://etherscan.io/tx/${sanitized}`;
}

// Helper to get explorer URL for address
function getExplorerAddressUrl(chainId: number, address: string): string {
  // Validate chain ID
  if (!VALID_CHAIN_IDS.includes(chainId)) {
    logger.error('Invalid chain ID:', chainId);
    return '#';
  }
  
  // Validate address
  if (!isAddress(address)) {
    logger.error('Invalid address:', address);
    return '#';
  }
  
  // Sanitize for URL usage
  const sanitized = encodeURIComponent(address);
  const explorers: Record<number, string> = {
    1: `https://etherscan.io/address/${sanitized}`, // Ethereum Mainnet
    11155111: `https://sepolia.etherscan.io/address/${sanitized}`, // Sepolia
    59144: `https://lineascan.build/address/${sanitized}`, // Linea Mainnet
    59141: `https://sepolia.lineascan.build/address/${sanitized}`, // Linea Sepolia
  };
  return explorers[chainId] || `https://etherscan.io/address/${sanitized}`;
}

export function SwapCard({ swapEvent, mode, onAction, onUpdate, onHide, onUnhide, isHidden = false, isCompleted = false }: SwapCardProps) {
  const chainId = useChainId();
  const { address: currentUserAddress } = useAccount();
  const publicClient = usePublicClient();
  const { showToast, updateToast } = useToastContext();
  const [localSwap, setLocalSwap] = useState<ParsedSwapEvent>(swapEvent);
  const { swapId, swap } = localSwap;
  
  // Update local swap when prop changes
  useEffect(() => {
    setLocalSwap(swapEvent);
  }, [swapEvent]);

  // Reset collapsed state when isCompleted changes
  useEffect(() => {
    if (isCompleted) {
      setIsCollapsed(true);
    }
  }, [isCompleted]);

  // Fetch completion time for completed swaps
  useEffect(() => {
    if (isCompleted && localSwap.completeTransactionHash && publicClient) {
      const fetchCompletionTime = async () => {
        try {
          const receipt = await publicClient.getTransactionReceipt({
            hash: localSwap.completeTransactionHash!,
          });
          const block = await publicClient.getBlock({
            blockNumber: receipt.blockNumber,
          });
          const time = format(new Date(Number(block.timestamp) * 1000), 'MMM d, yyyy HH:mm');
          setCompletionTime(time);
        } catch (error) {
          logger.error('Error fetching completion time:', error);
          setCompletionTime(null);
        }
      };
      fetchCompletionTime();
    } else {
      setCompletionTime(null);
    }
  }, [isCompleted, localSwap.completeTransactionHash, publicClient]);
  
  // Track transactions in background and update swap when they complete
  useSwapTransactionTracking({
    swap: localSwap,
    onUpdate: (updatedSwap) => {
      setLocalSwap(updatedSwap);
      onUpdate?.(updatedSwap);
    },
  });
  const { 
    removeSwap, 
    completeSwap, 
    getSwapStatus, 
    isPending, 
    isConfirming
  } = useSwapContract();
  const { approve, isPending: isApproving } = useTokenApproval();
  
  const [status, setStatus] = useState<SwapStatus | null>(null);
  const [isLoadingStatus, setIsLoadingStatus] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [needsApproval, setNeedsApproval] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [showTransactions, setShowTransactions] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(isCompleted);
  const [pendingApprovalTx, setPendingApprovalTx] = useState<`0x${string}` | null>(null);
  const [completionTime, setCompletionTime] = useState<string | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastStatusRef = useRef<string | null>(null);
  const refreshTriggeredRef = useRef<boolean>(false);
  const pendingTxRef = useRef<Set<string>>(new Set());
  const isInitialLoadRef = useRef<boolean>(true);
  const fetchStatusTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const fetchingRef = useRef<boolean>(false);

  const isExpired = Number(swap.expiryDate) * 1000 < Date.now();
  const isOpen = swap.acceptor === zeroAddress;
  const isInitiator = currentUserAddress?.toLowerCase() === swap.initiator.toLowerCase();
  const isExplicitAcceptor = currentUserAddress?.toLowerCase() === swap.acceptor.toLowerCase();

  const fetchStatus = async () => {
    // Prevent concurrent calls
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    // Skip status check for completed swaps - they're already completed
    if (isCompleted) {
      setIsLoadingStatus(false);
      return;
    }

    try {
      // Always use the original swap struct (contract checks hash, can't modify)
      const swapStatus = await getSwapStatus(swapId, swap as Swap);
      
      // If status is null, the swap is completed or doesn't exist
      if (swapStatus === null) {
        setStatus(null);
        setIsLoadingStatus(false);
        // Stop polling if swap is completed
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current);
          pollingIntervalRef.current = null;
        }
        return;
      }
      
      // For open swaps viewed as acceptor, check user's status separately
      // because contract checks against zero address, not the user's address
      let acceptorNeedsToOwnToken = swapStatus.acceptorNeedsToOwnToken;
      let acceptorTokenRequiresApproval = swapStatus.acceptorTokenRequiresApproval;
      
      if (isOpen && mode === 'acceptor' && currentUserAddress && publicClient) {
        const contractAddress = TOKEN_SWAPPER_ADDRESSES[chainId] as Address | undefined;
        
        // Check user's token ownership/approval separately
        try {
          if (swap.acceptorTokenType === TokenType.ERC20 || swap.acceptorTokenType === TokenType.ERC777) {
            // Check balance
            const balance = await publicClient.readContract({
              address: swap.acceptorERCContract as Address,
              abi: ERC20_ABI,
              functionName: 'balanceOf',
              args: [currentUserAddress],
            }) as bigint;
            acceptorNeedsToOwnToken = balance < swap.acceptorTokenQuantity;
            
            // Check approval
            if (contractAddress) {
              const allowance = await publicClient.readContract({
                address: swap.acceptorERCContract as Address,
                abi: ERC20_ABI,
                functionName: 'allowance',
                args: [currentUserAddress, contractAddress],
              }) as bigint;
              acceptorTokenRequiresApproval = allowance < swap.acceptorTokenQuantity;
            }
          } else if (swap.acceptorTokenType === TokenType.ERC721) {
            // Check ownership
            const owner = await publicClient.readContract({
              address: swap.acceptorERCContract as Address,
              abi: ERC721_ABI,
              functionName: 'ownerOf',
              args: [swap.acceptorTokenId],
            }) as Address;
            acceptorNeedsToOwnToken = owner.toLowerCase() !== currentUserAddress.toLowerCase();
            
            // Check approval
            if (contractAddress) {
              const [approved, isApprovedForAll] = await Promise.all([
                publicClient.readContract({
                  address: swap.acceptorERCContract as Address,
                  abi: ERC721_ABI,
                  functionName: 'getApproved',
                  args: [swap.acceptorTokenId],
                }),
                publicClient.readContract({
                  address: swap.acceptorERCContract as Address,
                  abi: ERC721_ABI,
                  functionName: 'isApprovedForAll',
                  args: [currentUserAddress, contractAddress],
                }),
              ]);
              acceptorTokenRequiresApproval = approved !== contractAddress && !(isApprovedForAll as boolean);
            }
          } else if (swap.acceptorTokenType === TokenType.ERC1155) {
            // Check balance
            const balance = await publicClient.readContract({
              address: swap.acceptorERCContract as Address,
              abi: ERC1155_ABI,
              functionName: 'balanceOf',
              args: [currentUserAddress, swap.acceptorTokenId],
            }) as bigint;
            acceptorNeedsToOwnToken = balance < swap.acceptorTokenQuantity;
            
            // Check approval
            if (contractAddress) {
              const isApprovedForAll = await publicClient.readContract({
                address: swap.acceptorERCContract as Address,
                abi: ERC1155_ABI,
                functionName: 'isApprovedForAll',
                args: [currentUserAddress, contractAddress],
              });
              acceptorTokenRequiresApproval = !(isApprovedForAll as boolean);
            }
          }
        } catch (err) {
          logger.error('Error checking user status for open swap:', err);
          // Keep original values on error
        }
      }
      
      // Recalculate readiness
      const isUserReady = !swapStatus.initiatorNeedsToOwnToken &&
                         !swapStatus.initiatorTokenRequiresApproval &&
                         !acceptorNeedsToOwnToken &&
                         !acceptorTokenRequiresApproval;
      
      // Create corrected status object
      const correctedStatus: SwapStatus = {
        initiatorNeedsToOwnToken: swapStatus.initiatorNeedsToOwnToken,
        initiatorTokenRequiresApproval: swapStatus.initiatorTokenRequiresApproval,
        acceptorNeedsToOwnToken,
        acceptorTokenRequiresApproval,
        isReadyForSwapping: isUserReady,
      };
      
      // Check if status changed
      const statusKey = JSON.stringify({
        initiatorNeedsToOwnToken: swapStatus.initiatorNeedsToOwnToken,
        initiatorTokenRequiresApproval: swapStatus.initiatorTokenRequiresApproval,
        acceptorNeedsToOwnToken,
        acceptorTokenRequiresApproval,
        isReadyForSwapping: isUserReady,
      });
      
      const statusChanged = lastStatusRef.current !== statusKey;
      const wasReady = lastStatusRef.current ? JSON.parse(lastStatusRef.current).isReadyForSwapping : false;
      const isNowReady = isUserReady;
      lastStatusRef.current = statusKey;
      
      setStatus(correctedStatus);
      
      // Set needsApproval based on mode
      if (mode === 'acceptor') {
        setNeedsApproval(acceptorTokenRequiresApproval);
      } else if (mode === 'initiator') {
        setNeedsApproval(swapStatus.initiatorTokenRequiresApproval);
      }
      
      // If status changed from not-ready to ready, trigger refresh callback ONCE
      // Skip on initial load to prevent flickering
      if (!isInitialLoadRef.current && statusChanged && !wasReady && isNowReady && !refreshTriggeredRef.current) {
        refreshTriggeredRef.current = true;
        // Debounce the callback to prevent rapid refreshes
        if (fetchStatusTimeoutRef.current) {
          clearTimeout(fetchStatusTimeoutRef.current);
        }
        fetchStatusTimeoutRef.current = setTimeout(() => {
          onAction?.();
        }, 500);
      }
      
      // Mark initial load as complete after first successful fetch
      if (isInitialLoadRef.current) {
        isInitialLoadRef.current = false;
      }
    } catch (err) {
      // Only log unexpected errors, not the expected SwapCompleteOrDoesNotExist
      const errorMessage = err instanceof Error ? err.message : String(err);
      if (!errorMessage.includes('SwapCompleteOrDoesNotExist')) {
        logger.error('Error fetching status:', err);
      }
      setStatus(null);
    } finally {
      setIsLoadingStatus(false);
      fetchingRef.current = false;
    }
  };

  // Watch for pending transactions to refresh status when they complete
  // Only watch for transactions related to this specific swap
  useWatchPendingTransactions({
    onTransactions(transactions) {
      if (isCompleted || isExpired || isInitialLoadRef.current) return;
      
      // Only process if there are actually pending transactions
      if (!transactions || transactions.length === 0) return;
      
      // Track which transactions we've already processed
      const newTransactions = transactions.filter(tx => tx && !pendingTxRef.current.has(tx));
      
      // If there are new pending transactions, refresh status when they complete
      if (newTransactions.length > 0) {
        // Add to tracking set
        newTransactions.forEach(tx => {
          if (tx) pendingTxRef.current.add(tx);
        });
        
        // Clear any existing timeout
        if (fetchStatusTimeoutRef.current) {
          clearTimeout(fetchStatusTimeoutRef.current);
        }
        
        // Refresh status after a short delay to allow transaction to be mined
        fetchStatusTimeoutRef.current = setTimeout(() => {
          fetchStatus();
          // Remove from tracking after a delay to allow re-processing if needed
          setTimeout(() => {
            newTransactions.forEach(tx => {
              if (tx) pendingTxRef.current.delete(tx);
            });
          }, 15000);
        }, 3000);
      }
    },
  });

  useEffect(() => {
    // Reset refresh trigger when swap changes
    refreshTriggeredRef.current = false;
    pendingTxRef.current.clear();
    isInitialLoadRef.current = true;
    
    // Clear any pending timeouts
    if (fetchStatusTimeoutRef.current) {
      clearTimeout(fetchStatusTimeoutRef.current);
      fetchStatusTimeoutRef.current = null;
    }
    
    // Initial fetch
    fetchStatus();
    
    // Skip polling for completed or expired swaps
    if (isCompleted || isExpired) {
      return;
    }
    
    // Poll status every 10 seconds for pending swaps
    pollingIntervalRef.current = setInterval(() => {
      fetchStatus();
    }, 10000);
    
    // Cleanup interval and timeouts on unmount
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
      if (fetchStatusTimeoutRef.current) {
        clearTimeout(fetchStatusTimeoutRef.current);
        fetchStatusTimeoutRef.current = null;
      }
    };
  }, [swapId, swap, getSwapStatus, mode, isCompleted, isExpired, isOpen, currentUserAddress, chainId, publicClient]);

  const handleRemove = async () => {
    if (!publicClient) return;
    
    // Verify authorization - only initiator can remove
    if (!isInitiator) {
      showToast('Unauthorized: Only the swap initiator can cancel this swap', 'error');
      return;
    }
    
    let pendingToastId: string | null = null;
    try {
      setIsRemoving(true);
      setError(null);
      pendingToastId = showToast('Cancelling swap...', 'pending');
      const txHash = await removeSwap(swapId, swap as Swap);
      
      if (txHash) {
        const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
        // Update pending toast to success/error
        if (receipt.status === 'success') {
          updateToast(pendingToastId, {
            message: 'Swap cancelled successfully',
            type: 'success',
            txHash,
          });
          onAction?.(); // Refresh list to remove the swap
        } else {
          updateToast(pendingToastId, {
            message: 'Cancel transaction failed',
            type: 'error',
            txHash,
          });
        }
      } else {
        updateToast(pendingToastId, {
          message: 'Swap cancelled',
          type: 'success',
        });
        onAction?.();
      }
    } catch (err: unknown) {
      // Check for user rejection in multiple ways
      const errorMessage = err instanceof Error ? err.message : String(err);
      const errorString = errorMessage.toLowerCase();
      const isUserRejection = err instanceof Error && (
        errorString.includes('user rejected') ||
        errorString.includes('user denied') ||
        errorString.includes('denied transaction signature') ||
        errorString.includes('rejected the request') ||
        errorString.includes('user rejected the request')
      );
      
      if (isUserRejection) {
        // Don't set error or log for user rejections - just show toast
        if (pendingToastId) {
          updateToast(pendingToastId, {
            message: 'Cancel was rejected',
            type: 'error',
          });
        } else {
          showToast('Cancel was rejected', 'error');
        }
      } else {
        // For non-rejection errors, show a clean error message (limit length)
        const cleanMessage = errorMessage.length > 200 ? errorMessage.slice(0, 200) + '...' : errorMessage;
        setError(cleanMessage);
        if (pendingToastId) {
          updateToast(pendingToastId, {
            message: 'Cancel failed',
            type: 'error',
          });
        }
      }
    } finally {
      setIsRemoving(false);
    }
  };

  const handleApprove = async () => {
    if (!publicClient) return;
    
    let pendingToastId: string | null = null;
    try {
      setError(null);
      pendingToastId = showToast('Approving tokens...', 'pending');
      
      // Determine which token to approve based on mode
      const tokenType = mode === 'initiator' ? swap.initiatorTokenType : swap.acceptorTokenType;
      const tokenAddress = mode === 'initiator' ? swap.initiatorERCContract : swap.acceptorERCContract;
      const tokenId = mode === 'initiator' ? swap.initiatorTokenId : swap.acceptorTokenId;
      const tokenQuantity = mode === 'initiator' ? swap.initiatorTokenQuantity : swap.acceptorTokenQuantity;
      
      const txHash = await approve(
        tokenType,
        tokenAddress as Address,
        tokenId,
        tokenQuantity
      );
      
      if (txHash) {
        setPendingApprovalTx(txHash);
        const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
        setPendingApprovalTx(null);
        
        // Update pending toast to success/error
        if (receipt.status === 'success') {
          updateToast(pendingToastId, {
            message: 'Tokens approved successfully!',
            type: 'success',
            txHash,
          });
          setNeedsApproval(false);
          // Refresh status immediately to reflect the approval
          setTimeout(() => fetchStatus(), 1000);
        } else {
          updateToast(pendingToastId, {
            message: 'Approval transaction failed',
            type: 'error',
            txHash,
          });
        }
      } else {
        updateToast(pendingToastId, {
          message: 'Approval completed',
          type: 'success',
        });
        setNeedsApproval(false);
        // Refresh status immediately to reflect the approval
        setTimeout(() => fetchStatus(), 1000);
      }
    } catch (err: unknown) {
      setPendingApprovalTx(null);
      // Check for user rejection in multiple ways
      const errorMessage = err instanceof Error ? err.message : String(err);
      const errorString = errorMessage.toLowerCase();
      const isUserRejection = err instanceof Error && (
        errorString.includes('user rejected') ||
        errorString.includes('user denied') ||
        errorString.includes('denied transaction signature') ||
        errorString.includes('rejected the request') ||
        errorString.includes('user rejected the request')
      );
      
      if (isUserRejection) {
        // Don't set error or log for user rejections - just show toast
        if (pendingToastId) {
          updateToast(pendingToastId, {
            message: 'Approval was rejected',
            type: 'error',
          });
        } else {
          showToast('Approval was rejected', 'error');
        }
      } else {
        // For non-rejection errors, show a clean error message (limit length)
        const cleanMessage = errorMessage.length > 200 ? errorMessage.slice(0, 200) + '...' : errorMessage;
        setError(cleanMessage);
        if (pendingToastId) {
          updateToast(pendingToastId, {
            message: 'Approval failed',
            type: 'error',
          });
        }
      }
    }
    // Note: isApproving from useTokenApproval hook handles the disabled state
  };

  const handleComplete = async () => {
    if (!publicClient) return;
    
    // Verify authorization
    if (!isInitiator && !isExplicitAcceptor && !isOpen) {
      showToast('Unauthorized: You are not authorized to complete this swap', 'error');
      return;
    }
    
    // Additional check: verify current approval status
    if (needsApproval) {
      showToast('Approval required before completing swap', 'error');
      return;
    }
    
    let pendingToastId: string | null = null;
    try {
      setIsCompleting(true);
      setError(null);
      pendingToastId = showToast('Completing swap...', 'pending');
      // For open swaps, we MUST use the original swap struct (with zero address)
      // because the contract verifies the swap hash matches what was stored
      // The contract allows anyone to complete if acceptor is zero address (line 187 in contract)
      const swapToComplete = swap as Swap;
      const txHash = await completeSwap(swapId, swapToComplete);
      
      if (txHash) {
        // Update swap with the new transaction hash immediately
        if (!localSwap.completeTransactionHash) {
          const updatedSwap: ParsedSwapEvent = {
            ...localSwap,
            completeTransactionHash: txHash,
          };
          setLocalSwap(updatedSwap);
          onUpdate?.(updatedSwap);
        }
        
        // Wait for transaction receipt
        const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
        // Update pending toast to success/error
        if (receipt.status === 'success') {
          updateToast(pendingToastId, {
            message: 'Swap completed successfully!',
            type: 'success',
            txHash,
          });
          // Remove swap from list by calling onAction to refresh
          onAction?.();
        } else {
          updateToast(pendingToastId, {
            message: 'Complete swap transaction failed',
            type: 'error',
            txHash,
          });
        }
      } else {
        updateToast(pendingToastId, {
          message: 'Swap completed',
          type: 'success',
        });
        onAction?.();
      }
    } catch (err: unknown) {
      // Check for user rejection in multiple ways
      const errorMessage = err instanceof Error ? err.message : String(err);
      const errorString = errorMessage.toLowerCase();
      const isUserRejection = err instanceof Error && (
        errorString.includes('user rejected') ||
        errorString.includes('user denied') ||
        errorString.includes('denied transaction signature') ||
        errorString.includes('rejected the request') ||
        errorString.includes('user rejected the request')
      );
      
      if (isUserRejection) {
        // Don't set error or log for user rejections - just show toast
        if (pendingToastId) {
          updateToast(pendingToastId, {
            message: 'Complete swap was rejected',
            type: 'error',
          });
        } else {
          showToast('Complete swap was rejected', 'error');
        }
      } else {
        // For non-rejection errors, show a clean error message (limit length)
        const cleanMessage = errorMessage.length > 200 ? errorMessage.slice(0, 200) + '...' : errorMessage;
        setError(cleanMessage);
        if (pendingToastId) {
          updateToast(pendingToastId, {
            message: 'Complete swap failed',
            type: 'error',
          });
        }
      }
    } finally {
      setIsCompleting(false);
    }
  };

  const truncateAddress = (addr: string) => {
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  const formatTokenInfo = (
    tokenType: number,
    contract: string,
    tokenId: bigint,
    quantity: bigint,
    ethPortion: bigint
  ) => {
    const parts = [];
    
    if (tokenType !== TokenType.NONE) {
      const typeLabel = TOKEN_TYPE_LABELS[tokenType];
      if (tokenType === TokenType.ERC721) {
        parts.push(`${typeLabel} #${tokenId.toString()}`);
      } else if (tokenType === TokenType.ERC1155) {
        parts.push(`${quantity.toString()}x ${typeLabel} #${tokenId.toString()}`);
      } else {
        parts.push(`${quantity.toString()} ${typeLabel}`);
      }
      parts.push(truncateAddress(contract));
    }
    
    if (ethPortion > 0n) {
      parts.push(`${formatEther(ethPortion)} ETH`);
    }
    
    return parts.length > 0 ? parts : ['Nothing'];
  };

  return (
    <div className={`swap-card ${isExpired ? 'expired' : ''} ${isCompleted ? 'completed' : ''} ${isHidden ? 'hidden' : ''}`}>
      {error && (
        <div className="error-banner small">
          <AlertCircle size={14} />
          {error}
        </div>
      )}

      <div 
        className={`swap-card-header ${isCompleted ? 'swap-card-header-clickable' : ''}`}
        onClick={isCompleted ? () => setIsCollapsed(!isCollapsed) : undefined}
      >
        <div className="swap-id-container">
          <span className="swap-id">#{swapId.toString()}</span>
          {isCompleted && completionTime && (
            <span className="swap-completion-time">{completionTime}</span>
          )}
        </div>
        <div className="swap-badges">
          {isCompleted && (
            <>
              {onUnhide && isHidden ? (
                <button 
                  className="btn btn-icon btn-sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    onUnhide();
                  }}
                  title="Unhide this swap"
                >
                  <Eye size={14} />
                </button>
              ) : onHide && !isHidden ? (
                <button 
                  className="btn btn-icon btn-sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    onHide();
                  }}
                  title="Hide this swap"
                >
                  <EyeOff size={14} />
                </button>
              ) : null}
              <span className="badge badge-completed">Completed</span>
              {isCollapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
            </>
          )}
          {isOpen && !isCompleted && <span className="badge badge-open">Open</span>}
          {isExpired && !isCompleted && <span className="badge badge-expired">Expired</span>}
          {!isExpired && !isCompleted && status?.isReadyForSwapping && (
            <span className="badge badge-ready">Ready</span>
          )}
          {!isCompleted && !status?.isReadyForSwapping && status && (
            <span className="badge badge-pending">Pending</span>
          )}
        </div>
      </div>

      {!isCollapsed && (
        <>
      <div className="swap-card-content">
        <div className="swap-party">
          <div className="party-label">
            <User size={14} />
            Initiator
          </div>
          <div className="party-address">
            <a 
              href={getExplorerAddressUrl(chainId, swap.initiator)}
              target="_blank"
              rel="noopener noreferrer"
              className="address-link"
            >
              {truncateAddress(swap.initiator)}
            </a>
          </div>
          <div className="party-tokens">
            {formatTokenInfo(
              swap.initiatorTokenType,
              swap.initiatorERCContract,
              swap.initiatorTokenId,
              swap.initiatorTokenQuantity,
              swap.initiatorETHPortion
            ).map((part, i) => (
              <span key={i} className="token-part">{part}</span>
            ))}
          </div>
        </div>

        <div className="swap-arrow-vertical">
          <ArrowRight size={20} />
        </div>

        <div className="swap-party swap-party-acceptor">
          <div className="party-label">
            <User size={14} />
            Acceptor
          </div>
          <div className="party-address">
            {isOpen ? (
              'Anyone (Open Swap)'
            ) : (
              <a 
                href={getExplorerAddressUrl(chainId, swap.acceptor)}
                target="_blank"
                rel="noopener noreferrer"
                className="address-link"
              >
                {truncateAddress(swap.acceptor)}
              </a>
            )}
          </div>
          <div className="party-tokens">
            {formatTokenInfo(
              swap.acceptorTokenType,
              swap.acceptorERCContract,
              swap.acceptorTokenId,
              swap.acceptorTokenQuantity,
              swap.acceptorETHPortion
            ).map((part, i) => (
              <span key={i} className="token-part">{part}</span>
            ))}
          </div>
        </div>
      </div>

      {/* Acceptor Details Block - Horizontal Layout */}
      <div className="swap-acceptor-details">
        <div className="acceptor-details-content-horizontal">
          <div className="acceptor-details-item">
            <span className="acceptor-label">Address:</span>
            {isOpen ? (
              <span className="acceptor-value">Anyone (Open Swap)</span>
            ) : (
              <a 
                href={getExplorerAddressUrl(chainId, swap.acceptor)}
                target="_blank"
                rel="noopener noreferrer"
                className="acceptor-value address-link"
              >
                {truncateAddress(swap.acceptor)}
              </a>
            )}
          </div>
          <div className="acceptor-details-item">
            <Clock size={14} />
            <span className="acceptor-label">Expires:</span>
            <span className="acceptor-value">
              {format(new Date(Number(swap.expiryDate) * 1000), 'MMM d, yyyy HH:mm')}
            </span>
          </div>
        </div>
      </div>

      {/* Expandable Token Details */}
      <button 
        className="swap-details-toggle"
        onClick={() => setShowDetails(!showDetails)}
      >
        {showDetails ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        {showDetails ? 'Hide Details' : 'View Token Details'}
      </button>

      {showDetails && (
        <div className="swap-details-expanded">
          {swap.initiatorTokenType !== TokenType.NONE && (
            <div className="detail-section">
              <h4>Initiator's Token</h4>
              <TokenInfo
                tokenAddress={swap.initiatorERCContract}
                tokenType={swap.initiatorTokenType}
                tokenId={swap.initiatorTokenId.toString()}
                quantity={swap.initiatorTokenQuantity.toString()}
              />
            </div>
          )}
          
          {swap.acceptorTokenType !== TokenType.NONE && (
            <div className="detail-section">
              <h4>Acceptor's Token</h4>
              <TokenInfo
                tokenAddress={swap.acceptorERCContract}
                tokenType={swap.acceptorTokenType}
                tokenId={swap.acceptorTokenId.toString()}
                quantity={swap.acceptorTokenQuantity.toString()}
              />
            </div>
          )}
        </div>
      )}

      <div className="swap-card-footer">
        {isLoadingStatus ? (
          <div className="status-loading">
            <Loader2 size={14} className="spin" />
            Checking status...
          </div>
        ) : status ? (
          <div className="swap-status-indicators">
            <StatusIndicator 
              label="Initiator owns" 
              ok={!status.initiatorNeedsToOwnToken} 
            />
            <StatusIndicator 
              label="Initiator approved" 
              ok={!status.initiatorTokenRequiresApproval}
              pending={mode === 'initiator' && pendingApprovalTx !== null}
            />
            <StatusIndicator 
              label="Acceptor owns" 
              ok={!status.acceptorNeedsToOwnToken} 
            />
            <StatusIndicator 
              label="Acceptor approved" 
              ok={!status.acceptorTokenRequiresApproval}
              pending={mode === 'acceptor' && pendingApprovalTx !== null}
            />
          </div>
        ) : isCompleted ? (
          <div className="swap-status-indicators">
            <span className="status-text">Swap completed</span>
          </div>
        ) : null}
      </div>

      {/* Transaction Details - Expandable Section (only for completed swaps) */}
      {isCompleted && (
        <>
          <button 
            className="swap-transactions-toggle"
            onClick={() => setShowTransactions(!showTransactions)}
          >
            {showTransactions ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            {showTransactions ? 'Hide Transactions' : 'View Transactions'}
          </button>

          {showTransactions && (
            <div className="swap-transactions-expanded">
              <div className="transaction-hashes">
                <div className="tx-hash-item">
                  <span className="tx-label">Initiate Swap:</span>
                  <a 
                    href={getExplorerTxUrl(chainId, localSwap.transactionHash)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="tx-link"
                  >
                    {truncateAddress(localSwap.transactionHash)}
                  </a>
                </div>
                {localSwap.completeTransactionHash && (
                  <div className="tx-hash-item">
                    <span className="tx-label">Complete Swap:</span>
                    <a 
                      href={getExplorerTxUrl(chainId, localSwap.completeTransactionHash)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="tx-link"
                    >
                      {truncateAddress(localSwap.completeTransactionHash)}
                    </a>
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}
        </>
      )}

      <div className="swap-card-actions">
        {!isCompleted && (onUnhide && isHidden ? (
          <button 
            className="btn btn-icon btn-sm"
            onClick={onUnhide}
            title="Unhide this swap"
          >
            <Eye size={14} />
          </button>
        ) : onHide && !isHidden ? (
          <button 
            className="btn btn-icon btn-sm"
            onClick={onHide}
            title="Hide this swap"
          >
            <EyeOff size={14} />
          </button>
        ) : null)}

        {mode === 'initiator' && !isExpired && !isCompleted && (
          <>
            {needsApproval && (
              <button 
                className="btn btn-secondary btn-sm"
                onClick={handleApprove}
                disabled={isApproving || pendingApprovalTx !== null}
              >
                {isApproving || pendingApprovalTx !== null ? (
                  <Loader2 size={14} className="spin" />
                ) : (
                  'Approve Tokens'
                )}
              </button>
            )}
            <button 
              className="btn btn-danger btn-sm"
              onClick={handleRemove}
              disabled={isRemoving || isPending || isConfirming}
            >
              {isRemoving || isPending || isConfirming ? (
                <Loader2 size={14} className="spin" />
              ) : (
                'Cancel Swap'
              )}
            </button>
          </>
        )}

        {mode === 'acceptor' && !isExpired && !isCompleted && !isInitiator && (
          <>
            {needsApproval ? (
              <button 
                className="btn btn-secondary btn-sm"
                onClick={handleApprove}
                disabled={isApproving || pendingApprovalTx !== null}
              >
                {isApproving || pendingApprovalTx !== null ? (
                  <Loader2 size={14} className="spin" />
                ) : (
                  'Approve Tokens'
                )}
              </button>
            ) : (
              <button 
                className="btn btn-primary btn-sm"
                onClick={handleComplete}
                disabled={isCompleting || isPending || isConfirming || !status?.isReadyForSwapping}
              >
                {isCompleting || isPending || isConfirming ? (
                  <Loader2 size={14} className="spin" />
                ) : (
                  'Complete Swap'
                )}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function StatusIndicator({ label, ok, pending }: { label: string; ok: boolean; pending?: boolean }) {
  if (pending) {
    return (
      <div className="status-indicator pending">
        <Loader2 size={12} className="spin" />
        <span>{label} (pending...)</span>
      </div>
    );
  }
  
  return (
    <div className={`status-indicator ${ok ? 'ok' : 'not-ok'}`}>
      {ok ? <CheckCircle size={12} /> : <XCircle size={12} />}
      <span>{label}</span>
    </div>
  );
}
