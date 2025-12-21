import { useCallback } from 'react';
import { 
  useAccount, 
  useChainId, 
  usePublicClient,
  useWriteContract,
  useWaitForTransactionReceipt,
} from 'wagmi';
import { parseEther, zeroAddress, type Address } from 'viem';
import { 
  TOKEN_SWAPPER_ABI, 
  TOKEN_SWAPPER_ADDRESSES,
  type Swap,
  type SwapStatus,
} from '../config/contracts';


export function useSwapContract() {
  const { address } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const { writeContractAsync, data: hash, isPending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const contractAddress = TOKEN_SWAPPER_ADDRESSES[chainId] as Address | undefined;

  const initiateSwap = useCallback(async (swap: Swap) => {
    if (!contractAddress) throw new Error('Contract not deployed on this chain');
    
    return writeContractAsync({
      address: contractAddress,
      abi: TOKEN_SWAPPER_ABI,
      functionName: 'initiateSwap',
      args: [swap as never],
      value: swap.initiatorETHPortion,
    });
  }, [contractAddress, writeContractAsync]);

  const completeSwap = useCallback(async (swapId: bigint, swap: Swap) => {
    if (!contractAddress) throw new Error('Contract not deployed on this chain');
    
    return writeContractAsync({
      address: contractAddress,
      abi: TOKEN_SWAPPER_ABI,
      functionName: 'completeSwap',
      args: [swapId, swap as never],
      value: swap.acceptorETHPortion,
    });
  }, [contractAddress, writeContractAsync]);

  const removeSwap = useCallback(async (swapId: bigint, swap: Swap) => {
    if (!contractAddress) throw new Error('Contract not deployed on this chain');
    
    return writeContractAsync({
      address: contractAddress,
      abi: TOKEN_SWAPPER_ABI,
      functionName: 'removeSwap',
      args: [swapId, swap as never],
    });
  }, [contractAddress, writeContractAsync]);

  const getSwapStatus = useCallback(async (swapId: bigint, swap: Swap): Promise<SwapStatus | null> => {
    if (!contractAddress || !publicClient) throw new Error('Contract not available');
    
    try {
      const result = await publicClient.readContract({
        address: contractAddress,
        abi: TOKEN_SWAPPER_ABI,
        functionName: 'getSwapStatus',
        args: [swapId, swap as never],
      });
      
      return result as SwapStatus;
    } catch (error: any) {
      // Handle the case where swap is completed or doesn't exist
      // The contract reverts with SwapCompleteOrDoesNotExist() error
      if (error?.cause?.reason === 'SwapCompleteOrDoesNotExist()' || 
          error?.message?.includes('SwapCompleteOrDoesNotExist') ||
          error?.shortMessage?.includes('SwapCompleteOrDoesNotExist')) {
        // Return null to indicate swap is completed or doesn't exist
        return null;
      }
      // Re-throw other errors
      throw error;
    }
  }, [contractAddress, publicClient]);

  const getSwapHash = useCallback(async (swapId: bigint): Promise<`0x${string}`> => {
    if (!contractAddress || !publicClient) throw new Error('Contract not available');
    
    const result = await publicClient.readContract({
      address: contractAddress,
      abi: TOKEN_SWAPPER_ABI,
      functionName: 'swapHashes',
      args: [swapId],
    });
    
    return result as `0x${string}`;
  }, [contractAddress, publicClient]);

  return {
    address,
    chainId,
    contractAddress,
    initiateSwap,
    completeSwap,
    removeSwap,
    getSwapStatus,
    getSwapHash,
    isPending,
    isConfirming,
    isSuccess,
    hash,
  };
}

// Helper to safely parse BigInt values
function safeParseBigInt(value: string, field: string): bigint {
  try {
    if (!value || value === '0') return 0n;
    const parsed = BigInt(value);
    if (parsed < 0n) {
      throw new Error(`${field} cannot be negative`);
    }
    return parsed;
  } catch (error) {
    throw new Error(`Invalid ${field}: ${value}`);
  }
}

// Helper to create swap struct from form data
export function createSwapFromForm(
  initiator: Address,
  formData: {
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
): Swap {
  const expiryDate = BigInt(Math.floor(Date.now() / 1000) + formData.expiryDays * 86400);
  
  return {
    expiryDate,
    initiatorERCContract: (formData.initiatorTokenType === 0 ? zeroAddress : formData.initiatorERCContract) as Address,
    acceptorERCContract: (formData.acceptorTokenType === 0 ? zeroAddress : formData.acceptorERCContract) as Address,
    initiator,
    initiatorTokenId: safeParseBigInt(formData.initiatorTokenId || '0', 'initiatorTokenId'),
    initiatorTokenQuantity: safeParseBigInt(formData.initiatorTokenQuantity || '0', 'initiatorTokenQuantity'),
    acceptor: (formData.acceptor || zeroAddress) as Address,
    acceptorTokenId: safeParseBigInt(formData.acceptorTokenId || '0', 'acceptorTokenId'),
    acceptorTokenQuantity: safeParseBigInt(formData.acceptorTokenQuantity || '0', 'acceptorTokenQuantity'),
    initiatorETHPortion: formData.initiatorETHPortion ? parseEther(formData.initiatorETHPortion) : 0n,
    acceptorETHPortion: formData.acceptorETHPortion ? parseEther(formData.acceptorETHPortion) : 0n,
    initiatorTokenType: formData.initiatorTokenType,
    acceptorTokenType: formData.acceptorTokenType,
  };
}
