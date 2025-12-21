import type { Address } from 'viem';

// TokenSwapper contract addresses per chain
export const TOKEN_SWAPPER_ADDRESSES: Record<number, Address> = {
  1: '0xF1c35b66F6B94Cb3f7a5004342300F6f7d4edbbd', // Ethereum Mainnet
  11155111: '0xF1c35b66F6B94Cb3f7a5004342300F6f7d4edbbd', // Sepolia
  59144: '0xF1c35b66F6B94Cb3f7a5004342300F6f7d4edbbd', // Linea Mainnet
  59141: '0xF1c35b66F6B94Cb3f7a5004342300F6f7d4edbbd', // Linea Sepolia
};

export const TOKEN_SWAPPER_ABI = [
  {
    inputs: [],
    stateMutability: 'payable',
    type: 'constructor',
  },
  {
    inputs: [],
    name: 'EmptyWithdrawDisallowed',
    type: 'error',
  },
  {
    inputs: [],
    name: 'ETHSendingFailed',
    type: 'error',
  },
  {
    inputs: [
      { internalType: 'uint256', name: 'expectedETHPortion', type: 'uint256' },
    ],
    name: 'IncorrectOrMissingAcceptorETH',
    type: 'error',
  },
  {
    inputs: [
      { internalType: 'uint256', name: 'expected', type: 'uint256' },
      { internalType: 'uint256', name: 'actual', type: 'uint256' },
    ],
    name: 'InitiatorEthPortionNotMatched',
    type: 'error',
  },
  {
    inputs: [
      { internalType: 'address', name: 'expected', type: 'address' },
      { internalType: 'address', name: 'actual', type: 'address' },
    ],
    name: 'InitiatorNotMatched',
    type: 'error',
  },
  {
    inputs: [],
    name: 'NoReentry',
    type: 'error',
  },
  {
    inputs: [],
    name: 'NotAcceptor',
    type: 'error',
  },
  {
    inputs: [],
    name: 'NotInitiator',
    type: 'error',
  },
  {
    inputs: [
      { internalType: 'address', name: 'token', type: 'address' },
    ],
    name: 'SafeERC20FailedOperation',
    type: 'error',
  },
  {
    inputs: [],
    name: 'SwapCompleteOrDoesNotExist',
    type: 'error',
  },
  {
    inputs: [],
    name: 'SwapHasExpired',
    type: 'error',
  },
  {
    inputs: [],
    name: 'SwapIsInThePast',
    type: 'error',
  },
  {
    inputs: [],
    name: 'TokenQuantityMissing',
    type: 'error',
  },
  {
    inputs: [],
    name: 'TwoWayEthPortionsDisallowed',
    type: 'error',
  },
  {
    inputs: [],
    name: 'ValueOrTokenMissing',
    type: 'error',
  },
  {
    inputs: [],
    name: 'ZeroAddressDisallowed',
    type: 'error',
  },
  {
    inputs: [],
    name: 'ZeroAddressSetForValidTokenType',
    type: 'error',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: 'address', name: 'user', type: 'address' },
      { indexed: false, internalType: 'uint256', name: 'amount', type: 'uint256' },
    ],
    name: 'EthPortionTransferred',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: 'uint256', name: 'swapId', type: 'uint256' },
      { indexed: true, internalType: 'address', name: 'initiator', type: 'address' },
      { indexed: true, internalType: 'address', name: 'acceptor', type: 'address' },
      {
        components: [
          { internalType: 'uint256', name: 'expiryDate', type: 'uint256' },
          { internalType: 'address', name: 'initiatorERCContract', type: 'address' },
          { internalType: 'address', name: 'acceptorERCContract', type: 'address' },
          { internalType: 'address', name: 'initiator', type: 'address' },
          { internalType: 'uint256', name: 'initiatorTokenId', type: 'uint256' },
          { internalType: 'uint256', name: 'initiatorTokenQuantity', type: 'uint256' },
          { internalType: 'address', name: 'acceptor', type: 'address' },
          { internalType: 'uint256', name: 'acceptorTokenId', type: 'uint256' },
          { internalType: 'uint256', name: 'acceptorTokenQuantity', type: 'uint256' },
          { internalType: 'uint256', name: 'initiatorETHPortion', type: 'uint256' },
          { internalType: 'uint256', name: 'acceptorETHPortion', type: 'uint256' },
          { internalType: 'enum ISwapTokens.TokenType', name: 'initiatorTokenType', type: 'uint8' },
          { internalType: 'enum ISwapTokens.TokenType', name: 'acceptorTokenType', type: 'uint8' },
        ],
        indexed: false,
        internalType: 'struct ISwapTokens.Swap',
        name: 'swap',
        type: 'tuple',
      },
    ],
    name: 'SwapComplete',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: 'uint256', name: 'swapId', type: 'uint256' },
      { indexed: true, internalType: 'address', name: 'initiator', type: 'address' },
      { indexed: true, internalType: 'address', name: 'acceptor', type: 'address' },
      {
        components: [
          { internalType: 'uint256', name: 'expiryDate', type: 'uint256' },
          { internalType: 'address', name: 'initiatorERCContract', type: 'address' },
          { internalType: 'address', name: 'acceptorERCContract', type: 'address' },
          { internalType: 'address', name: 'initiator', type: 'address' },
          { internalType: 'uint256', name: 'initiatorTokenId', type: 'uint256' },
          { internalType: 'uint256', name: 'initiatorTokenQuantity', type: 'uint256' },
          { internalType: 'address', name: 'acceptor', type: 'address' },
          { internalType: 'uint256', name: 'acceptorTokenId', type: 'uint256' },
          { internalType: 'uint256', name: 'acceptorTokenQuantity', type: 'uint256' },
          { internalType: 'uint256', name: 'initiatorETHPortion', type: 'uint256' },
          { internalType: 'uint256', name: 'acceptorETHPortion', type: 'uint256' },
          { internalType: 'enum ISwapTokens.TokenType', name: 'initiatorTokenType', type: 'uint8' },
          { internalType: 'enum ISwapTokens.TokenType', name: 'acceptorTokenType', type: 'uint8' },
        ],
        indexed: false,
        internalType: 'struct ISwapTokens.Swap',
        name: 'swap',
        type: 'tuple',
      },
    ],
    name: 'SwapInitiated',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: 'uint256', name: 'swapId', type: 'uint256' },
      { indexed: true, internalType: 'address', name: 'initiator', type: 'address' },
    ],
    name: 'SwapRemoved',
    type: 'event',
  },
  {
    inputs: [
      { internalType: 'uint256', name: '_swapId', type: 'uint256' },
      {
        components: [
          { internalType: 'uint256', name: 'expiryDate', type: 'uint256' },
          { internalType: 'address', name: 'initiatorERCContract', type: 'address' },
          { internalType: 'address', name: 'acceptorERCContract', type: 'address' },
          { internalType: 'address', name: 'initiator', type: 'address' },
          { internalType: 'uint256', name: 'initiatorTokenId', type: 'uint256' },
          { internalType: 'uint256', name: 'initiatorTokenQuantity', type: 'uint256' },
          { internalType: 'address', name: 'acceptor', type: 'address' },
          { internalType: 'uint256', name: 'acceptorTokenId', type: 'uint256' },
          { internalType: 'uint256', name: 'acceptorTokenQuantity', type: 'uint256' },
          { internalType: 'uint256', name: 'initiatorETHPortion', type: 'uint256' },
          { internalType: 'uint256', name: 'acceptorETHPortion', type: 'uint256' },
          { internalType: 'enum ISwapTokens.TokenType', name: 'initiatorTokenType', type: 'uint8' },
          { internalType: 'enum ISwapTokens.TokenType', name: 'acceptorTokenType', type: 'uint8' },
        ],
        internalType: 'struct ISwapTokens.Swap',
        name: '_swap',
        type: 'tuple',
      },
    ],
    name: 'completeSwap',
    outputs: [],
    stateMutability: 'payable',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'uint256', name: '_swapId', type: 'uint256' },
      {
        components: [
          { internalType: 'uint256', name: 'expiryDate', type: 'uint256' },
          { internalType: 'address', name: 'initiatorERCContract', type: 'address' },
          { internalType: 'address', name: 'acceptorERCContract', type: 'address' },
          { internalType: 'address', name: 'initiator', type: 'address' },
          { internalType: 'uint256', name: 'initiatorTokenId', type: 'uint256' },
          { internalType: 'uint256', name: 'initiatorTokenQuantity', type: 'uint256' },
          { internalType: 'address', name: 'acceptor', type: 'address' },
          { internalType: 'uint256', name: 'acceptorTokenId', type: 'uint256' },
          { internalType: 'uint256', name: 'acceptorTokenQuantity', type: 'uint256' },
          { internalType: 'uint256', name: 'initiatorETHPortion', type: 'uint256' },
          { internalType: 'uint256', name: 'acceptorETHPortion', type: 'uint256' },
          { internalType: 'enum ISwapTokens.TokenType', name: 'initiatorTokenType', type: 'uint8' },
          { internalType: 'enum ISwapTokens.TokenType', name: 'acceptorTokenType', type: 'uint8' },
        ],
        internalType: 'struct ISwapTokens.Swap',
        name: '_swap',
        type: 'tuple',
      },
    ],
    name: 'getSwapStatus',
    outputs: [
      {
        components: [
          { internalType: 'bool', name: 'initiatorNeedsToOwnToken', type: 'bool' },
          { internalType: 'bool', name: 'acceptorNeedsToOwnToken', type: 'bool' },
          { internalType: 'bool', name: 'initiatorTokenRequiresApproval', type: 'bool' },
          { internalType: 'bool', name: 'acceptorTokenRequiresApproval', type: 'bool' },
          { internalType: 'bool', name: 'isReadyForSwapping', type: 'bool' },
        ],
        internalType: 'struct ISwapTokens.SwapStatus',
        name: 'swapStatus',
        type: 'tuple',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      {
        components: [
          { internalType: 'uint256', name: 'expiryDate', type: 'uint256' },
          { internalType: 'address', name: 'initiatorERCContract', type: 'address' },
          { internalType: 'address', name: 'acceptorERCContract', type: 'address' },
          { internalType: 'address', name: 'initiator', type: 'address' },
          { internalType: 'uint256', name: 'initiatorTokenId', type: 'uint256' },
          { internalType: 'uint256', name: 'initiatorTokenQuantity', type: 'uint256' },
          { internalType: 'address', name: 'acceptor', type: 'address' },
          { internalType: 'uint256', name: 'acceptorTokenId', type: 'uint256' },
          { internalType: 'uint256', name: 'acceptorTokenQuantity', type: 'uint256' },
          { internalType: 'uint256', name: 'initiatorETHPortion', type: 'uint256' },
          { internalType: 'uint256', name: 'acceptorETHPortion', type: 'uint256' },
          { internalType: 'enum ISwapTokens.TokenType', name: 'initiatorTokenType', type: 'uint8' },
          { internalType: 'enum ISwapTokens.TokenType', name: 'acceptorTokenType', type: 'uint8' },
        ],
        internalType: 'struct ISwapTokens.Swap',
        name: '_swap',
        type: 'tuple',
      },
    ],
    name: 'initiateSwap',
    outputs: [],
    stateMutability: 'payable',
    type: 'function',
  },
  {
    inputs: [],
    name: 'isSwappingTokensOnSameContract',
    outputs: [
      { internalType: 'bool', name: 'isSameContractSwap', type: 'bool' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'uint256', name: '_swapId', type: 'uint256' },
      {
        components: [
          { internalType: 'uint256', name: 'expiryDate', type: 'uint256' },
          { internalType: 'address', name: 'initiatorERCContract', type: 'address' },
          { internalType: 'address', name: 'acceptorERCContract', type: 'address' },
          { internalType: 'address', name: 'initiator', type: 'address' },
          { internalType: 'uint256', name: 'initiatorTokenId', type: 'uint256' },
          { internalType: 'uint256', name: 'initiatorTokenQuantity', type: 'uint256' },
          { internalType: 'address', name: 'acceptor', type: 'address' },
          { internalType: 'uint256', name: 'acceptorTokenId', type: 'uint256' },
          { internalType: 'uint256', name: 'acceptorTokenQuantity', type: 'uint256' },
          { internalType: 'uint256', name: 'initiatorETHPortion', type: 'uint256' },
          { internalType: 'uint256', name: 'acceptorETHPortion', type: 'uint256' },
          { internalType: 'enum ISwapTokens.TokenType', name: 'initiatorTokenType', type: 'uint8' },
          { internalType: 'enum ISwapTokens.TokenType', name: 'acceptorTokenType', type: 'uint8' },
        ],
        internalType: 'struct ISwapTokens.Swap',
        name: '_swap',
        type: 'tuple',
      },
    ],
    name: 'removeSwap',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'uint256', name: 'id', type: 'uint256' },
    ],
    name: 'swapHashes',
    outputs: [
      { internalType: 'bytes32', name: 'hashedSwap', type: 'bytes32' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'swapId',
    outputs: [
      { internalType: 'uint256', name: '', type: 'uint256' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

// ERC20 ABI (minimal for approval)
export const ERC20_ABI = [
  {
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    name: 'approve',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    name: 'allowance',
    outputs: [{ name: '', type: 'uint256' }],
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
  {
    inputs: [],
    name: 'decimals',
    outputs: [{ name: '', type: 'uint8' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'symbol',
    outputs: [{ name: '', type: 'string' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'name',
    outputs: [{ name: '', type: 'string' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

// ERC721 ABI (minimal for approval)
export const ERC721_ABI = [
  {
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'tokenId', type: 'uint256' },
    ],
    name: 'approve',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { name: 'operator', type: 'address' },
      { name: 'approved', type: 'bool' },
    ],
    name: 'setApprovalForAll',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    name: 'getApproved',
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'operator', type: 'address' },
    ],
    name: 'isApprovedForAll',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    name: 'ownerOf',
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'name',
    outputs: [{ name: '', type: 'string' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'symbol',
    outputs: [{ name: '', type: 'string' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

// ERC1155 ABI (minimal for approval)
export const ERC1155_ABI = [
  {
    inputs: [
      { name: 'operator', type: 'address' },
      { name: 'approved', type: 'bool' },
    ],
    name: 'setApprovalForAll',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { name: 'account', type: 'address' },
      { name: 'operator', type: 'address' },
    ],
    name: 'isApprovedForAll',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { name: 'account', type: 'address' },
      { name: 'id', type: 'uint256' },
    ],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

// Token Types
export const TokenType = {
  NONE: 0,
  ERC20: 1,
  ERC777: 2,
  ERC721: 3,
  ERC1155: 4,
} as const;

export type TokenType = typeof TokenType[keyof typeof TokenType];

export const TOKEN_TYPE_LABELS: Record<number, string> = {
  [TokenType.NONE]: 'ETH Only',
  [TokenType.ERC20]: 'ERC20',
  [TokenType.ERC777]: 'ERC777',
  [TokenType.ERC721]: 'ERC721 (NFT)',
  [TokenType.ERC1155]: 'ERC1155',
};

// Swap type for TypeScript
export interface Swap {
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
}

export interface SwapStatus {
  initiatorNeedsToOwnToken: boolean;
  acceptorNeedsToOwnToken: boolean;
  initiatorTokenRequiresApproval: boolean;
  acceptorTokenRequiresApproval: boolean;
  isReadyForSwapping: boolean;
}

export interface SwapWithId {
  swapId: bigint;
  swap: Swap;
  blockNumber: bigint;
}

