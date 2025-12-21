import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useAccount, usePublicClient, useChainId } from 'wagmi';
import { Loader2, XCircle, RefreshCw, AlertTriangle } from 'lucide-react';
import { type Address, zeroAddress, decodeEventLog } from 'viem';
import { useSwapEvents } from '../hooks/useSwapEvents';
import { useTokenApproval } from '../hooks/useTokenApproval';
import { useToastContext } from '../contexts/ToastContext';
import { TokenType, TOKEN_SWAPPER_ADDRESSES, TOKEN_SWAPPER_ABI, ERC20_ABI, ERC721_ABI, ERC1155_ABI } from '../config/contracts';
import { logger } from '../utils/logger';
import type { ParsedSwapEvent } from '../types';

interface TokenApproval {
  tokenAddress: Address;
  tokenType: number;
  tokenId?: bigint;
  amount?: bigint;
  allowance?: bigint;
  isApproved: boolean;
  approvalType: 'specific' | 'forAll' | 'allowance';
  swaps: ParsedSwapEvent[];
}

export function Revoke() {
  const { isConnected, address } = useAccount();
  const publicClient = usePublicClient();
  const chainId = useChainId();
  const { showToast, updateToast } = useToastContext();
  const {
    initiatedSwaps,
    acceptableSwaps,
    openSwaps,
    completedSwaps,
    isLoading: isLoadingSwaps,
    refetch: refetchSwaps,
  } = useSwapEvents();

  const {
    revokeERC20,
    revokeERC721,
    revokeERC721ForAll,
    revokeERC1155,
    isPending,
  } = useTokenApproval();

  const [tokenApprovals, setTokenApprovals] = useState<TokenApproval[]>([]);
  const [isLoadingApprovals, setIsLoadingApprovals] = useState(false);
  const [revokingTokens, setRevokingTokens] = useState<Set<string>>(new Set());
  const extractingRef = useRef(false);

  const contractAddress = TOKEN_SWAPPER_ADDRESSES[chainId] as Address | undefined;

  // Step 1: Get all completed swaps where current address is initiator or acceptor (including open swaps)
  const completedSwapsForUser = useMemo(() => {
    if (!address) return [];
    
    // Note: Actual acceptor for open swaps is fetched in extractTokens from SwapComplete events
    
    return completedSwaps.filter(swap => {
      const isInitiator = swap.initiator.toLowerCase() === address.toLowerCase();
      const isExplicitAcceptor = swap.acceptor.toLowerCase() === address.toLowerCase();
      const isOpenSwap = swap.acceptor === zeroAddress;
      
      // For open swaps that were completed, we need to check SwapComplete events
      // This is handled in extractTokens where we fetch the actual acceptor
      
      return isInitiator || isExplicitAcceptor || isOpenSwap;
    });
  }, [address, completedSwaps]);

  // Step 2: Get all pending swaps where current address is initiator or acceptor (including open swaps)
  const pendingSwapsForUser = useMemo(() => {
    if (!address) return [];
    
    const pending = [
      ...initiatedSwaps,
      ...acceptableSwaps,
      ...openSwaps,
    ];
    
    return pending.filter(swap => {
      const isInitiator = swap.initiator.toLowerCase() === address.toLowerCase();
      const isExplicitAcceptor = swap.acceptor.toLowerCase() === address.toLowerCase();
      const isOpenSwap = swap.acceptor === zeroAddress;
      
      return isInitiator || isExplicitAcceptor || isOpenSwap;
    });
  }, [address, initiatedSwaps, acceptableSwaps, openSwaps]);

  // Step 3: Extract unique tokens and check approvals
  const extractTokens = useCallback(async () => {
    if (!address || !publicClient || !contractAddress) {
      setTokenApprovals([]);
      setIsLoadingApprovals(false);
      return;
    }

    // Prevent concurrent calls
    if (extractingRef.current) {
      return;
    }

    extractingRef.current = true;
    setIsLoadingApprovals(true);
    
    try {
      // Build map of swapId -> actual acceptor from SwapComplete events
      const completedSwapAcceptors = new Map<string, Address>();
      
      if (publicClient && contractAddress) {
        try {
          const swapCompleteEvent = TOKEN_SWAPPER_ABI.find(
            (item) => item.type === 'event' && item.name === 'SwapComplete'
          );
          
          if (swapCompleteEvent) {
            const completedLogs = await publicClient.getLogs({
              address: contractAddress,
              event: swapCompleteEvent as any,
              fromBlock: 0n,
              toBlock: 'latest',
            });
            
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
                  if (swapId) {
                    completedSwapAcceptors.set(swapId, args.acceptor);
                  }
                }
              } catch (err) {
                // Skip invalid logs
              }
            }
          }
        } catch (error) {
          logger.error('Error fetching SwapComplete events:', error);
        }
      }

      const tokenMap = new Map<string, TokenApproval>();
      const allSwapsForUser = [...completedSwapsForUser, ...pendingSwapsForUser];

      for (const swap of allSwapsForUser) {
        const { swap: swapData } = swap;
        const swapIdStr = swap.swapId.toString();
        const isInitiator = swap.initiator.toLowerCase() === address.toLowerCase();
        const isExplicitAcceptor = swap.acceptor.toLowerCase() === address.toLowerCase();
        const isOpenSwap = swap.acceptor === zeroAddress;
        const actualAcceptor = completedSwapAcceptors.get(swapIdStr);
        const userWasAcceptorInCompleted = actualAcceptor?.toLowerCase() === address.toLowerCase();

        // Determine which tokens to check based on user's role
        // If user is initiator, check initiator tokens
        // If user is acceptor (explicit or in completed open swap) or it's an open swap, check acceptor tokens
        
        // Check initiator tokens if user is the initiator
        if (isInitiator && swapData.initiatorTokenType !== TokenType.NONE) {
          const tokenAddress = swapData.initiatorERCContract;
          const tokenKey = getTokenKey(tokenAddress, swapData.initiatorTokenType, swapData.initiatorTokenId);
          
          const approvalInfo = await checkTokenApproval(
            swapData.initiatorTokenType,
            tokenAddress,
            swapData.initiatorTokenId,
            address,
            contractAddress,
            publicClient
          );
          
          if (!tokenMap.has(tokenKey)) {
            if (approvalInfo.isApproved) {
              tokenMap.set(tokenKey, {
                tokenAddress,
                tokenType: swapData.initiatorTokenType,
                tokenId: swapData.initiatorTokenId,
                amount: swapData.initiatorTokenQuantity,
                allowance: approvalInfo.allowance,
                isApproved: true,
                approvalType: approvalInfo.approvalType,
                swaps: [swap],
              });
            }
          } else {
            const existing = tokenMap.get(tokenKey)!;
            if (!existing.swaps.find(s => s.swapId === swap.swapId)) {
              existing.swaps.push(swap);
            }
            // Update allowance if we have a new one (for ERC20/ERC777)
            if (approvalInfo.allowance !== undefined && 
                (existing.tokenType === TokenType.ERC20 || existing.tokenType === TokenType.ERC777)) {
              existing.allowance = approvalInfo.allowance;
            }
          }
        }

        // Check acceptor tokens if:
        // - User is explicitly the acceptor (direct swap)
        // - It's an open swap (anyone can complete it)
        // - It's a completed swap where user was the actual acceptor
        const shouldCheckAcceptorTokens = swapData.acceptorTokenType !== TokenType.NONE &&
            (isExplicitAcceptor || isOpenSwap || userWasAcceptorInCompleted);

        if (shouldCheckAcceptorTokens) {
          const tokenAddress = swapData.acceptorERCContract;
          const tokenKey = getTokenKey(tokenAddress, swapData.acceptorTokenType, swapData.acceptorTokenId);
          
          const approvalInfo = await checkTokenApproval(
            swapData.acceptorTokenType,
            tokenAddress,
            swapData.acceptorTokenId,
            address,
            contractAddress,
            publicClient
          );
          
          if (!tokenMap.has(tokenKey)) {
            if (approvalInfo.isApproved) {
              tokenMap.set(tokenKey, {
                tokenAddress,
                tokenType: swapData.acceptorTokenType,
                tokenId: swapData.acceptorTokenId,
                amount: swapData.acceptorTokenQuantity,
                allowance: approvalInfo.allowance,
                isApproved: true,
                approvalType: approvalInfo.approvalType,
                swaps: [swap],
              });
            }
          } else {
            const existing = tokenMap.get(tokenKey)!;
            if (!existing.swaps.find(s => s.swapId === swap.swapId)) {
              existing.swaps.push(swap);
            }
            // Update allowance if we have a new one (for ERC20/ERC777)
            if (approvalInfo.allowance !== undefined && 
                (existing.tokenType === TokenType.ERC20 || existing.tokenType === TokenType.ERC777)) {
              existing.allowance = approvalInfo.allowance;
            }
          }
        }
      }

      const approvals = Array.from(tokenMap.values());
      setTokenApprovals(approvals);
    } catch (error) {
      logger.error('Error extracting tokens:', error);
      setTokenApprovals([]);
    } finally {
      setIsLoadingApprovals(false);
      extractingRef.current = false;
    }
  }, [address, publicClient, contractAddress, completedSwapsForUser, pendingSwapsForUser]);

  // Helper function to generate token key for deduplication
  function getTokenKey(tokenAddress: Address, tokenType: number, tokenId?: bigint): string {
    // ERC20/ERC777/ERC1155: deduplicate by address only (approvalForAll applies to all tokens)
    // ERC721: include tokenId (can have specific or forAll approval)
    if (tokenType === TokenType.ERC20 || tokenType === TokenType.ERC777 || tokenType === TokenType.ERC1155) {
      return `${tokenAddress.toLowerCase()}-${tokenType}`;
    } else {
      return `${tokenAddress.toLowerCase()}-${tokenType}-${tokenId?.toString() || '0'}`;
    }
  }

  // Helper function to check token approval status
  async function checkTokenApproval(
    tokenType: number,
    tokenAddress: Address,
    tokenId: bigint | undefined,
    owner: Address,
    spender: Address,
    client: typeof publicClient
  ): Promise<{ isApproved: boolean; approvalType: 'specific' | 'forAll' | 'allowance'; allowance?: bigint }> {
    if (!client) {
      return { isApproved: false, approvalType: 'allowance' };
    }

    try {
      // Step 4: For ERC20/ERC777, use allowance(owner, spender)
      if (tokenType === TokenType.ERC20 || tokenType === TokenType.ERC777) {
        const allowance = await client.readContract({
          address: tokenAddress,
          abi: ERC20_ABI,
          functionName: 'allowance',
          args: [owner, spender],
        }) as bigint;
        
        return {
          isApproved: allowance > 0n,
          approvalType: 'allowance',
          allowance,
        };
      }
      
      // Step 5: For ERC1155, check isApprovedForAll(account, operator)
      if (tokenType === TokenType.ERC1155) {
        const isApprovedForAll = await client.readContract({
          address: tokenAddress,
          abi: ERC1155_ABI,
          functionName: 'isApprovedForAll',
          args: [owner, spender],
        }) as boolean;
        
        return {
          isApproved: isApprovedForAll,
          approvalType: 'forAll',
        };
      }
      
      // Step 6: For ERC721, first verify ownership, then check getApproved(tokenId) and isApprovedForAll(account, operator)
      if (tokenType === TokenType.ERC721) {
        if (!tokenId) {
          return { isApproved: false, approvalType: 'specific' };
        }
        
        // Verify that the owner is actually the owner of the NFT
        const nftOwner = await client.readContract({
          address: tokenAddress,
          abi: ERC721_ABI,
          functionName: 'ownerOf',
          args: [tokenId],
        }) as Address;
        
        // If the connected address is not the owner, don't show it in the revoke list
        if (nftOwner.toLowerCase() !== owner.toLowerCase()) {
          return { isApproved: false, approvalType: 'specific' };
        }
        
        const [approved, isApprovedForAll] = await Promise.all([
          client.readContract({
            address: tokenAddress,
            abi: ERC721_ABI,
            functionName: 'getApproved',
            args: [tokenId],
          }),
          client.readContract({
            address: tokenAddress,
            abi: ERC721_ABI,
            functionName: 'isApprovedForAll',
            args: [owner, spender],
          }),
        ]);
        
        const hasSpecificApproval = approved === spender;
        const hasForAllApproval = isApprovedForAll as boolean;
        
        return {
          isApproved: hasSpecificApproval || hasForAllApproval,
          approvalType: hasForAllApproval ? 'forAll' : 'specific',
        };
      }
      
      return { isApproved: false, approvalType: 'allowance' };
    } catch (error) {
      logger.error('Error checking token approval:', error);
      return { isApproved: false, approvalType: 'allowance' };
    }
  }

  // Use a ref to store the latest extractTokens function
  const extractTokensRef = useRef(extractTokens);
  useEffect(() => {
    extractTokensRef.current = extractTokens;
  }, [extractTokens]);

  useEffect(() => {
    // Only extract tokens when swaps are loaded and not already extracting
    if (!isLoadingSwaps && !extractingRef.current && address && publicClient && contractAddress) {
      // Use a small delay to debounce rapid changes
      const timeoutId = setTimeout(() => {
        if (!extractingRef.current) {
          extractTokensRef.current();
        }
      }, 100);
      
      return () => clearTimeout(timeoutId);
    }
  }, [isLoadingSwaps, completedSwapsForUser.length, pendingSwapsForUser.length, address, publicClient, contractAddress]);

  const handleRevoke = useCallback(async (tokenApproval: TokenApproval) => {
    if (!publicClient) return;

    const tokenKey = getTokenKey(
      tokenApproval.tokenAddress,
      tokenApproval.tokenType,
      tokenApproval.tokenId
    );
    setRevokingTokens(prev => new Set(prev).add(tokenKey));

    let pendingToastId: string | null = null;
    try {
      pendingToastId = showToast('Revoking approval...', 'pending');

      let txHash: `0x${string}`;
      
      // Step 4: For ERC20, use approve(spender, 0) to revoke
      if (tokenApproval.tokenType === TokenType.ERC20 || tokenApproval.tokenType === TokenType.ERC777) {
        txHash = await revokeERC20(tokenApproval.tokenAddress);
      }
      // Step 5: For ERC1155, use setApprovalForAll(operator, false) to revoke
      else if (tokenApproval.tokenType === TokenType.ERC1155) {
        txHash = await revokeERC1155(tokenApproval.tokenAddress);
      }
      // Step 6: For ERC721, use approve(owner, tokenId) for single revoke or setApprovalForAll(operator, false)
      else if (tokenApproval.tokenType === TokenType.ERC721) {
        if (tokenApproval.approvalType === 'forAll') {
          txHash = await revokeERC721ForAll(tokenApproval.tokenAddress);
        } else {
          txHash = await revokeERC721(tokenApproval.tokenAddress, tokenApproval.tokenId!);
        }
      } else {
        throw new Error('Unsupported token type');
      }

      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

      if (receipt.status === 'success') {
        updateToast(pendingToastId, {
          message: 'Approval revoked successfully!',
          type: 'success',
          txHash,
        });
        // Refresh approvals
        await extractTokens();
        refetchSwaps();
      } else {
        updateToast(pendingToastId, {
          message: 'Revoke transaction failed',
          type: 'error',
          txHash,
        });
      }
    } catch (error: any) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const isUserRejection = errorMessage.toLowerCase().includes('user rejected') ||
                             errorMessage.toLowerCase().includes('user denied');
      
      if (pendingToastId) {
        updateToast(pendingToastId, {
          message: isUserRejection ? 'Revoke was rejected' : 'Revoke failed',
          type: 'error',
        });
      }
    } finally {
      setRevokingTokens(prev => {
        const next = new Set(prev);
        next.delete(tokenKey);
        return next;
      });
    }
  }, [publicClient, revokeERC20, revokeERC721, revokeERC721ForAll, revokeERC1155, extractTokens, refetchSwaps, showToast, updateToast]);

  const groupedApprovals = useMemo(() => {
    const grouped: Record<number, TokenApproval[]> = {
      [TokenType.ERC20]: [],
      [TokenType.ERC777]: [],
      [TokenType.ERC721]: [],
      [TokenType.ERC1155]: [],
    };

    for (const approval of tokenApprovals) {
      if (grouped[approval.tokenType]) {
        grouped[approval.tokenType].push(approval);
      }
    }

    return grouped;
  }, [tokenApprovals]);

  const getTokenTypeLabel = (tokenType: number): string => {
    switch (tokenType) {
      case TokenType.ERC20:
        return 'ERC20';
      case TokenType.ERC777:
        return 'ERC777';
      case TokenType.ERC721:
        return 'ERC721';
      case TokenType.ERC1155:
        return 'ERC1155';
      default:
        return 'Unknown';
    }
  };

  const truncateAddress = (address: Address): string => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  if (!isConnected) {
    return (
      <div className="card">
        <div className="empty-state">
          <XCircle size={48} />
          <h3>Connect Your Wallet</h3>
          <p>Connect your wallet to view and revoke token approvals</p>
        </div>
      </div>
    );
  }

  const totalApprovals = tokenApprovals.length;
  const isLoading = isLoadingSwaps || isLoadingApprovals;

  return (
    <div className="card">
      <div className="card-header">
        <h2 className="card-title">
          <XCircle size={24} />
          Revoke Approvals
        </h2>
        <div className="header-actions">
          <button 
            className="btn btn-icon" 
            onClick={() => {
              refetchSwaps();
              extractTokens();
            }}
            disabled={isLoading}
          >
            <RefreshCw size={18} className={isLoading ? 'spin' : ''} />
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="loading-state">
          <Loader2 size={32} className="spin" />
          <p>Loading approvals...</p>
        </div>
      ) : totalApprovals === 0 ? (
        <div className="empty-state">
          <AlertTriangle size={48} />
          <h3>No Active Approvals</h3>
          <p>You don't have any active token approvals for the swap contract</p>
        </div>
      ) : (
        <div className="revoke-content">
          <div className="revoke-warning">
            <AlertTriangle size={18} />
            <p>
              <strong>Warning:</strong> Revoking token approvals for pending swaps will make them uncompleteable. 
              Only revoke if you no longer want to complete these swaps.
            </p>
          </div>
          <p className="section-desc">
            Found {totalApprovals} token{totalApprovals !== 1 ? 's' : ''} with active approvals. 
            Review and revoke as needed.
          </p>

          {Object.entries(groupedApprovals).map(([tokenTypeStr, approvals]) => {
            const tokenType = Number(tokenTypeStr);
            if (approvals.length === 0) return null;

            return (
              <div key={tokenType} className="swaps-section">
                <h3 className="section-title">
                  {getTokenTypeLabel(tokenType)} Tokens ({approvals.length})
                </h3>
                <div className="revoke-tokens-list">
                  {approvals.map((approval, index) => {
                    const tokenKey = getTokenKey(
                      approval.tokenAddress,
                      approval.tokenType,
                      approval.tokenId
                    );
                    const isRevoking = revokingTokens.has(tokenKey);

                    return (
                      <div key={index} className="revoke-token-item">
                        <div className="revoke-token-info">
                          <div className="revoke-token-address">
                            <strong>Token:</strong> {truncateAddress(approval.tokenAddress)}
                            {approval.tokenId !== undefined && (
                              <span className="token-id">Token ID: {approval.tokenId.toString()}</span>
                            )}
                            {approval.amount !== undefined && (
                              <span className="token-amount">
                                Swap Amount: {approval.amount.toString()}
                              </span>
                            )}
                            {approval.allowance !== undefined && (approval.tokenType === TokenType.ERC20 || approval.tokenType === TokenType.ERC777) && (
                              <span className="token-allowance">
                                Current Allowance: {approval.allowance.toString()}
                              </span>
                            )}
                          </div>
                          <div className="revoke-token-approval-type">
                            <span className="badge badge-pending">
                              {approval.approvalType === 'forAll' ? 'Approved For All' : 
                               approval.approvalType === 'allowance' ? 'Allowance' : 
                               'Specific Approval'}
                            </span>
                          </div>
                          <div className="revoke-token-swaps">
                            <strong>Used in {approval.swaps.length} swap{approval.swaps.length !== 1 ? 's' : ''}</strong>
                          </div>
                        </div>
                        <button
                          className="btn btn-danger btn-sm"
                          onClick={() => handleRevoke(approval)}
                          disabled={isRevoking || isPending}
                        >
                          {isRevoking ? (
                            <>
                              <Loader2 size={14} className="spin" />
                              Revoking...
                            </>
                          ) : (
                            <>
                              <XCircle size={14} />
                              Revoke
                            </>
                          )}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

