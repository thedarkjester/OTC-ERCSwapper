import { useState } from 'react';
import { Zap, ArrowLeftRight, Shield, Coins, FileText, Lock, Info } from 'lucide-react';
import { TermsModal } from './TermsModal';
import { MoreInfoModal } from './MoreInfoModal';

interface LandingPageProps {
  onAccept: () => void;
}

export function LandingPage({ onAccept }: LandingPageProps) {
  const [termsOpen, setTermsOpen] = useState(false);
  const [termsTab, setTermsTab] = useState<'terms' | 'privacy'>('terms');
  const [hasReadTerms, setHasReadTerms] = useState(false);
  const [hasReadPrivacy, setHasReadPrivacy] = useState(false);
  const [moreInfoOpen, setMoreInfoOpen] = useState(false);

  const openTerms = () => {
    setTermsTab('terms');
    setTermsOpen(true);
  };

  const openPrivacy = () => {
    setTermsTab('privacy');
    setTermsOpen(true);
  };

  const handleModalClose = () => {
    // Mark as read based on which tab was active
    if (termsTab === 'terms') {
      setHasReadTerms(true);
    } else {
      setHasReadPrivacy(true);
    }
    setTermsOpen(false);
  };

  const canAccept = hasReadTerms && hasReadPrivacy;

  return (
    <div className="landing-page">
      <div className="landing-content">
        <div className="landing-hero">
          <div className="landing-logo">
            <Zap size={48} />
          </div>
          <h1>Welcome to P2PSwap</h1>
          <p className="landing-subtitle">
            Trustless peer-to-peer token exchanges with the security of an impartial escrow contract.
          </p>
          <button 
            className="btn btn-secondary btn-sm"
            onClick={() => setMoreInfoOpen(true)}
            style={{ marginTop: '1rem' }}
          >
            <Info size={16} />
            More info on swapping
          </button>
        </div>

        <div className="landing-features">
          <div className="feature-card">
            <ArrowLeftRight size={32} />
            <h3>Any Token Type</h3>
            <p>Swap ERC-20, ERC-721 (NFTs), ERC-1155, or ETH directly</p>
          </div>
          <div className="feature-card">
            <Coins size={32} />
            <h3>Zero Fees</h3>
            <p>No platform fees - only pay blockchain gas costs</p>
          </div>
          <div className="feature-card">
            <Shield size={32} />
            <h3>Audited Security</h3>
            <p>Smart contracts audited by Consensys Diligence</p>
            <a 
              href="https://diligence.consensys.io/audits/private/chl9kaod7d8tlq" 
              target="_blank" 
              rel="noopener noreferrer"
              className="audit-link"
              style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: '#00ff88' }}
            >
              View Audit Report →
            </a>
          </div>
        </div>

        <div className="landing-terms-section">
          <h2>Before You Continue</h2>
          <p>Please review and accept our terms to use P2PSwap:</p>

          <div className="terms-links">
            <button 
              className={`terms-link-btn ${hasReadTerms ? 'read' : ''}`}
              onClick={openTerms}
            >
              <FileText size={20} />
              <span>Terms of Use</span>
              {hasReadTerms && <span className="read-badge">✓ Read</span>}
            </button>
            
            <button 
              className={`terms-link-btn ${hasReadPrivacy ? 'read' : ''}`}
              onClick={openPrivacy}
            >
              <Lock size={20} />
              <span>Privacy Policy</span>
              {hasReadPrivacy && <span className="read-badge">✓ Read</span>}
            </button>
          </div>

          {!canAccept && (
            <p className="terms-hint">
              Please read both documents to continue
            </p>
          )}

          <button 
            className="btn btn-primary btn-large"
            onClick={onAccept}
            disabled={!canAccept}
          >
            I Accept and Agree to the Terms
          </button>
        </div>
      </div>

      <TermsModal 
        isOpen={termsOpen}
        onClose={handleModalClose}
        activeTab={termsTab}
        setActiveTab={setTermsTab}
      />
      
      <MoreInfoModal 
        isOpen={moreInfoOpen}
        onClose={() => setMoreInfoOpen(false)}
      />
    </div>
  );
}


