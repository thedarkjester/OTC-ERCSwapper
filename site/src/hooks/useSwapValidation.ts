import { usePublicClient, useChainId } from 'wagmi';
import { type Address, isAddress, zeroAddress, formatEther } from 'viem';
import { TokenType, ERC20_ABI, TOKEN_SWAPPER_ADDRESSES } from '../config/contracts';

// ERC1155 ABI
const ERC1155_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    inputs: [
      { name: 'account', type: 'address' },
      { name: 'id', type: 'uint256' },
    ],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    name: 'isApprovedForAll',
    type: 'function',
    inputs: [
      { name: 'account', type: 'address' },
      { name: 'operator', type: 'address' },
    ],
    outputs: [{ type: 'bool' }],
    stateMutability: 'view',
  },
] as const;

// ERC721 ABI
const ERC721_ABI = [
  {
    name: 'ownerOf',
    type: 'function',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [{ type: 'address' }],
    stateMutability: 'view',
  },
  {
    name: 'getApproved',
    type: 'function',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [{ type: 'address' }],
    stateMutability: 'view',
  },
  {
    name: 'isApprovedForAll',
    type: 'function',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'operator', type: 'address' },
    ],
    outputs: [{ type: 'bool' }],
    stateMutability: 'view',
  },
] as const;

// Creator Token ABI
const CREATOR_TOKEN_ABI = [
  {
    name: 'getTransferValidator',
    type: 'function',
    inputs: [],
    outputs: [{ type: 'address' }],
    stateMutability: 'view',
  },
] as const;

const TRANSFER_VALIDATOR_ABI = [
  {
    name: 'isOperatorAllowed',
    type: 'function',
    inputs: [
      { name: 'collection', type: 'address' },
      { name: 'operator', type: 'address' },
    ],
    outputs: [{ type: 'bool' }],
    stateMutability: 'view',
  },
] as const;

export interface ValidationError {
  party: 'initiator' | 'acceptor' | 'general';
  type: 'error' | 'warning';
  category: 'ownership' | 'balance' | 'approval' | 'restriction' | 'contract' | 'expiry' | 'config';
  message: string;
}

export interface SwapFormData {
  initiatorTokenType: number;
  initiatorERCContract: string;
  initiatorTokenId: string;
  initiatorTokenQuantity: string;
  initiatorETHPortion: string;
  acceptorTokenType: number;
  acceptorERCContract: string;
  acceptorTokenId: string;
  acceptorTokenQuantity: string;
  acceptorETHPortion: string;
  acceptor: string;
  expiryDays: number;
}

