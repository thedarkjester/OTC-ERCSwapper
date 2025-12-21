import { useState, useEffect, useCallback } from 'react';
import { usePublicClient, useChainId } from 'wagmi';
import { type Address, isAddress, zeroAddress } from 'viem';
import { TokenType } from '../config/contracts';
import { TOKEN_SWAPPER_ADDRESSES } from '../config/contracts';
import { logger } from '../utils/logger';

// Creator Token Standard ABI (Limit Break)
const CREATOR_TOKEN_ABI = [
  {
    name: 'getTransferValidator',
    type: 'function',
    inputs: [],
    outputs: [{ type: 'address' }],
    stateMutability: 'view',
  },
] as const;

// Transfer Validator ABI
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
  {
    name: 'isTransferAllowed',
    type: 'function',
    inputs: [
      { name: 'caller', type: 'address' },
      { name: 'from', type: 'address' },
      { name: 'to', type: 'address' },
    ],
    outputs: [{ type: 'bool' }],
    stateMutability: 'view',
  },
] as const;

// OpenSea Operator Filter Registry (mainnet)
const OPERATOR_FILTER_REGISTRY = '0x000000000000AAeB6D7670E522A718067333cd4E' as Address;

const OPERATOR_FILTER_ABI = [
  {
    name: 'isOperatorFiltered',
    type: 'function',
    inputs: [
      { name: 'registrant', type: 'address' },
      { name: 'operator', type: 'address' },
    ],
    outputs: [{ type: 'bool' }],
    stateMutability: 'view',
  },
] as const;

export interface TransferRestrictionResult {
  isLoading: boolean;
  hasRestrictions: boolean;
  canSwap: boolean;
  restrictionType: 'none' | 'creator-token' | 'operator-filter' | 'unknown';
  reason: string | null;
  validatorAddress: string | null;
}

export function useTransferRestrictionCheck(
  tokenAddress: string,
  tokenType: number
): TransferRestrictionResult {
  const publicClient = usePublicClient();
  const chainId = useChainId();
  const [result, setResult] = useState<TransferRestrictionResult>({
    isLoading: false,
    hasRestrictions: false,
    canSwap: true,
    restrictionType: 'none',
    reason: null,
    validatorAddress: null,
  });

  const swapperAddress = TOKEN_SWAPPER_ADDRESSES[chainId] as Address | undefined;

  const checkRestrictions = useCallback(async () => {
    // Only check for NFTs
    if (
      !publicClient ||
      !tokenAddress ||
      !isAddress(tokenAddress) ||
      !swapperAddress ||
      (tokenType !== TokenType.ERC721 && tokenType !== TokenType.ERC1155)
    ) {
      setResult({
        isLoading: false,
        hasRestrictions: false,
        canSwap: true,
        restrictionType: 'none',
        reason: null,
        validatorAddress: null,
      });
      return;
    }

    setResult(prev => ({ ...prev, isLoading: true }));

    try {
      // Layer 1: Check for Creator Token transfer validator
      let hasCreatorTokenRestriction = false;
      let validatorAddress: Address | null = null;

      try {
        const validator = await publicClient.readContract({
          address: tokenAddress as Address,
          abi: CREATOR_TOKEN_ABI,
          functionName: 'getTransferValidator',
        });

        if (validator && validator !== zeroAddress) {
          validatorAddress = validator;
          logger.log('Found transfer validator:', validator);

          // Check if swapper is allowed
          try {
            const isAllowed = await publicClient.readContract({
              address: validator,
              abi: TRANSFER_VALIDATOR_ABI,
              functionName: 'isOperatorAllowed',
              args: [tokenAddress as Address, swapperAddress],
            });

            logger.log('isOperatorAllowed result:', isAllowed);

            if (!isAllowed) {
              hasCreatorTokenRestriction = true;
              setResult({
                isLoading: false,
                hasRestrictions: true,
                canSwap: false,
                restrictionType: 'creator-token',
                reason: 'This token has operator restrictions. The swap contract is not whitelisted as an approved operator, so transfers through it will fail.',
                validatorAddress: validator,
              });
              return;
            }
          } catch (e) {
            logger.warn('Error checking isOperatorAllowed:', e);
            // If we can't check, assume there might be restrictions
            hasCreatorTokenRestriction = true;
            setResult({
              isLoading: false,
              hasRestrictions: true,
              canSwap: false,
              restrictionType: 'creator-token',
              reason: 'This token has a transfer validator but we could not verify if the swap contract is allowed. Transfers may fail.',
              validatorAddress: validator,
            });
            return;
          }
        }
      } catch {
        // No getTransferValidator function - token doesn't use Creator Token standard
      }

      // Layer 2: Check OpenSea Operator Filter Registry (mainnet only)
      if (chainId === 1) {
        try {
          const isFiltered = await publicClient.readContract({
            address: OPERATOR_FILTER_REGISTRY,
            abi: OPERATOR_FILTER_ABI,
            functionName: 'isOperatorFiltered',
            args: [tokenAddress as Address, swapperAddress],
          });

          if (isFiltered) {
            setResult({
              isLoading: false,
              hasRestrictions: true,
              canSwap: false,
              restrictionType: 'operator-filter',
              reason: 'This token uses OpenSea operator filtering and the swap contract is blocked.',
              validatorAddress: OPERATOR_FILTER_REGISTRY,
            });
            return;
          }
        } catch {
          // Registry call failed - token might not be registered
        }
      }

      // No restrictions found
      setResult({
        isLoading: false,
        hasRestrictions: hasCreatorTokenRestriction,
        canSwap: true,
        restrictionType: hasCreatorTokenRestriction ? 'creator-token' : 'none',
        reason: hasCreatorTokenRestriction 
          ? 'Token has a transfer validator but the swap contract is allowed.'
          : null,
        validatorAddress,
      });

    } catch (err) {
      logger.error('Transfer restriction check error:', err);
      setResult({
        isLoading: false,
        hasRestrictions: false,
        canSwap: true,
        restrictionType: 'none',
        reason: null,
        validatorAddress: null,
      });
    }
  }, [publicClient, tokenAddress, tokenType, swapperAddress, chainId]);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      checkRestrictions();
    }, 600); // Debounce

    return () => clearTimeout(timeoutId);
  }, [checkRestrictions]);

  return result;
}

