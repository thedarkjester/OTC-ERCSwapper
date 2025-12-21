import { useState, useEffect, useCallback } from 'react';
import { useChainId } from 'wagmi';
import { isAddress } from 'viem';
import { logger } from '../utils/logger';

// Block explorer configs
const EXPLORER_CONFIG: Record<number, { 
  name: string; 
  explorerUrl: string;
  sourcifyChainId?: string;
}> = {
  1: { 
    name: 'Etherscan',
    explorerUrl: 'https://etherscan.io',
    sourcifyChainId: '1',
  },
  11155111: { 
    name: 'Sepolia Etherscan',
    explorerUrl: 'https://sepolia.etherscan.io',
    sourcifyChainId: '11155111',
  },
  59144: { 
    name: 'Lineascan',
    explorerUrl: 'https://lineascan.build',
    sourcifyChainId: '59144',
  },
  59140: { 
    name: 'Linea Sepolia Scan',
    explorerUrl: 'https://sepolia.lineascan.build',
    sourcifyChainId: '59140',
  },
};

export interface ContractVerificationResult {
  isVerified: boolean | null;
  isLoading: boolean;
  error: string | null;
  contractName: string | null;
  explorerUrl: string | null;
  explorerName: string | null;
  sourcifyUrl: string | null;
}

export function useContractVerification(contractAddress: string): ContractVerificationResult {
  const chainId = useChainId();
  const [result, setResult] = useState<ContractVerificationResult>({
    isVerified: null,
    isLoading: false,
    error: null,
    contractName: null,
    explorerUrl: null,
    explorerName: null,
    sourcifyUrl: null,
  });

  const checkVerification = useCallback(async () => {
    if (!contractAddress || !isAddress(contractAddress)) {
      setResult({
        isVerified: null,
        isLoading: false,
        error: null,
        contractName: null,
        explorerUrl: null,
        explorerName: null,
        sourcifyUrl: null,
      });
      return;
    }

    const config = EXPLORER_CONFIG[chainId];
    if (!config) {
      setResult({
        isVerified: null,
        isLoading: false,
        error: 'Unsupported chain',
        contractName: null,
        explorerUrl: null,
        explorerName: null,
        sourcifyUrl: null,
      });
      return;
    }

    setResult(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      // Use Sourcify - free, open source verification service
      // https://docs.sourcify.dev/docs/api/repository/check-by-addresses/
      const sourcifyUrl = `https://sourcify.dev/server/check-by-addresses?addresses=${contractAddress}&chainIds=${config.sourcifyChainId}`;
      
      const response = await fetch(sourcifyUrl, {
        signal: AbortSignal.timeout(8000),
      });

      if (response.ok) {
        const data = await response.json();
        // Sourcify returns array of results
        // status can be "perfect", "partial", or "false"
        const contractResult = data[0];
        const isVerified = contractResult?.status === 'perfect' || contractResult?.status === 'partial';
        
        setResult({
          isVerified,
          isLoading: false,
          error: null,
          contractName: null, // Sourcify doesn't return contract name in this endpoint
          explorerUrl: `${config.explorerUrl}/address/${contractAddress}#code`,
          explorerName: config.name,
          sourcifyUrl: isVerified 
            ? `https://sourcify.dev/#/lookup/${contractAddress}` 
            : null,
        });
      } else {
        // Sourcify returned error - contract likely not verified there
        // Still provide explorer link
        setResult({
          isVerified: null, // Unknown - not verified on Sourcify, might be on Etherscan
          isLoading: false,
          error: null,
          contractName: null,
          explorerUrl: `${config.explorerUrl}/address/${contractAddress}#code`,
          explorerName: config.name,
          sourcifyUrl: null,
        });
      }
    } catch (err) {
      logger.error('Sourcify verification check error:', err);
      
      const config = EXPLORER_CONFIG[chainId];
      setResult({
        isVerified: null,
        isLoading: false,
        error: null, // Don't show error, just show "check on explorer"
        contractName: null,
        explorerUrl: config ? `${config.explorerUrl}/address/${contractAddress}#code` : null,
        explorerName: config?.name || null,
        sourcifyUrl: null,
      });
    }
  }, [contractAddress, chainId]);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      checkVerification();
    }, 800);

    return () => clearTimeout(timeoutId);
  }, [checkVerification]);

  return result;
}