export function useSwapValidation() {
  const publicClient = usePublicClient();
  const chainId = useChainId();
  const swapperAddress = TOKEN_SWAPPER_ADDRESSES[chainId] as Address | undefined;

  /**
   * Validate that an address is a contract (not EOA)
   */
  const isContract = async (address: string): Promise<boolean> => {
    if (!publicClient || !address || !isAddress(address)) return false;
    try {
      const code = await publicClient.getCode({ address: address as Address });
      return code !== undefined && code !== '0x';
    } catch {
      return false;
    }
  };

  /**
   * Check if ERC20 contract implements standard interface
   */
  const isValidERC20 = async (address: string): Promise<{ valid: boolean; error?: string }> => {
    if (!publicClient || !address || !isAddress(address)) {
      return { valid: false, error: 'Invalid address' };
    }

    try {
      // Try to call name, symbol, decimals
      const results = await Promise.allSettled([
        publicClient.readContract({
          address: address as Address,
          abi: ERC20_ABI,
          functionName: 'name',
        }),
        publicClient.readContract({
          address: address as Address,
          abi: ERC20_ABI,
          functionName: 'symbol',
        }),
        publicClient.readContract({
          address: address as Address,
          abi: ERC20_ABI,
          functionName: 'decimals',
        }),
      ]);

      const hasName = results[0].status === 'fulfilled';
      const hasSymbol = results[1].status === 'fulfilled';
      const hasDecimals = results[2].status === 'fulfilled';

      if (!hasName || !hasSymbol || !hasDecimals) {
        return { valid: false, error: 'Contract exists but does not implement standard ERC20 interface (missing name, symbol, or decimals)' };
      }

      return { valid: true };
    } catch {
      return { valid: false, error: 'Failed to verify ERC20 interface' };
    }
  };

  /**
   * Check if ERC721 token exists
   */
  const erc721TokenExists = async (address: string, tokenId: string): Promise<{ exists: boolean; owner?: string; error?: string }> => {
    if (!publicClient || !address || !isAddress(address) || !tokenId) {
      return { exists: false, error: 'Invalid parameters' };
    }

    try {
      const owner = await publicClient.readContract({
        address: address as Address,
        abi: ERC721_ABI,
        functionName: 'ownerOf',
        args: [BigInt(tokenId)],
      });
      return { exists: true, owner: owner as string };
    } catch {
      return { exists: false, error: `Token #${tokenId} does not exist` };
    }
  };

  /**
   * Check ERC20 allowance - must be exact amount
   */
  const checkERC20Allowance = async (
    tokenAddress: string,
    ownerAddress: string,
    requiredAmount: bigint,
    party: 'initiator' | 'acceptor'
  ): Promise<ValidationError | null> => {
    if (!publicClient || !swapperAddress || requiredAmount <= 0n) return null;

    try {
      const allowance = await publicClient.readContract({
        address: tokenAddress as Address,
        abi: ERC20_ABI,
        functionName: 'allowance',
        args: [ownerAddress as Address, swapperAddress],
      }) as bigint;

      if (allowance < requiredAmount) {
        return {
          party,
          type: 'warning',
          category: 'approval',
          message: `${party === 'initiator' ? 'Your' : 'Acceptor\'s'} token approval (${allowance.toString()}) is less than required amount (${requiredAmount.toString()}). Approval will be needed.`,
        };
      }

      // Check if approval is EXACTLY the required amount (warn if more)
      if (allowance > requiredAmount) {
        return {
          party,
          type: 'warning',
          category: 'approval',
          message: `${party === 'initiator' ? 'Your' : 'Acceptor\'s'} token approval (${allowance.toString()}) exceeds the required amount (${requiredAmount.toString()}). Consider setting exact approval for security.`,
        };
      }

      return null;
    } catch {
      return null;
    }
  };

  /**
   * Check ERC721 approval
   */
  const checkERC721Approval = async (
    tokenAddress: string,
    ownerAddress: string,
    tokenId: string,
    party: 'initiator' | 'acceptor'
  ): Promise<ValidationError | null> => {
    if (!publicClient || !swapperAddress) return null;

    try {
      const [approved, isApprovedForAll] = await Promise.all([
        publicClient.readContract({
          address: tokenAddress as Address,
          abi: ERC721_ABI,
          functionName: 'getApproved',
          args: [BigInt(tokenId)],
        }),
        publicClient.readContract({
          address: tokenAddress as Address,
          abi: ERC721_ABI,
          functionName: 'isApprovedForAll',
          args: [ownerAddress as Address, swapperAddress],
        }),
      ]);

      const hasApproval = approved === swapperAddress || isApprovedForAll;

      if (!hasApproval) {
        return {
          party,
          type: 'warning',
          category: 'approval',
          message: `${party === 'initiator' ? 'Your' : 'Acceptor\'s'} NFT #${tokenId} is not approved for the swap contract. Approval will be needed.`,
        };
      }

      // Warn if using setApprovalForAll instead of specific approval
      if (isApprovedForAll && approved !== swapperAddress) {
        return {
          party,
          type: 'warning',
          category: 'approval',
          message: `${party === 'initiator' ? 'You have' : 'Acceptor has'} granted approval for ALL tokens. Consider using specific token approval for security.`,
        };
      }

      return null;
    } catch {
      return null;
    }
  };

  /**
   * Check ERC1155 approval
   */
  const checkERC1155Approval = async (
    tokenAddress: string,
    ownerAddress: string,
    party: 'initiator' | 'acceptor'
  ): Promise<ValidationError | null> => {
    if (!publicClient || !swapperAddress) return null;

    try {
      const isApproved = await publicClient.readContract({
        address: tokenAddress as Address,
        abi: ERC1155_ABI,
        functionName: 'isApprovedForAll',
        args: [ownerAddress as Address, swapperAddress],
      });

      if (!isApproved) {
        return {
          party,
          type: 'warning',
          category: 'approval',
          message: `${party === 'initiator' ? 'Your' : 'Acceptor\'s'} ERC1155 tokens are not approved for the swap contract. Approval will be needed.`,
        };
      }

      return null;
    } catch {
      return null;
    }
  };

  /**
   * Check for operator restrictions (Creator Token)
   */
  const checkOperatorRestriction = async (
    tokenAddress: string,
    party: 'initiator' | 'acceptor'
  ): Promise<ValidationError | null> => {
    if (!publicClient || !swapperAddress) return null;

    try {
      const validatorAddress = await publicClient.readContract({
        address: tokenAddress as Address,
        abi: CREATOR_TOKEN_ABI,
        functionName: 'getTransferValidator',
      });

      if (validatorAddress && validatorAddress !== zeroAddress) {
        try {
          const isAllowed = await publicClient.readContract({
            address: validatorAddress,
            abi: TRANSFER_VALIDATOR_ABI,
            functionName: 'isOperatorAllowed',
            args: [tokenAddress as Address, swapperAddress],
          });

          if (!isAllowed) {
            return {
              party,
              type: 'error',
              category: 'restriction',
              message: `${party === 'initiator' ? 'Your' : 'Acceptor\'s'} token has operator restrictions. The swap contract is not whitelisted.`,
            };
          }
        } catch {
          return {
            party,
            type: 'warning',
            category: 'restriction',
            message: `${party === 'initiator' ? 'Your' : 'Acceptor\'s'} token has a transfer validator but couldn't verify if swap contract is allowed.`,
          };
        }
      }
    } catch {
      // No transfer validator
    }

    return null;
  };

  /**
   * Check token balance
   */
  const checkTokenBalance = async (
    tokenType: number,
    tokenAddress: string,
    ownerAddress: string,
    tokenId: string,
    quantity: string,
    party: 'initiator' | 'acceptor'
  ): Promise<ValidationError | null> => {
    if (!publicClient || tokenType === TokenType.NONE) return null;

    try {
      if (tokenType === TokenType.ERC20 || tokenType === TokenType.ERC777) {
        const balance = await publicClient.readContract({
          address: tokenAddress as Address,
          abi: ERC20_ABI,
          functionName: 'balanceOf',
          args: [ownerAddress as Address],
        }) as bigint;

        const required = quantity ? BigInt(quantity) : 0n;
        if (balance < required) {
          return {
            party,
            type: 'error',
            category: 'balance',
            message: `${party === 'initiator' ? 'You have' : 'Acceptor has'} insufficient token balance. Has ${balance.toString()} but needs ${required.toString()}`,
          };
        }
      } else if (tokenType === TokenType.ERC721) {
        const result = await erc721TokenExists(tokenAddress, tokenId);
        if (!result.exists) {
          return {
            party,
            type: 'error',
            category: 'ownership',
            message: result.error || `NFT #${tokenId} does not exist`,
          };
        }
        if (result.owner?.toLowerCase() !== ownerAddress.toLowerCase()) {
          const shortOwner = `${result.owner?.slice(0, 6)}...${result.owner?.slice(-4)}`;
          return {
            party,
            type: 'error',
            category: 'ownership',
            message: `${party === 'initiator' ? 'You do' : 'Acceptor does'} not own NFT #${tokenId}. Owner: ${shortOwner}`,
          };
        }
      } else if (tokenType === TokenType.ERC1155) {
        const balance = await publicClient.readContract({
          address: tokenAddress as Address,
          abi: ERC1155_ABI,
          functionName: 'balanceOf',
          args: [ownerAddress as Address, BigInt(tokenId)],
        }) as bigint;

        const required = quantity ? BigInt(quantity) : 1n;
        if (balance < required) {
          return {
            party,
            type: 'error',
            category: 'balance',
            message: `${party === 'initiator' ? 'You have' : 'Acceptor has'} insufficient ERC1155 balance. Has ${balance.toString()} but needs ${required.toString()}`,
          };
        }
      }
    } catch (err) {
      return {
        party,
        type: 'error',
        category: 'balance',
        message: `Failed to verify ${party}'s token balance`,
      };
    }

    return null;
  };

  /**
   * Check ETH balance
   */
  const checkEthBalance = async (
    address: string,
    requiredWei: bigint,
    party: 'initiator' | 'acceptor'
  ): Promise<ValidationError | null> => {
    if (!publicClient || !address || !isAddress(address) || requiredWei <= 0n) return null;

    try {
      const balance = await publicClient.getBalance({ address: address as Address });
      if (balance < requiredWei) {
        return {
          party,
          type: 'error',
          category: 'balance',
          message: `${party === 'initiator' ? 'You have' : 'Acceptor has'} insufficient ETH. Has ${formatEther(balance)} but needs ${formatEther(requiredWei)} ETH`,
        };
      }
    } catch {
      return {
        party,
        type: 'error',
        category: 'balance',
        message: `Failed to check ETH balance for ${party}`,
      };
    }

    return null;
  };

  /**
   * Full swap validation
   */
  const validateSwap = async (
    formData: SwapFormData,
    initiatorAddress: string
  ): Promise<ValidationError[]> => {
    const errors: ValidationError[] = [];

    // Helper function to check if ERC1155 is NFT-like (quantity = 1) or fungible (quantity > 1)
    const isERC1155NFTLike = (tokenType: number, quantity: string): boolean => {
      if (tokenType !== TokenType.ERC1155) return false;
      if (!quantity) return true; // Default to NFT-like if no quantity specified
      try {
        const qty = BigInt(quantity);
        return qty === 1n;
      } catch {
        return true; // Default to NFT-like on error
      }
    };

    if (!publicClient) {
      errors.push({
        party: 'general',
        type: 'error',
        category: 'config',
        message: 'Wallet not connected',
      });
      return errors;
    }

    // 1. Check zero addresses
    if (!initiatorAddress || initiatorAddress === zeroAddress) {
      errors.push({
        party: 'initiator',
        type: 'error',
        category: 'config',
        message: 'Initiator address is invalid',
      });
    }

    // 2. Check acceptor is not initiator
    if (formData.acceptor && formData.acceptor.toLowerCase() === initiatorAddress.toLowerCase()) {
      errors.push({
        party: 'general',
        type: 'error',
        category: 'config',
        message: 'Acceptor cannot be the same as initiator',
      });
    }

    // 3. Check expiry
    if (formData.expiryDays < 1) {
      errors.push({
        party: 'general',
        type: 'error',
        category: 'expiry',
        message: 'Expiry must be at least 1 day',
      });
    } else if (formData.expiryDays * 24 < 1) {
      errors.push({
        party: 'general',
        type: 'warning',
        category: 'expiry',
        message: 'Expiry is very short (less than 1 hour). Swap may expire before completion.',
      });
    } else if (formData.expiryDays > 365) {
      errors.push({
        party: 'general',
        type: 'warning',
        category: 'expiry',
        message: 'Expiry is very long (over 1 year). Consider a shorter duration.',
      });
    }

    // 4. Validate initiator token contract
    if (formData.initiatorTokenType !== TokenType.NONE && formData.initiatorERCContract) {
      // Check it's a contract
      const isContractAddr = await isContract(formData.initiatorERCContract);
      if (!isContractAddr) {
        errors.push({
          party: 'initiator',
          type: 'error',
          category: 'contract',
          message: 'Your token address is not a contract',
        });
      } else {
        // Check it's not the swapper
        if (swapperAddress && formData.initiatorERCContract.toLowerCase() === swapperAddress.toLowerCase()) {
          errors.push({
            party: 'initiator',
            type: 'error',
            category: 'contract',
            message: 'Cannot use the swap contract as a token address',
          });
        }

        // Check ERC20 interface
        if (formData.initiatorTokenType === TokenType.ERC20 || formData.initiatorTokenType === TokenType.ERC777) {
          const erc20Check = await isValidERC20(formData.initiatorERCContract);
          if (!erc20Check.valid) {
            errors.push({
              party: 'initiator',
              type: 'error',
              category: 'contract',
              message: erc20Check.error || 'Invalid ERC20 contract',
            });
          }
        }

        // Check balance/ownership (this also checks if ERC721 token exists)
        const balanceError = await checkTokenBalance(
          formData.initiatorTokenType,
          formData.initiatorERCContract,
          initiatorAddress,
          formData.initiatorTokenId,
          formData.initiatorTokenQuantity,
          'initiator'
        );
        if (balanceError) errors.push(balanceError);

        // Check operator restrictions for NFTs (including NFT-like ERC1155)
        const isInitiatorNFT = formData.initiatorTokenType === TokenType.ERC721 || 
                              (formData.initiatorTokenType === TokenType.ERC1155 && 
                               isERC1155NFTLike(formData.initiatorTokenType, formData.initiatorTokenQuantity));
        if (isInitiatorNFT) {
          const restrictionError = await checkOperatorRestriction(formData.initiatorERCContract, 'initiator');
          if (restrictionError) errors.push(restrictionError);
        }

        // Check approval (warning level)
        if (formData.initiatorTokenType === TokenType.ERC20 || formData.initiatorTokenType === TokenType.ERC777) {
          const qty = formData.initiatorTokenQuantity ? BigInt(formData.initiatorTokenQuantity) : 0n;
          const approvalWarning = await checkERC20Allowance(formData.initiatorERCContract, initiatorAddress, qty, 'initiator');
          if (approvalWarning) errors.push(approvalWarning);
        } else if (formData.initiatorTokenType === TokenType.ERC721) {
          const approvalWarning = await checkERC721Approval(formData.initiatorERCContract, initiatorAddress, formData.initiatorTokenId, 'initiator');
          if (approvalWarning) errors.push(approvalWarning);
        } else if (formData.initiatorTokenType === TokenType.ERC1155) {
          const approvalWarning = await checkERC1155Approval(formData.initiatorERCContract, initiatorAddress, 'initiator');
          if (approvalWarning) errors.push(approvalWarning);
        }
      }
    }

    // 5. Check initiator ETH balance
    if (formData.initiatorETHPortion && parseFloat(formData.initiatorETHPortion) > 0) {
      try {
        const ethWei = BigInt(Math.floor(parseFloat(formData.initiatorETHPortion) * 1e18));
        const ethError = await checkEthBalance(initiatorAddress, ethWei, 'initiator');
        if (ethError) errors.push(ethError);
      } catch {
        errors.push({
          party: 'initiator',
          type: 'error',
          category: 'balance',
          message: 'Invalid ETH amount format',
        });
      }
    }

    // 6. Validate acceptor (if specified)
    if (formData.acceptor && isAddress(formData.acceptor)) {
      // Check acceptor is not zero address
      if (formData.acceptor === zeroAddress) {
        errors.push({
          party: 'acceptor',
          type: 'error',
          category: 'config',
          message: 'Acceptor address cannot be zero address',
        });
      }

      // Validate acceptor token contract
      if (formData.acceptorTokenType !== TokenType.NONE && formData.acceptorERCContract) {
        const isContractAddr = await isContract(formData.acceptorERCContract);
        if (!isContractAddr) {
          errors.push({
            party: 'acceptor',
            type: 'error',
            category: 'contract',
            message: 'Acceptor\'s token address is not a contract',
          });
        } else {
          // Check it's not the swapper
          if (swapperAddress && formData.acceptorERCContract.toLowerCase() === swapperAddress.toLowerCase()) {
            errors.push({
              party: 'acceptor',
              type: 'error',
              category: 'contract',
              message: 'Cannot use the swap contract as a token address',
            });
          }

          // Check ERC20 interface
          if (formData.acceptorTokenType === TokenType.ERC20 || formData.acceptorTokenType === TokenType.ERC777) {
            const erc20Check = await isValidERC20(formData.acceptorERCContract);
            if (!erc20Check.valid) {
              errors.push({
                party: 'acceptor',
                type: 'error',
                category: 'contract',
                message: `Acceptor's token: ${erc20Check.error || 'Invalid ERC20 contract'}`,
              });
            }
          }

          // Note: ERC721 existence check is handled in checkTokenBalance below

          // Check ERC1155: detect if NFT-like (qty=1) or fungible (qty>1)
          if (formData.acceptorTokenType === TokenType.ERC1155) {
            const isNFTLike = isERC1155NFTLike(formData.acceptorTokenType, formData.acceptorTokenQuantity);
            
            if (isNFTLike && !formData.acceptorTokenId) {
              errors.push({
                party: 'acceptor',
                type: 'error',
                category: 'config',
                message: 'Acceptor: Token ID is required for ERC1155 when quantity is 1 (NFT-like)',
              });
            }
            
            // For NFT-like ERC1155 (quantity = 1), check ownership similar to ERC721
            if (isNFTLike && formData.acceptorTokenId) {
              try {
                const balance = await publicClient.readContract({
                  address: formData.acceptorERCContract as Address,
                  abi: ERC1155_ABI,
                  functionName: 'balanceOf',
                  args: [formData.acceptor as Address, BigInt(formData.acceptorTokenId)],
                }) as bigint;
                
                if (balance < 1n) {
                  errors.push({
                    party: 'acceptor',
                    type: 'error',
                    category: 'ownership',
                    message: `Acceptor does not own ERC1155 token #${formData.acceptorTokenId} (NFT-like, quantity must be 1)`,
                  });
                }
              } catch (err) {
                errors.push({
                  party: 'acceptor',
                  type: 'error',
                  category: 'ownership',
                  message: `Failed to verify acceptor's ERC1155 ownership`,
                });
              }
            }
          }

          // Check balance/ownership
          const balanceError = await checkTokenBalance(
            formData.acceptorTokenType,
            formData.acceptorERCContract,
            formData.acceptor,
            formData.acceptorTokenId,
            formData.acceptorTokenQuantity,
            'acceptor'
          );
          if (balanceError) errors.push(balanceError);

          // Check operator restrictions for NFTs (including NFT-like ERC1155)
          const isAcceptorNFT = formData.acceptorTokenType === TokenType.ERC721 || 
                               (formData.acceptorTokenType === TokenType.ERC1155 && 
                                isERC1155NFTLike(formData.acceptorTokenType, formData.acceptorTokenQuantity));
          if (isAcceptorNFT) {
            const restrictionError = await checkOperatorRestriction(formData.acceptorERCContract, 'acceptor');
            if (restrictionError) errors.push(restrictionError);
          }

          // Check approval (warning level)
          if (formData.acceptorTokenType === TokenType.ERC20 || formData.acceptorTokenType === TokenType.ERC777) {
            const qty = formData.acceptorTokenQuantity ? BigInt(formData.acceptorTokenQuantity) : 0n;
            const approvalWarning = await checkERC20Allowance(formData.acceptorERCContract, formData.acceptor, qty, 'acceptor');
            if (approvalWarning) errors.push(approvalWarning);
          } else if (formData.acceptorTokenType === TokenType.ERC721) {
            const approvalWarning = await checkERC721Approval(formData.acceptorERCContract, formData.acceptor, formData.acceptorTokenId, 'acceptor');
            if (approvalWarning) errors.push(approvalWarning);
          } else if (formData.acceptorTokenType === TokenType.ERC1155) {
            const approvalWarning = await checkERC1155Approval(formData.acceptorERCContract, formData.acceptor, 'acceptor');
            if (approvalWarning) errors.push(approvalWarning);
          }
        }
      }

      // Check acceptor ETH balance
      if (formData.acceptorETHPortion && parseFloat(formData.acceptorETHPortion) > 0) {
        try {
          const ethWei = BigInt(Math.floor(parseFloat(formData.acceptorETHPortion) * 1e18));
          const ethError = await checkEthBalance(formData.acceptor, ethWei, 'acceptor');
          if (ethError) errors.push(ethError);
        } catch {
          errors.push({
            party: 'acceptor',
            type: 'error',
            category: 'balance',
            message: 'Invalid acceptor ETH amount format',
          });
        }
      }
    }

    return errors;
  };

  return {
    validateSwap,
    isContract,
    isValidERC20,
    erc721TokenExists,
    checkEthBalance,
    checkTokenBalance,
    checkOperatorRestriction,
    checkERC20Allowance,
    checkERC721Approval,
    checkERC1155Approval,
  };
}

