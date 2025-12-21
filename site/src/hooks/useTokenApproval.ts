import { useCallback } from 'react';
import { 
  useAccount, 
  useChainId, 
  usePublicClient,
  useWriteContract,
} from 'wagmi';
import { type Address, maxUint256, zeroAddress } from 'viem';
import { 
  ERC20_ABI, 
  ERC721_ABI, 
  ERC1155_ABI,
  TOKEN_SWAPPER_ADDRESSES,
  TokenType,
} from '../config/contracts';

export function useTokenApproval() {
  const { address } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const { writeContractAsync, isPending } = useWriteContract();

  const contractAddress = TOKEN_SWAPPER_ADDRESSES[chainId] as Address | undefined;

  const checkERC20Approval = useCallback(async (
    tokenAddress: Address,
    amount: bigint
  ): Promise<boolean> => {
    if (!address || !publicClient) return false;
    
    try {
      const allowance = await publicClient.readContract({
        address: tokenAddress,
        abi: ERC20_ABI,
        functionName: 'allowance',
        args: [address, contractAddress!],
      });
      return (allowance as bigint) >= amount;
    } catch {
      return false;
    }
  }, [address, publicClient, contractAddress]);

  const checkERC721Approval = useCallback(async (
    tokenAddress: Address,
    tokenId: bigint
  ): Promise<boolean> => {
    if (!address || !publicClient || !contractAddress) return false;
    
    try {
      const [approved, isApprovedForAll] = await Promise.all([
        publicClient.readContract({
          address: tokenAddress,
          abi: ERC721_ABI,
          functionName: 'getApproved',
          args: [tokenId],
        }),
        publicClient.readContract({
          address: tokenAddress,
          abi: ERC721_ABI,
          functionName: 'isApprovedForAll',
          args: [address, contractAddress],
        }),
      ]);
      return approved === contractAddress || (isApprovedForAll as boolean);
    } catch {
      return false;
    }
  }, [address, publicClient, contractAddress]);

  const checkERC1155Approval = useCallback(async (
    tokenAddress: Address
  ): Promise<boolean> => {
    if (!address || !publicClient || !contractAddress) return false;
    
    try {
      const isApprovedForAll = await publicClient.readContract({
        address: tokenAddress,
        abi: ERC1155_ABI,
        functionName: 'isApprovedForAll',
        args: [address, contractAddress],
      });
      return isApprovedForAll as boolean;
    } catch {
      return false;
    }
  }, [address, publicClient, contractAddress]);

  const approveERC20 = useCallback(async (
    tokenAddress: Address,
    amount?: bigint
  ) => {
    if (!contractAddress) throw new Error('Contract not deployed');
    
    return writeContractAsync({
      address: tokenAddress,
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [contractAddress, amount ?? maxUint256],
    });
  }, [contractAddress, writeContractAsync]);

  const approveERC721 = useCallback(async (
    tokenAddress: Address,
    tokenId: bigint
  ) => {
    if (!contractAddress) throw new Error('Contract not deployed');
    
    return writeContractAsync({
      address: tokenAddress,
      abi: ERC721_ABI,
      functionName: 'approve',
      args: [contractAddress, tokenId],
    });
  }, [contractAddress, writeContractAsync]);

  const approveERC721ForAll = useCallback(async (
    tokenAddress: Address
  ) => {
    if (!contractAddress) throw new Error('Contract not deployed');
    
    return writeContractAsync({
      address: tokenAddress,
      abi: ERC721_ABI,
      functionName: 'setApprovalForAll',
      args: [contractAddress, true],
    });
  }, [contractAddress, writeContractAsync]);

  const approveERC1155 = useCallback(async (
    tokenAddress: Address
  ) => {
    if (!contractAddress) throw new Error('Contract not deployed');
    
    return writeContractAsync({
      address: tokenAddress,
      abi: ERC1155_ABI,
      functionName: 'setApprovalForAll',
      args: [contractAddress, true],
    });
  }, [contractAddress, writeContractAsync]);

  const checkApproval = useCallback(async (
    tokenType: number,
    tokenAddress: Address,
    tokenId: bigint,
    amount: bigint
  ): Promise<boolean> => {
    switch (tokenType) {
      case TokenType.NONE:
        return true;
      case TokenType.ERC20:
      case TokenType.ERC777:
        return checkERC20Approval(tokenAddress, amount);
      case TokenType.ERC721:
        return checkERC721Approval(tokenAddress, tokenId);
      case TokenType.ERC1155:
        return checkERC1155Approval(tokenAddress);
      default:
        return false;
    }
  }, [checkERC20Approval, checkERC721Approval, checkERC1155Approval]);

  const approve = useCallback(async (
    tokenType: number,
    tokenAddress: Address,
    tokenId: bigint,
    amount: bigint
  ) => {
    switch (tokenType) {
      case TokenType.NONE:
        return;
      case TokenType.ERC20:
      case TokenType.ERC777:
        return approveERC20(tokenAddress, amount);
      case TokenType.ERC721:
        return approveERC721(tokenAddress, tokenId);
      case TokenType.ERC1155:
        return approveERC1155(tokenAddress);
    }
  }, [approveERC20, approveERC721, approveERC1155]);

  const revokeERC20 = useCallback(async (
    tokenAddress: Address
  ) => {
    if (!contractAddress) throw new Error('Contract not deployed');
    
    return writeContractAsync({
      address: tokenAddress,
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [contractAddress, 0n],
    });
  }, [contractAddress, writeContractAsync]);

  const revokeERC721 = useCallback(async (
    tokenAddress: Address,
    tokenId: bigint
  ) => {
    if (!contractAddress) throw new Error('Contract not deployed');
    
    return writeContractAsync({
      address: tokenAddress,
      abi: ERC721_ABI,
      functionName: 'approve',
      args: [zeroAddress, tokenId],
    });
  }, [contractAddress, writeContractAsync]);

  const revokeERC721ForAll = useCallback(async (
    tokenAddress: Address
  ) => {
    if (!contractAddress) throw new Error('Contract not deployed');
    
    return writeContractAsync({
      address: tokenAddress,
      abi: ERC721_ABI,
      functionName: 'setApprovalForAll',
      args: [contractAddress, false],
    });
  }, [contractAddress, writeContractAsync]);

  const revokeERC1155 = useCallback(async (
    tokenAddress: Address
  ) => {
    if (!contractAddress) throw new Error('Contract not deployed');
    
    return writeContractAsync({
      address: tokenAddress,
      abi: ERC1155_ABI,
      functionName: 'setApprovalForAll',
      args: [contractAddress, false],
    });
  }, [contractAddress, writeContractAsync]);

  return {
    checkApproval,
    approve,
    approveERC20,
    approveERC721,
    approveERC721ForAll,
    approveERC1155,
    checkERC20Approval,
    checkERC721Approval,
    checkERC1155Approval,
    revokeERC20,
    revokeERC721,
    revokeERC721ForAll,
    revokeERC1155,
    isPending,
  };
}
