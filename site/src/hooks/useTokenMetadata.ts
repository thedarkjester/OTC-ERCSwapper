import { useState, useEffect, useCallback } from 'react';
import { usePublicClient } from 'wagmi';
import { type Address, isAddress } from 'viem';
import { ERC20_ABI, ERC721_ABI, TokenType } from '../config/contracts';
import { sanitizeText, sanitizeImageUrl, safeJsonParse, sanitizeObject, truncateText } from '../utils/sanitize';
import { logger } from '../utils/logger';

// ERC721 metadata extension
const ERC721_METADATA_ABI = [
  ...ERC721_ABI,
  {
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    name: 'tokenURI',
    outputs: [{ name: '', type: 'string' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

// ERC1155 metadata extension
const ERC1155_METADATA_ABI = [
  {
    inputs: [{ name: 'id', type: 'uint256' }],
    name: 'uri',
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
  {
    inputs: [],
    name: 'symbol',
    outputs: [{ name: '', type: 'string' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

// Multiple IPFS gateways for fallback
const IPFS_GATEWAYS = [
  'https://cloudflare-ipfs.com/ipfs/',
  'https://ipfs.io/ipfs/',
  'https://gateway.pinata.cloud/ipfs/',
  'https://dweb.link/ipfs/',
];

// Common image file extensions
const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.avif', '.bmp'];

// Common field names that might contain image URLs
const IMAGE_FIELD_NAMES = [
  'image',
  'image_url',
  'imageUrl',
  'image_uri',
  'imageUri',
  'animation_url',
  'animationUrl',
  'animation_uri',
  'media',
  'media_url',
  'mediaUrl',
  'artwork',
  'artwork_url',
  'artworkUrl',
  'thumbnail',
  'thumbnail_url',
  'thumbnailUrl',
  'asset',
  'asset_url',
  'assetUrl',
  'file',
  'file_url',
  'fileUrl',
  'src',
  'url',
  'uri',
];

export interface TokenMetadata {
  name: string | null;
  symbol: string | null;
  decimals: number | null;
  tokenURI: string | null;
  imageUrl: string | null;
  nftName: string | null;
  nftDescription: string | null;
}

export interface TokenMetadataState {
  metadata: TokenMetadata | null;
  isLoading: boolean;
  error: string | null;
}

export function useTokenMetadata(
  tokenAddress: string,
  tokenType: number,
  tokenId?: string
): TokenMetadataState {
  const publicClient = usePublicClient();
  const [state, setState] = useState<TokenMetadataState>({
    metadata: null,
    isLoading: false,
    error: null,
  });

  const fetchMetadata = useCallback(async () => {
    if (!publicClient || !tokenAddress || !isAddress(tokenAddress)) {
      setState({ metadata: null, isLoading: false, error: null });
      return;
    }

    setState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      const metadata: TokenMetadata = {
        name: null,
        symbol: null,
        decimals: null,
        tokenURI: null,
        imageUrl: null,
        nftName: null,
        nftDescription: null,
      };

      if (tokenType === TokenType.ERC20 || tokenType === TokenType.ERC777) {
        // Fetch ERC20/ERC777 metadata
        const results = await Promise.allSettled([
          publicClient.readContract({
            address: tokenAddress as Address,
            abi: ERC20_ABI,
            functionName: 'name',
          }),
          publicClient.readContract({
            address: tokenAddress as Address,
            abi: ERC20_ABI,
            functionName: 'symbol',
          }),
          publicClient.readContract({
            address: tokenAddress as Address,
            abi: ERC20_ABI,
            functionName: 'decimals',
          }),
        ]);

        if (results[0].status === 'fulfilled') metadata.name = sanitizeText(results[0].value as string);
        if (results[1].status === 'fulfilled') metadata.symbol = sanitizeText(results[1].value as string);
        if (results[2].status === 'fulfilled') metadata.decimals = results[2].value as number;

      } else if (tokenType === TokenType.ERC721) {
        // Fetch ERC721 metadata
        const results = await Promise.allSettled([
          publicClient.readContract({
            address: tokenAddress as Address,
            abi: ERC721_ABI,
            functionName: 'name',
          }),
          publicClient.readContract({
            address: tokenAddress as Address,
            abi: ERC721_ABI,
            functionName: 'symbol',
          }),
          tokenId ? publicClient.readContract({
            address: tokenAddress as Address,
            abi: ERC721_METADATA_ABI,
            functionName: 'tokenURI',
            args: [BigInt(tokenId)],
          }) : Promise.reject('No token ID'),
        ]);

        if (results[0].status === 'fulfilled') metadata.name = sanitizeText(results[0].value as string);
        if (results[1].status === 'fulfilled') metadata.symbol = sanitizeText(results[1].value as string);
        if (results[2].status === 'fulfilled') {
          const rawUri = results[2].value as string;
          // Sanitize tokenURI but keep original for display (will be sanitized when used)
          metadata.tokenURI = truncateText(rawUri, 2000);
          logger.log('Token URI:', rawUri);
          
          // Try to fetch NFT metadata from URI
          const nftMeta = await fetchNFTMetadata(rawUri);
          logger.log('fetchNFTMetadata returned:', nftMeta);
          if (nftMeta) {
            logger.log('Raw image URL from metadata:', nftMeta.image);
            // resolveImageUrl already handles IPFS/Arweave conversion and returns a safe URL
            // Just use it directly - no need to double-sanitize
            metadata.imageUrl = nftMeta.image; // Already resolved by resolveImageUrl in fetchNFTMetadata
            logger.log('Setting metadata.imageUrl to:', metadata.imageUrl);
            metadata.nftName = sanitizeText(nftMeta.name);
            metadata.nftDescription = sanitizeText(nftMeta.description);
          }
        }

      } else if (tokenType === TokenType.ERC1155) {
        // Fetch ERC1155 metadata
        const results = await Promise.allSettled([
          publicClient.readContract({
            address: tokenAddress as Address,
            abi: ERC1155_METADATA_ABI,
            functionName: 'name',
          }),
          publicClient.readContract({
            address: tokenAddress as Address,
            abi: ERC1155_METADATA_ABI,
            functionName: 'symbol',
          }),
          tokenId ? publicClient.readContract({
            address: tokenAddress as Address,
            abi: ERC1155_METADATA_ABI,
            functionName: 'uri',
            args: [BigInt(tokenId)],
          }) : Promise.reject('No token ID'),
        ]);

        if (results[0].status === 'fulfilled') metadata.name = sanitizeText(results[0].value as string);
        if (results[1].status === 'fulfilled') metadata.symbol = sanitizeText(results[1].value as string);
        if (results[2].status === 'fulfilled') {
          let uri = results[2].value as string;
          // ERC1155 URI may have {id} placeholder
          if (tokenId) {
            uri = uri.replace('{id}', BigInt(tokenId).toString(16).padStart(64, '0'));
          }
          metadata.tokenURI = truncateText(uri, 2000);
          const nftMeta = await fetchNFTMetadata(uri);
          if (nftMeta) {
            logger.log('ERC1155 - Raw image URL from metadata:', nftMeta.image);
            // resolveImageUrl already handles IPFS/Arweave conversion and returns a safe URL
            // Just use it directly - no need to double-sanitize
            metadata.imageUrl = nftMeta.image; // Already resolved by resolveImageUrl in fetchNFTMetadata
            logger.log('ERC1155 - Setting metadata.imageUrl to:', metadata.imageUrl);
            metadata.nftName = sanitizeText(nftMeta.name);
            metadata.nftDescription = sanitizeText(nftMeta.description);
          }
        }
      }

      logger.log('Final metadata state:', metadata);
      setState({ metadata, isLoading: false, error: null });
    } catch (err) {
      logger.error('Token metadata fetch error:', err);
      setState({ 
        metadata: null, 
        isLoading: false, 
        error: 'Failed to load token metadata' 
      });
    }
  }, [publicClient, tokenAddress, tokenType, tokenId]);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      fetchMetadata();
    }, 500); // Debounce

    return () => clearTimeout(timeoutId);
  }, [fetchMetadata]);

  return state;
}

/**
 * Check if a URL looks like an image URL based on extension
 */
function isImageUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false;
  const lowerUrl = url.toLowerCase();
  
  // Check for common image extensions
  if (IMAGE_EXTENSIONS.some(ext => lowerUrl.endsWith(ext))) {
    return true;
  }
  
  // Check for data URIs that are images
  if (lowerUrl.startsWith('data:image/')) {
    return true;
  }
  
  // Check for IPFS URIs (often images)
  if (lowerUrl.startsWith('ipfs://') || lowerUrl.includes('/ipfs/')) {
    // Could be image or JSON, but worth considering
    return IMAGE_EXTENSIONS.some(ext => lowerUrl.endsWith(ext));
  }
  
  return false;
}

/**
 * Deep search an object for image URLs
 */
function findImageInObject(obj: unknown, depth = 0): string | null {
  if (depth > 5) return null; // Prevent infinite recursion
  
  if (!obj || typeof obj !== 'object') return null;
  
  const data = obj as Record<string, unknown>;
  
  // First, check known image field names
  for (const fieldName of IMAGE_FIELD_NAMES) {
    const value = data[fieldName];
    if (typeof value === 'string' && value.length > 0) {
      // Check if it's a valid URL or URI
      if (value.startsWith('http') || value.startsWith('ipfs://') || 
          value.startsWith('ar://') || value.startsWith('data:')) {
        logger.log(`Found image in field "${fieldName}":`, value);
        return value;
      }
    }
  }
  
  // Second, scan all string values for image URLs by extension
  for (const [key, value] of Object.entries(data)) {
    if (typeof value === 'string' && isImageUrl(value)) {
      logger.log(`Found image URL by extension in field "${key}":`, value);
      return value;
    }
  }
  
  // Third, recursively search nested objects
  for (const value of Object.values(data)) {
    if (typeof value === 'object' && value !== null) {
      const found = findImageInObject(value, depth + 1);
      if (found) return found;
    }
  }
  
  return null;
}

/**
 * Infer possible image URLs from a tokenURI
 * Many NFT projects use predictable URL patterns
 */
function inferImageUrls(uri: string): string[] {
  const candidates: string[] = [];
  
  // Common pattern: /token/N -> /media/N.ext or /image/N.ext or /images/N.ext
  const tokenMatch = uri.match(/^(.+)\/token\/(\d+)$/);
  if (tokenMatch) {
    const base = tokenMatch[1];
    const id = tokenMatch[2];
    
    for (const folder of ['media', 'image', 'images', 'assets', 'art', 'artwork']) {
      for (const ext of ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg']) {
        candidates.push(`${base}/${folder}/${id}${ext}`);
      }
    }
  }
  
  // Pattern: /metadata/N -> /image/N.ext
  const metadataMatch = uri.match(/^(.+)\/metadata\/(\d+)(\.json)?$/);
  if (metadataMatch) {
    const base = metadataMatch[1];
    const id = metadataMatch[2];
    
    for (const folder of ['image', 'images', 'media', 'assets']) {
      for (const ext of ['.png', '.jpg', '.jpeg', '.gif', '.webp']) {
        candidates.push(`${base}/${folder}/${id}${ext}`);
      }
    }
  }
  
  // Pattern: ends with .json -> try same name with image extensions
  if (uri.endsWith('.json')) {
    const basePath = uri.slice(0, -5);
    for (const ext of ['.png', '.jpg', '.jpeg', '.gif', '.webp']) {
      candidates.push(basePath + ext);
    }
  }
  
  return candidates;
}

/**
 * Try to load an image URL and check if it's valid
 */
function tryLoadImage(url: string): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image();
    const timeout = setTimeout(() => {
      img.src = '';
      resolve(null);
    }, 5000);
    
    img.onload = () => {
      clearTimeout(timeout);
      resolve(url);
    };
    img.onerror = () => {
      clearTimeout(timeout);
      resolve(null);
    };
    img.src = url;
  });
}

