import { useState } from 'react';
import { Loader2, AlertCircle, AlertTriangle, ExternalLink, Image as ImageIcon, CheckCircle2, Shield, ShieldQuestion, ShieldAlert, Lock } from 'lucide-react';
import { useTokenMetadata, formatTokenAmount } from '../hooks/useTokenMetadata';
import { useTokenTypeDetection } from '../hooks/useTokenTypeDetection';
import { useContractVerification } from '../hooks/useContractVerification';
import { useTransferRestrictionCheck } from '../hooks/useTransferRestrictionCheck';
import { TokenType } from '../config/contracts';
import { NFTModal } from './NFTModal';
import { sanitizeText, sanitizeUrl } from '../utils/sanitize';

interface TokenInfoProps {
  tokenAddress: string;
  tokenType: number;
  tokenId?: string;
  quantity?: string;
  onTypeDetected?: (detectedType: TokenType) => void;
}

export function TokenInfo({ tokenAddress, tokenType, tokenId, quantity }: TokenInfoProps) {
  const { metadata, isLoading, error } = useTokenMetadata(tokenAddress, tokenType, tokenId);
  const typeDetection = useTokenTypeDetection(tokenAddress, tokenType);
  const verification = useContractVerification(tokenAddress);
  const transferRestriction = useTransferRestrictionCheck(tokenAddress, tokenType);
  const [showNFTModal, setShowNFTModal] = useState(false);

  if (!tokenAddress || tokenType === TokenType.NONE) {
    return null;
  }

  const isLoadingAny = isLoading || typeDetection.isLoading;

  if (isLoadingAny) {
    return (
      <div className="token-info loading">
        <Loader2 size={14} className="spin" />
        <span>Detecting token...</span>
      </div>
    );
  }

  const isNFT = tokenType === TokenType.ERC721 || tokenType === TokenType.ERC1155;
  const isFungible = tokenType === TokenType.ERC20 || tokenType === TokenType.ERC777;

  const resolveUrl = (url: string): string | null => {
    if (!url) return null;
    
    // Handle IPFS and Arweave first
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
      // If it's already HTTP/HTTPS, do basic safety check
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

  const getTypeIcon = () => {
    if (typeDetection.mismatch) {
      return <AlertTriangle size={14} className="text-warning" />;
    }
    if (typeDetection.detectedType !== null && typeDetection.detectedType === tokenType) {
      return <CheckCircle2 size={14} className="text-success" />;
    }
    return null;
  };

  const getDetectedTypeLabel = () => {
    if (typeDetection.detectedType === null) return null;
    switch (typeDetection.detectedType) {
      case TokenType.ERC20: return 'ERC20';
      case TokenType.ERC721: return 'ERC721';
      case TokenType.ERC1155: return 'ERC1155';
      case TokenType.ERC777: return 'ERC777';
      default: return 'Unknown';
    }
  };

  const getVerificationIcon = () => {
    if (verification.isLoading) {
      return <Loader2 size={14} className="spin" />;
    }
    if (verification.isVerified === true) {
      return <Shield size={14} className="text-success" />;
    }
    return <ShieldQuestion size={14} className="text-muted" />;
  };

  return (
    <>
      <div className={`token-info ${typeDetection.mismatch || !transferRestriction.canSwap ? 'has-warning' : ''}`}>
        {/* CRITICAL: Operator restriction warning */}
        {!transferRestriction.canSwap && transferRestriction.reason && (
          <div className="operator-restriction-warning">
            <div className="restriction-header">
              <ShieldAlert size={18} />
              <strong>Operator Restriction Detected</strong>
            </div>
            <p>{transferRestriction.reason}</p>
            {transferRestriction.validatorAddress && (
              <div className="restriction-details">
                <span className="restriction-type">
                  <Lock size={12} />
                  {transferRestriction.restrictionType === 'creator-token' 
                    ? 'Creator Token Standard' 
                    : transferRestriction.restrictionType === 'operator-filter'
                      ? 'Operator Filter'
                      : 'Transfer Restriction'}
                </span>
                <a 
                  href={`https://etherscan.io/address/${transferRestriction.validatorAddress}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="validator-link"
                >
                  <ExternalLink size={12} />
                  View Validator
                </a>
              </div>
            )}
          </div>
        )}

        {/* Loading restriction check */}
        {transferRestriction.isLoading && isNFT && (
          <div className="restriction-loading">
            <Loader2 size={14} className="spin" />
            <span>Checking transfer restrictions...</span>
          </div>
        )}

        {/* Type mismatch warning */}
        {typeDetection.mismatch && typeDetection.mismatchMessage && (
          <div className="token-type-warning">
            <AlertTriangle size={16} />
            <span>{typeDetection.mismatchMessage}</span>
          </div>
        )}

        {/* Type detection status */}
        {!typeDetection.mismatch && typeDetection.detectedType !== null && (
          <div className="token-type-status success">
            {getTypeIcon()}
            <span>Verified: {getDetectedTypeLabel()}</span>
            {typeDetection.isERC165 && (
              <span className="badge badge-sm">ERC165</span>
            )}
          </div>
        )}

        {/* Contract verification / explorer link */}
        <div className={`contract-verification ${verification.isVerified ? 'verified' : ''}`}>
          {getVerificationIcon()}
          <span>
            {verification.isLoading 
              ? 'Checking...'
              : verification.isVerified 
                ? `Verified (Sourcify)`
                : `Check on ${verification.explorerName || 'Explorer'}`
            }
          </span>
          {verification.explorerUrl && (
            <a 
              href={verification.explorerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="explorer-link"
              title={`View on ${verification.explorerName}`}
            >
              <ExternalLink size={12} />
              View Contract
            </a>
          )}
        </div>

        {/* Metadata error */}
        {error && !metadata && (
          <div className="token-info-row error">
            <AlertCircle size={14} />
            <span>Unable to load token info</span>
          </div>
        )}

        {/* Token name and symbol */}
        {metadata && (
          <>
            <div className="token-info-row">
              <span className="token-info-label">Token:</span>
              <span className="token-info-value">
                {sanitizeText(metadata.name) || 'Unknown'} 
                {metadata.symbol && <span className="token-symbol">({sanitizeText(metadata.symbol)})</span>}
              </span>
            </div>

            {/* Decimals for fungible tokens */}
            {isFungible && metadata.decimals !== null && (
              <div className="token-info-row">
                <span className="token-info-label">Decimals:</span>
                <span className="token-info-value">{metadata.decimals}</span>
              </div>
            )}

            {/* Quantity display for fungible tokens */}
            {isFungible && quantity && metadata.decimals !== null && (
              <div className="token-info-row">
                <span className="token-info-label">Amount:</span>
                <span className="token-info-value">
                  {formatTokenAmount(quantity, metadata.decimals)} {metadata.symbol || ''}
                </span>
              </div>
            )}

            {/* Wei value */}
            {isFungible && quantity && (
              <div className="token-info-row">
                <span className="token-info-label">Wei:</span>
                <span className="token-info-value mono">{quantity}</span>
              </div>
            )}

            {/* NFT specific info */}
            {isNFT && metadata.nftName && (
              <div className="token-info-row">
                <span className="token-info-label">NFT:</span>
                <span className="token-info-value">{sanitizeText(metadata.nftName)}</span>
              </div>
            )}

            {/* Token URI link for NFTs */}
            {isNFT && metadata.tokenURI && (() => {
              const resolved = resolveUrl(metadata.tokenURI || '');
              return resolved ? (
                <div className="token-info-row">
                  <span className="token-info-label">Metadata:</span>
                  <a 
                    href={resolved} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="token-info-link"
                  >
                    <ExternalLink size={12} />
                    View JSON
                  </a>
                </div>
              ) : null;
            })()}

            {/* NFT preview button */}
            {isNFT && (
              <button 
                className="btn btn-sm btn-secondary token-info-btn"
                onClick={() => setShowNFTModal(true)}
              >
                <ImageIcon size={14} />
                {metadata.imageUrl ? 'View NFT' : 'View Details'}
              </button>
            )}
          </>
        )}

        {/* Show detected type if can't load metadata but detected */}
        {!metadata && typeDetection.detectedType !== null && !typeDetection.mismatch && (
          <div className="token-info-row">
            <span className="token-info-label">Type:</span>
            <span className="token-info-value">{getDetectedTypeLabel()}</span>
          </div>
        )}
      </div>

      {/* NFT Modal */}
      {showNFTModal && metadata && (
        <NFTModal
          isOpen={showNFTModal}
          onClose={() => setShowNFTModal(false)}
          name={sanitizeText(metadata.nftName || metadata.name) || 'NFT'}
          description={metadata.nftDescription ? sanitizeText(metadata.nftDescription) : null}
          imageUrl={metadata.imageUrl}
          tokenURI={metadata.tokenURI}
          collectionName={metadata.name ? sanitizeText(metadata.name) : null}
          tokenId={tokenId}
        />
      )}
    </>
  );
}
