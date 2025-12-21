import type { Address } from 'viem';

export interface SwapFormData {
  // Initiator side
  initiatorTokenType: number;
  initiatorERCContract: string;
  initiatorTokenId: string;
  initiatorTokenQuantity: string;
  initiatorETHPortion: string;
  
  // Acceptor side
  acceptorTokenType: number;
  acceptorERCContract: string;
  acceptorTokenId: string;
  acceptorTokenQuantity: string;
  acceptorETHPortion: string;
  acceptor: string;
  
  // Expiry
  expiryDays: number;
}

export interface ParsedSwapEvent {
  swapId: bigint;
  initiator: Address;
  acceptor: Address;
  swap: {
    expiryDate: bigint;
    initiatorERCContract: Address;
    acceptorERCContract: Address;
    initiator: Address;
    initiatorTokenId: bigint;
    initiatorTokenQuantity: bigint;
    acceptor: Address;
    acceptorTokenId: bigint;
    acceptorTokenQuantity: bigint;
    initiatorETHPortion: bigint;
    acceptorETHPortion: bigint;
    initiatorTokenType: number;
    acceptorTokenType: number;
  };
  blockNumber: bigint;
  transactionHash: `0x${string}`; // initiateSwap transaction hash
  completeTransactionHash?: `0x${string}`; // completeSwap transaction hash (if exists)
}

export type SwapTab = 'create' | 'my-swaps' | 'accept' | 'revoke';