async function fetchNFTMetadata(uri: string): Promise<{ name: string | null; description: string | null; image: string | null } | null> {
  try {
    logger.log('Fetching NFT metadata from:', uri);
    
    // Handle data URIs (base64 encoded JSON)
    if (uri.startsWith('data:application/json;base64,')) {
      const base64Data = uri.split(',')[1];
      if (!base64Data || base64Data.length > 1000000) { // Limit size to prevent DoS
        logger.warn('Blocked oversized or invalid base64 data URI');
        return null;
      }
      try {
        const jsonString = atob(base64Data);
        const data = safeJsonParse<Record<string, unknown>>(jsonString);
        if (!data) return null;
        
        const sanitized = sanitizeObject(data);
        const image = findImageInObject(sanitized);
        return {
          name: sanitizeText(data.name as string | undefined) || null,
          description: sanitizeText(data.description as string | undefined) || null,
          image: resolveImageUrl(image) ?? null,
        };
      } catch (err) {
        logger.error('Failed to parse base64 JSON:', err);
        return null;
      }
    }
    
    // Handle data URIs (URL encoded JSON)
    if (uri.startsWith('data:application/json,')) {
      const encodedData = uri.split(',')[1];
      if (!encodedData || encodedData.length > 1000000) { // Limit size
        logger.warn('Blocked oversized or invalid URL-encoded data URI');
        return null;
      }
      try {
        const jsonString = decodeURIComponent(encodedData);
        const data = safeJsonParse<Record<string, unknown>>(jsonString);
        if (!data) return null;
        
        const sanitized = sanitizeObject(data);
        const image = findImageInObject(sanitized);
        return {
          name: sanitizeText(data.name as string | undefined) || null,
          description: sanitizeText(data.description as string | undefined) || null,
          image: resolveImageUrl(image) ?? null,
        };
      } catch (err) {
        logger.error('Failed to parse URL-encoded JSON:', err);
        return null;
      }
    }

    // Convert URI to fetchable URL
    const fetchUrl = convertToHttpUrl(uri);
    logger.log('Fetching from URL:', fetchUrl);

    // Try to fetch with CORS mode
    const response = await fetchWithFallback(fetchUrl, uri);
    
    if (!response) {
      logger.warn('Failed to fetch metadata (likely CORS), trying to infer image URL...');
      
      // Try to infer image URL from tokenURI pattern
      const candidates = inferImageUrls(uri);
      logger.log('Inferred image URL candidates:', candidates);
      
      // Try loading each candidate image
      for (const candidate of candidates) {
        logger.log('Trying image candidate:', candidate);
        const loadedUrl = await tryLoadImage(candidate);
        if (loadedUrl) {
          logger.log('Successfully loaded image:', loadedUrl);
          return {
            name: null,
            description: null,
            image: loadedUrl,
          };
        }
      }
      
      logger.log('No inferred images worked');
      return null;
    }
    
    // Check content type - might be an image directly
    const contentType = response.headers.get('content-type') || '';
    if (contentType.startsWith('image/')) {
      logger.log('URI points directly to an image');
      return {
        name: null,
        description: null,
        image: resolveImageUrl(uri) ?? null,
      };
    }
    
    // Limit response size to prevent DoS
    const text = await response.text();
    if (text.length > 1000000) { // 1MB limit
      logger.warn('Blocked oversized JSON response');
      return null;
    }
    
    const data = safeJsonParse<Record<string, unknown>>(text);
    if (!data) {
      logger.warn('Failed to parse JSON safely');
      return null;
    }
    
    logger.log('Fetched metadata JSON:', data);
    
    // Sanitize object to prevent prototype pollution
    const sanitized = sanitizeObject(data);
    
    // Use deep search to find image
    const rawImage = findImageInObject(sanitized);
    logger.log('findImageInObject returned:', rawImage);
    
    // resolveImageUrl already handles IPFS/Arweave conversion and basic sanitization
    // Don't double-sanitize here - just return the resolved URL
    const resolvedImage = resolveImageUrl(rawImage);
    logger.log('resolveImageUrl returned:', resolvedImage);
    
    return {
      name: sanitizeText(data.name as string | undefined) || null,
      description: sanitizeText(data.description as string | undefined) || null,
      image: resolvedImage, // This is already resolved and safe
    };
  } catch (err) {
    logger.error('NFT metadata fetch error:', err);
    
    // If fetch failed but URI looks like an image, use it directly
    if (isImageUrl(uri)) {
      logger.log('URI appears to be direct image URL');
      return {
        name: null,
        description: null,
        image: resolveImageUrl(uri) ?? null,
      };
    }
    
    // Try to infer image URL from tokenURI pattern
    const candidates = inferImageUrls(uri);
    if (candidates.length > 0) {
      logger.log('Trying to infer image URL from pattern...');
      for (const candidate of candidates) {
        const loadedUrl = await tryLoadImage(candidate);
        if (loadedUrl) {
          logger.log('Successfully loaded inferred image:', loadedUrl);
          return {
            name: null,
            description: null,
            image: loadedUrl,
          };
        }
      }
    }
    
    return null;
  }
}

