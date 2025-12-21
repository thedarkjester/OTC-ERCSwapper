import { useState, useEffect, useCallback } from 'react';
import { usePublicClient } from 'wagmi';
import { type Address, isAddress } from 'viem';
import { TokenType } from '../config/contracts';
import { logger } from '../utils/logger';

// ERC165 interface IDs
const INTERFACE_IDS = {
  ERC165: '0x01ffc9a7',
  ERC721: '0x80ac58cd',
  ERC721Metadata: '0x5b5e139f',
  ERC1155: '0xd9b67a26',
  ERC1155MetadataURI: '0x0e89341c',
  ERC777: '0xe58e113c', // ERC777Token interface
} as const;

// ERC165 ABI
const ERC165_ABI = [
  {
    inputs: [{ name: 'interfaceId', type: 'bytes4' }],
    name: 'supportsInterface',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

// ERC20 detection ABI (no standard interface, check for typical functions)
const ERC20_DETECTION_ABI = [
  {
    inputs: [],
    name: 'totalSupply',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'decimals',
    outputs: [{ name: '', type: 'uint8' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

// ERC777 detection ABI
const ERC777_DETECTION_ABI = [
  {
    inputs: [],
    name: 'granularity',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'defaultOperators',
    outputs: [{ name: '', type: 'address[]' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

export interface TokenTypeDetectionResult {
  detectedType: TokenType | null;
  isLoading: boolean;
  error: string | null;
  isERC165: boolean;
  isERC721: boolean;
  isERC1155: boolean;
  isERC20: boolean;
  isERC777: boolean;
  mismatch: boolean; // true if selected type doesn't match detected type
  mismatchMessage: string | null;
}

export function useTokenTypeDetection(
  tokenAddress: string,
  selectedType: number
): TokenTypeDetectionResult {
  const publicClient = usePublicClient();
  const [result, setResult] = useState<TokenTypeDetectionResult>({
    detectedType: null,
    isLoading: false,
    error: null,
    isERC165: false,
    isERC721: false,
    isERC1155: false,
    isERC20: false,
    isERC777: false,
    mismatch: false,
    mismatchMessage: null,
  });

  const detectTokenType = useCallback(async () => {
    if (!publicClient || !tokenAddress || !isAddress(tokenAddress)) {
      setResult({
        detectedType: null,
        isLoading: false,
        error: null,
        isERC165: false,
        isERC721: false,
        isERC1155: false,
        isERC20: false,
        isERC777: false,
        mismatch: false,
        mismatchMessage: null,
      });
      return;
    }

    setResult(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      const address = tokenAddress as Address;
      
      // First check if contract exists (has code)
      let contractExists = false;
      try {
        const code = await publicClient.getCode({ address });
        contractExists = code !== undefined && code !== '0x' && code.length > 2;
      } catch {
        contractExists = false;
      }
      
      if (!contractExists) {
        // Contract doesn't exist
        let mismatchMessage: string | null = null;
        if (selectedType !== TokenType.NONE) {
          const selectedName = getTokenTypeName(selectedType as TokenType);
          mismatchMessage = `Contract does not exist at this address (no code found). Cannot use as ${selectedName}.`;
        }
        
        setResult({
          detectedType: null,
          isLoading: false,
          error: 'Contract does not exist at this address',
          isERC165: false,
          isERC721: false,
          isERC1155: false,
          isERC20: false,
          isERC777: false,
          mismatch: selectedType !== TokenType.NONE,
          mismatchMessage,
        });
        return;
      }
      
      // Check ERC165 support first
      let supportsERC165 = false;
      try {
        supportsERC165 = await publicClient.readContract({
          address,
          abi: ERC165_ABI,
          functionName: 'supportsInterface',
          args: [INTERFACE_IDS.ERC165 as `0x${string}`],
        });
      } catch {
        // Contract doesn't support ERC165
      }

      let isERC721 = false;
      let isERC1155 = false;
      let isERC777 = false;
      let isERC20 = false;

      if (supportsERC165) {
        // Check for ERC721
        try {
          isERC721 = await publicClient.readContract({
            address,
            abi: ERC165_ABI,
            functionName: 'supportsInterface',
            args: [INTERFACE_IDS.ERC721 as `0x${string}`],
          });
        } catch {
          // Ignore
        }

        // Check for ERC1155
        try {
          isERC1155 = await publicClient.readContract({
            address,
            abi: ERC165_ABI,
            functionName: 'supportsInterface',
            args: [INTERFACE_IDS.ERC1155 as `0x${string}`],
          });
        } catch {
          // Ignore
        }

        // Check for ERC777 interface
        try {
          isERC777 = await publicClient.readContract({
            address,
            abi: ERC165_ABI,
            functionName: 'supportsInterface',
            args: [INTERFACE_IDS.ERC777 as `0x${string}`],
          });
        } catch {
          // Ignore
        }
      }

      // If not NFT via ERC165, check for ERC20/ERC777 by function presence
      if (!isERC721 && !isERC1155) {
        // Check for ERC777-specific functions first
        try {
          const granularityResult = await publicClient.readContract({
            address,
            abi: ERC777_DETECTION_ABI,
            functionName: 'granularity',
          });
          
          // If granularity exists and returns a value, it's likely ERC777
          if (granularityResult !== undefined) {
            isERC777 = true;
          }
        } catch {
          // Not ERC777
        }

        // Check for ERC20 functions
        if (!isERC777) {
          try {
            const results = await Promise.allSettled([
              publicClient.readContract({
                address,
                abi: ERC20_DETECTION_ABI,
                functionName: 'totalSupply',
              }),
              publicClient.readContract({
                address,
                abi: ERC20_DETECTION_ABI,
                functionName: 'decimals',
              }),
            ]);

            // If both totalSupply and decimals exist, it's likely ERC20
            const hasTotalSupply = results[0].status === 'fulfilled';
            const hasDecimals = results[1].status === 'fulfilled';

            if (hasTotalSupply && hasDecimals) {
              isERC20 = true;
            }
          } catch {
            // Not ERC20
          }
        }
      }

      // Determine detected type
      let detectedType: TokenType | null = null;
      if (isERC721) {
        detectedType = TokenType.ERC721;
      } else if (isERC1155) {
        detectedType = TokenType.ERC1155;
      } else if (isERC777) {
        detectedType = TokenType.ERC777;
      } else if (isERC20) {
        detectedType = TokenType.ERC20;
      }

      // Check for mismatch
      let mismatch = false;
      let mismatchMessage: string | null = null;

      if (selectedType !== TokenType.NONE && detectedType !== null) {
        if (selectedType !== detectedType) {
          mismatch = true;
          const selectedName = getTokenTypeName(selectedType as TokenType);
          const detectedName = getTokenTypeName(detectedType);
          mismatchMessage = `Selected ${selectedName} but contract appears to be ${detectedName}`;
        }
      }

      // Special case: selected NFT type but contract doesn't support it
      if (selectedType === TokenType.ERC721 && !isERC721) {
        mismatch = true;
        if (isERC1155) {
          mismatchMessage = 'This contract is ERC1155, not ERC721';
        } else if (isERC20 || isERC777) {
          mismatchMessage = 'This appears to be a fungible token (ERC20/ERC777), not ERC721';
        } else {
          mismatchMessage = 'Contract exists but does not support ERC721 interface';
        }
      }

      if (selectedType === TokenType.ERC1155 && !isERC1155) {
        mismatch = true;
        if (isERC721) {
          mismatchMessage = 'This contract is ERC721, not ERC1155';
        } else if (isERC20 || isERC777) {
          mismatchMessage = 'This appears to be a fungible token (ERC20/ERC777), not ERC1155';
        } else {
          mismatchMessage = 'Contract exists but does not support ERC1155 interface';
        }
      }

      if ((selectedType === TokenType.ERC20 || selectedType === TokenType.ERC777) && (isERC721 || isERC1155)) {
        mismatch = true;
        mismatchMessage = `This appears to be an NFT (${isERC721 ? 'ERC721' : 'ERC1155'}), not a fungible token`;
      }

      // Special case: ERC1155 can be used as fungible (like ERC20) or NFT-like
      // If selected as ERC20/ERC777 but detected as ERC1155, warn that ERC1155 can be fungible
      if ((selectedType === TokenType.ERC20 || selectedType === TokenType.ERC777) && isERC1155) {
        mismatch = true;
        mismatchMessage = 'This is an ERC1155 contract. ERC1155 can be fungible (quantity > 1) or NFT-like (quantity = 1). Consider using ERC1155 type instead.';
      }

      setResult({
        detectedType,
        isLoading: false,
        error: null,
        isERC165: supportsERC165,
        isERC721,
        isERC1155,
        isERC20,
        isERC777,
        mismatch,
        mismatchMessage,
      });
    } catch (err) {
      logger.error('Token type detection error:', err);
      setResult({
        detectedType: null,
        isLoading: false,
        error: 'Failed to detect token type',
        isERC165: false,
        isERC721: false,
        isERC1155: false,
        isERC20: false,
        isERC777: false,
        mismatch: false,
        mismatchMessage: null,
      });
    }
  }, [publicClient, tokenAddress, selectedType]);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      detectTokenType();
    }, 500); // Debounce

    return () => clearTimeout(timeoutId);
  }, [detectTokenType]);

  return result;
}

function getTokenTypeName(type: TokenType): string {
  switch (type) {
    case TokenType.ERC20:
      return 'ERC20';
    case TokenType.ERC721:
      return 'ERC721';
    case TokenType.ERC1155:
      return 'ERC1155';
    case TokenType.ERC777:
      return 'ERC777';
    default:
      return 'Unknown';
  }
}

