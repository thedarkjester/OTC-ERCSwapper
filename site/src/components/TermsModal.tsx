import { X } from 'lucide-react';

interface TermsModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeTab: 'terms' | 'privacy';
  setActiveTab: (tab: 'terms' | 'privacy') => void;
}

export function TermsModal({ isOpen, onClose, activeTab, setActiveTab }: TermsModalProps) {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content terms-modal" onClick={e => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>
          <X size={20} />
        </button>
        
        <div className="terms-tabs">
          <button 
            className={`terms-tab ${activeTab === 'terms' ? 'active' : ''}`}
            onClick={() => setActiveTab('terms')}
          >
            Terms of Use
          </button>
          <button 
            className={`terms-tab ${activeTab === 'privacy' ? 'active' : ''}`}
            onClick={() => setActiveTab('privacy')}
          >
            Privacy Policy
          </button>
        </div>

        <div className="terms-content">
          {activeTab === 'terms' ? <TermsOfUse /> : <PrivacyPolicy />}
        </div>
      </div>
    </div>
  );
}

function TermsOfUse() {
  return (
    <div className="legal-text">
      <h2>Terms of Use</h2>
      <p className="last-updated">Last Updated: December 2024</p>

      <h3>1. Acceptance of Terms</h3>
      <p>
        By accessing or using P2PSwap, you agree to be bound by these Terms of Use. 
        If you do not agree to these terms, do not use the service.
      </p>

      <h3>2. Description of Service</h3>
      <p>
        P2PSwap is a decentralized peer-to-peer token swapping interface that enables users 
        to exchange ERC-20, ERC-721, ERC-1155 tokens, and ETH directly with other users 
        through smart contracts deployed on Ethereum and compatible networks.
      </p>

      <h3>3. No Warranty</h3>
      <p>
        THE SERVICE IS PROVIDED "AS IS" WITHOUT WARRANTY OF ANY KIND. We make no guarantees 
        regarding the reliability, availability, or suitability of the service for any purpose.
      </p>

      <h3>4. User Responsibilities</h3>
      <ul>
        <li>You are solely responsible for your wallet security and private keys</li>
        <li>You are responsible for verifying swap details before confirming transactions</li>
        <li>You understand that blockchain transactions are irreversible</li>
        <li>You are responsible for any gas fees incurred</li>
        <li>You must comply with all applicable laws in your jurisdiction</li>
      </ul>

      <h3>5. Risks</h3>
      <p>
        By using this service, you acknowledge and accept the following risks:
      </p>
      <ul>
        <li>Smart contract risk - bugs or vulnerabilities may exist</li>
        <li>Price volatility - token values can change rapidly</li>
        <li>Regulatory risk - laws regarding cryptocurrencies may change</li>
        <li>Network congestion - transactions may be delayed or fail</li>
        <li>Counterparty risk - the other party may not complete their side</li>
      </ul>

      <h3>6. No Fees</h3>
      <p>
        P2PSwap does not charge any fees for swaps. The only costs you incur are 
        blockchain gas fees paid to network validators.
      </p>

      <h3>7. Limitation of Liability</h3>
      <p>
        IN NO EVENT SHALL P2PSWAP, ITS DEVELOPERS, OR CONTRIBUTORS BE LIABLE FOR ANY 
        DIRECT, INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES ARISING 
        FROM YOUR USE OF THE SERVICE.
      </p>

      <h3>8. Modifications</h3>
      <p>
        We reserve the right to modify these terms at any time. Continued use of the 
        service after changes constitutes acceptance of the new terms.
      </p>

      <h3>9. Contact</h3>
      <p>
        For security concerns, please report via{' '}
        <a href="https://github.com/thedarkjester/P2PSwap/security/advisories/new" target="_blank" rel="noopener noreferrer">
          GitHub Security Advisories
        </a>.
      </p>
    </div>
  );
}

function PrivacyPolicy() {
  return (
    <div className="legal-text">
      <h2>Privacy Policy</h2>
      <p className="last-updated">Last Updated: December 2024</p>

      <h3>1. Information We Collect</h3>
      <p>
        P2PSwap is a decentralized application. We do not collect, store, or process 
        any personal information. All data is stored on the blockchain or locally in 
        your browser.
      </p>

      <h3>2. Blockchain Data</h3>
      <p>
        When you use P2PSwap, your transactions are recorded on public blockchains. 
        This includes:
      </p>
      <ul>
        <li>Your wallet address</li>
        <li>Transaction details (tokens swapped, amounts, timestamps)</li>
        <li>Smart contract interactions</li>
      </ul>
      <p>
        This data is publicly visible and immutable. We have no control over this data.
      </p>

      <h3>3. Local Storage</h3>
      <p>
        We use your browser's local storage to save:
      </p>
      <ul>
        <li>Your terms acceptance status</li>
        <li>Hidden swap preferences</li>
        <li>UI preferences</li>
      </ul>
      <p>
        This data never leaves your device and can be cleared by clearing your browser data.
      </p>

      <h3>4. Third-Party Services</h3>
      <p>
        P2PSwap integrates with third-party services that have their own privacy practices:
      </p>
      <ul>
        <li>
          <strong>WalletConnect / RainbowKit</strong> - Used for wallet connections. 
          WalletConnect may collect connection metadata, session information, and wallet addresses. 
          See <a href="https://walletconnect.com/privacy" target="_blank" rel="noopener noreferrer">WalletConnect Privacy Policy</a>.
        </li>
        <li>
          <strong>RPC Providers</strong> - Blockchain data is fetched through RPC endpoints 
          which may log your IP address, wallet address, and all requests made.
        </li>
        <li>
          <strong>Wallet Providers</strong> (MetaMask, Coinbase Wallet, etc.) - Governed by 
          their respective privacy policies.
        </li>
        <li>
          <strong>Block Explorers</strong> - External links to Etherscan/Lineascan for 
          viewing transactions.
        </li>
      </ul>

      <h3>5. No Cookies</h3>
      <p>
        We do not use cookies. However, third-party services integrated into this 
        application may use their own cookies or tracking mechanisms.
      </p>

      <h3>6. No First-Party Analytics</h3>
      <p>
        We do not collect analytics or usage data directly. However, third-party services 
        (WalletConnect, RPC providers, Google Fonts) may collect their own analytics.
      </p>

      <h3>7. Children's Privacy</h3>
      <p>
        This service is not intended for users under 18 years of age.
      </p>

      <h3>8. Changes to This Policy</h3>
      <p>
        We may update this privacy policy from time to time. Changes will be reflected 
        on this page with an updated revision date.
      </p>

      <h3>9. Contact</h3>
      <p>
        For privacy concerns, please contact via{' '}
        <a href="https://github.com/thedarkjester/P2PSwap" target="_blank" rel="noopener noreferrer">
          GitHub
        </a>.
      </p>
    </div>
  );
}