async function fetchWithFallback(primaryUrl: string, originalUri: string): Promise<Response | null> {
  // Try primary URL first
  try {
    const response = await fetch(primaryUrl, { 
      signal: AbortSignal.timeout(8000),
      headers: {
        'Accept': 'application/json, image/*',
      },
    });
    if (response.ok) return response;
  } catch (err) {
    logger.warn('Primary fetch failed:', err);
  }

  // If it's an IPFS URI, try fallback gateways
  if (originalUri.startsWith('ipfs://')) {
    const ipfsHash = originalUri.slice(7);
    
    for (const gateway of IPFS_GATEWAYS) {
      try {
        logger.log('Trying gateway:', gateway + ipfsHash);
        const response = await fetch(gateway + ipfsHash, { 
          signal: AbortSignal.timeout(5000),
          headers: {
            'Accept': 'application/json, image/*',
          },
        });
        if (response.ok) return response;
      } catch (err) {
        logger.warn('Gateway failed:', gateway, err);
      }
    }
  }

  return null;
}

function convertToHttpUrl(uri: string): string {
  if (uri.startsWith('ipfs://')) {
    return `https://cloudflare-ipfs.com/ipfs/${uri.slice(7)}`;
  }
  if (uri.startsWith('ar://')) {
    return `https://arweave.net/${uri.slice(5)}`;
  }
  // Handle Arweave URIs that look like https://arweave.net/...
  if (uri.includes('arweave.net')) {
    return uri;
  }
  return uri;
}

