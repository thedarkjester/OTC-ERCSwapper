import { useState, useEffect } from 'react';
import { X, ExternalLink, AlertCircle, Image as ImageIcon, RefreshCw, Copy, Check } from 'lucide-react';
import { sanitizeText, sanitizeImageUrl, sanitizeUrl } from '../utils/sanitize';
import { logger } from '../utils/logger';

interface NFTModalProps {
  isOpen: boolean;
  onClose: () => void;
  name: string;
  description?: string | null;
  imageUrl?: string | null;
  tokenURI?: string | null;
  collectionName?: string | null;
  tokenId?: string;
}

// Multiple IPFS gateways for image fallback
const IMAGE_GATEWAYS = [
  { prefix: 'https://cloudflare-ipfs.com/ipfs/', name: 'Cloudflare' },
  { prefix: 'https://ipfs.io/ipfs/', name: 'IPFS.io' },
  { prefix: 'https://gateway.pinata.cloud/ipfs/', name: 'Pinata' },
  { prefix: 'https://dweb.link/ipfs/', name: 'DWeb' },
  { prefix: 'https://nftstorage.link/ipfs/', name: 'NFT.Storage' },
];

export function NFTModal({ 
  isOpen, 
  onClose, 
  name, 
  description, 
  imageUrl, 
  tokenURI,
  collectionName,
  tokenId 
}: NFTModalProps) {
  const [imageError, setImageError] = useState(false);
  const [gatewayIndex, setGatewayIndex] = useState(0);
  const [copied, setCopied] = useState<string | null>(null);

  // Reset state when modal opens/closes or imageUrl changes
  useEffect(() => {
    if (isOpen) {
      setImageError(false);
      setGatewayIndex(0);
      setCopied(null);
    }
  }, [isOpen, imageUrl]);

  if (!isOpen) return null;

  const resolveUrl = (url: string | null | undefined): string | null => {
    if (!url) return null;
    
    // Handle IPFS and Arweave first (before sanitization)
    if (url.startsWith('ipfs://')) {
      const hash = url.slice(7);
      if (hash.length > 0 && hash.length < 200 && !hash.includes('<') && !hash.includes('>')) {
        return `https://cloudflare-ipfs.com/ipfs/${hash}`;
      }
      return null;
    }
    if (url.startsWith('ar://')) {
      const txId = url.slice(5);
      if (txId.length > 0 && txId.length < 200 && /^[a-zA-Z0-9_-]+$/.test(txId)) {
        return `https://arweave.net/${txId}`;
      }
      return null;
    }
    
    // For other URLs, sanitize
    const sanitized = sanitizeUrl(url);
    if (!sanitized) {
      // If it's already HTTP/HTTPS and sanitization failed, do basic check
      if (url.startsWith('http://') || url.startsWith('https://')) {
        const lowerUrl = url.toLowerCase();
        if (!lowerUrl.includes('javascript:') && !lowerUrl.includes('<script')) {
          return url;
        }
      }
      return null;
    }
    return sanitized;
  };

  // Extract IPFS hash from URL for gateway switching
  const getIpfsHash = (url: string | null | undefined): string | null => {
    if (!url) return null;
    if (url.startsWith('ipfs://')) return url.slice(7);
    
    // Try to extract from gateway URLs
    const match = url.match(/\/ipfs\/([a-zA-Z0-9]+.*)/);
    return match ? match[1] : null;
  };

  const ipfsHash = getIpfsHash(imageUrl);
  
  const getCurrentImageUrl = (): string | null => {
    if (!imageUrl) return null;
    
    // If we've exhausted all gateways, return null (failed)
    if (imageError) {
      return null;
    }
    
    // If it's an IPFS URL and we're cycling through gateways
    if (ipfsHash && gatewayIndex > 0 && gatewayIndex < IMAGE_GATEWAYS.length) {
      return IMAGE_GATEWAYS[gatewayIndex].prefix + ipfsHash;
    }
    
    // First attempt - use resolved original URL
    return resolveUrl(imageUrl);
  };

  const handleImageError = () => {
    logger.log('Image load error, gateway index:', gatewayIndex);
    if (ipfsHash && gatewayIndex < IMAGE_GATEWAYS.length - 1) {
      // Try next gateway
      setGatewayIndex(prev => prev + 1);
    } else {
      setImageError(true);
    }
  };

  const handleRetry = () => {
    setImageError(false);
    setGatewayIndex(0);
  };

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      setTimeout(() => setCopied(null), 2000);
    } catch (err) {
      logger.error('Failed to copy:', err);
    }
  };

  const currentImageUrl = getCurrentImageUrl();
  const resolvedImageUrl = resolveUrl(imageUrl);
  const resolvedTokenUri = resolveUrl(tokenURI);

  logger.log('NFTModal render:', { 
    imageUrl, 
    resolvedImageUrl, 
    currentImageUrl, 
    imageError, 
    gatewayIndex,
    tokenURI,
    resolvedTokenUri,
    'sanitizeImageUrl(imageUrl)': imageUrl ? sanitizeImageUrl(imageUrl) : null,
    'getCurrentImageUrl() result': currentImageUrl
  });

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content nft-modal" onClick={e => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>
          <X size={20} />
        </button>

        <div className="nft-modal-content">
          <div className="nft-image-container">
            {currentImageUrl && !imageError ? (
              <img 
                src={(() => {
                  logger.log('Rendering image with currentImageUrl:', currentImageUrl);
                  // Try sanitization first
                  const sanitized = sanitizeImageUrl(currentImageUrl);
                  logger.log('sanitizeImageUrl result:', sanitized);
                  if (sanitized) {
                    logger.log('Using sanitized URL:', sanitized);
                    return sanitized;
                  }
                  
                  // If sanitization fails but URL looks safe, allow it
                  const lowerUrl = currentImageUrl.toLowerCase();
                  if ((currentImageUrl.startsWith('http://') || currentImageUrl.startsWith('https://') || 
                       currentImageUrl.startsWith('ipfs://') || currentImageUrl.startsWith('ar://') ||
                       currentImageUrl.startsWith('data:image/')) &&
                      !lowerUrl.includes('javascript:') && !lowerUrl.includes('<script')) {
                    logger.log('Using URL that passed basic safety check:', currentImageUrl);
                    return currentImageUrl;
                  }
                  
                  logger.warn('Image URL blocked:', currentImageUrl);
                  return '';
                })()} 
                alt={sanitizeText(name)}
                className="nft-image"
                onError={handleImageError}
              />
            ) : (
              <div className="nft-image-placeholder">
                <AlertCircle size={48} />
                <span>{imageUrl ? 'Image failed to load' : 'No image available'}</span>
                {ipfsHash && (
                  <button className="btn btn-sm btn-secondary" onClick={handleRetry}>
                    <RefreshCw size={14} />
                    Retry
                  </button>
                )}
              </div>
            )}
            {ipfsHash && gatewayIndex > 0 && !imageError && currentImageUrl && (
              <div className="gateway-indicator">
                via {IMAGE_GATEWAYS[gatewayIndex]?.name || 'gateway'}
              </div>
            )}
          </div>

          <div className="nft-details">
            {collectionName && (
              <p className="nft-collection">{sanitizeText(collectionName)}</p>
            )}
            
            <h2 className="nft-title">{sanitizeText(name)}</h2>
            
            {tokenId && (
              <p className="nft-token-id">Token ID: #{sanitizeText(tokenId)}</p>
            )}

            {description && (
              <div className="nft-description">
                <h4>Description</h4>
                <p>{sanitizeText(description)}</p>
              </div>
            )}

            {/* Always show URLs section for debugging */}
            <div className="nft-url-section">
              <h4>URLs {imageError && <span className="badge badge-error">Image Failed</span>}</h4>
              
              {/* Original Image URL */}
              {imageUrl && (
                <div className="url-block">
                  <label>Image URL (Original):</label>
                  <div className="url-display">
                    <code className="url-code">{sanitizeText(imageUrl)}</code>
                    <button 
                      className="btn btn-icon btn-sm"
                      onClick={() => copyToClipboard(imageUrl, 'original')}
                      title="Copy URL"
                    >
                      {copied === 'original' ? <Check size={14} /> : <Copy size={14} />}
                    </button>
                  </div>
                </div>
              )}

              {/* Resolved Image URL */}
              {resolvedImageUrl && resolvedImageUrl !== imageUrl && (
                <div className="url-block">
                  <label>Image URL (Resolved):</label>
                  <div className="url-display">
                    <code className="url-code">{sanitizeText(resolvedImageUrl)}</code>
                    <button 
                      className="btn btn-icon btn-sm"
                      onClick={() => copyToClipboard(resolvedImageUrl, 'resolved')}
                      title="Copy URL"
                    >
                      {copied === 'resolved' ? <Check size={14} /> : <Copy size={14} />}
                    </button>
                  </div>
                </div>
              )}

              {/* Token URI */}
              {tokenURI && (
                <div className="url-block">
                  <label>Metadata URI:</label>
                  <div className="url-display">
                    <code className="url-code">{sanitizeText(tokenURI)}</code>
                    <button 
                      className="btn btn-icon btn-sm"
                      onClick={() => copyToClipboard(tokenURI, 'tokenuri')}
                      title="Copy URL"
                    >
                      {copied === 'tokenuri' ? <Check size={14} /> : <Copy size={14} />}
                    </button>
                  </div>
                </div>
              )}

              {!imageUrl && !tokenURI && (
                <p className="text-muted">No URLs available for this NFT</p>
              )}
            </div>

            <div className="nft-links">
              {resolvedTokenUri && sanitizeUrl(resolvedTokenUri) && (
                <a 
                  href={sanitizeUrl(resolvedTokenUri) || '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="nft-metadata-link"
                >
                  <ExternalLink size={14} />
                  View Metadata JSON
                </a>
              )}
              
              {resolvedImageUrl && sanitizeImageUrl(resolvedImageUrl) && (
                <a 
                  href={sanitizeImageUrl(resolvedImageUrl) || '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="nft-metadata-link"
                >
                  <ImageIcon size={14} />
                  Open Image in New Tab
                </a>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