function resolveImageUrl(url: string | undefined | null): string | null {
  if (!url) return null;
  
  // Handle IPFS first (before sanitization)
  if (url.startsWith('ipfs://')) {
    const hash = url.slice(7);
    // IPFS hashes can be Qm... (base58) or newer CIDv1 formats
    // Allow alphanumeric and some special chars, but block obvious injection
    if (hash.length > 0 && hash.length < 200 && !hash.includes('<') && !hash.includes('>')) {
      return `https://cloudflare-ipfs.com/ipfs/${hash}`;
    }
    logger.warn('Invalid IPFS hash format');
    return null;
  }
  
  // Handle Arweave
  if (url.startsWith('ar://')) {
    const txId = url.slice(5);
    // Arweave transaction IDs are base64url encoded
    if (txId.length > 0 && txId.length < 200 && /^[a-zA-Z0-9_-]+$/.test(txId)) {
      return `https://arweave.net/${txId}`;
    }
    logger.warn('Invalid Arweave transaction ID format');
    return null;
  }
  
  // For other URLs, sanitize
  const sanitized = sanitizeImageUrl(url);
  if (!sanitized) {
    // If sanitization fails but it's already an HTTP/HTTPS URL, allow it with basic check
    if (url.startsWith('http://') || url.startsWith('https://')) {
      const lowerUrl = url.toLowerCase();
      if (!lowerUrl.includes('javascript:') && !lowerUrl.includes('<script')) {
        return url;
      }
    }
    return null;
  }
  
  // Handle data URIs (already sanitized by sanitizeImageUrl)
  if (sanitized.startsWith('data:image/')) {
    return sanitized;
  }
  
  // HTTP/HTTPS URLs (already validated by sanitizeImageUrl)
  return sanitized;
}

// Helper to format token amount with decimals
export function formatTokenAmount(amount: string, decimals: number | null): string {
  if (!amount || decimals === null) return amount;
  
  try {
    const value = BigInt(amount);
    const divisor = BigInt(10 ** decimals);
    const integerPart = value / divisor;
    const fractionalPart = value % divisor;
    
    if (fractionalPart === 0n) {
      return integerPart.toString();
    }
    
    const fractionalStr = fractionalPart.toString().padStart(decimals, '0');
    const trimmedFractional = fractionalStr.replace(/0+$/, '');
    
    return `${integerPart}.${trimmedFractional}`;
  } catch {
    return amount;
  }
}

// Helper to parse human-readable amount to wei
export function parseTokenAmount(amount: string, decimals: number | null): string {
  if (!amount || decimals === null) return amount;
  
  try {
    const [integerPart, fractionalPart = ''] = amount.split('.');
    const paddedFractional = fractionalPart.padEnd(decimals, '0').slice(0, decimals);
    const combined = integerPart + paddedFractional;
    return BigInt(combined).toString();
  } catch {
    return amount;
  }
}
