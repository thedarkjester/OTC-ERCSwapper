import { useState } from 'react';
import { WagmiProvider } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RainbowKitProvider, darkTheme, ConnectButton } from '@rainbow-me/rainbowkit';
import { Plus, Inbox, ArrowDownToLine, Zap, XCircle } from 'lucide-react';

import { config } from './config/wagmi';
import { CreateSwap } from './components/CreateSwap';
import { MySwaps } from './components/MySwaps';
import { AcceptSwaps } from './components/AcceptSwaps';
import { Revoke } from './components/Revoke';
import { LandingPage } from './components/LandingPage';
import { TermsModal } from './components/TermsModal';
import { MoreInfoModal } from './components/MoreInfoModal';
import { Tooltip } from './components/Tooltip';
import { ToastComponent } from './components/Toast';
import { ToastProvider, useToastContext } from './contexts/ToastContext';
import type { SwapTab } from './types';

import '@rainbow-me/rainbowkit/styles.css';
import './App.css';

const queryClient = new QueryClient();

const TERMS_ACCEPTED_KEY = 'p2pswap_terms_accepted';

function hasAcceptedTerms(): boolean {
  try {
    return localStorage.getItem(TERMS_ACCEPTED_KEY) === 'true';
  } catch {
    return false;
  }
}

function setTermsAccepted() {
  localStorage.setItem(TERMS_ACCEPTED_KEY, 'true');
}

const NAV_TOOLTIPS = {
  create: 'Create a new swap offer. Define what tokens you want to exchange and with whom.',
  'my-swaps': 'View swaps you have initiated. You can cancel pending swaps here.',
  accept: 'View and accept swaps offered to you, or browse open swaps available for anyone.',
  revoke: 'View and revoke token approvals granted to the swap contract.',
};

function AppContent() {
  const [termsAccepted, setAccepted] = useState(hasAcceptedTerms);
  const [activeTab, setActiveTab] = useState<SwapTab>(termsAccepted ? 'my-swaps' : 'create');
  const [termsModalOpen, setTermsModalOpen] = useState(false);
  const [termsModalTab, setTermsModalTab] = useState<'terms' | 'privacy'>('terms');
  const [moreInfoModalOpen, setMoreInfoModalOpen] = useState(false);
  const { toasts, dismissToast } = useToastContext();

  const handleAcceptTerms = () => {
    setTermsAccepted();
    setAccepted(true);
    setActiveTab('my-swaps');
  };

  const openTerms = () => {
    setTermsModalTab('terms');
    setTermsModalOpen(true);
  };

  const openPrivacy = () => {
    setTermsModalTab('privacy');
    setTermsModalOpen(true);
  };

  // Show landing page if terms not accepted
  if (!termsAccepted) {
    return <LandingPage onAccept={handleAcceptTerms} />;
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="logo">
          <Zap size={28} />
          <span>P2PSwap</span>
        </div>
        <ConnectButton />
      </header>

      <nav className="tabs">
        <button 
          className={`tab ${activeTab === 'create' ? 'active' : ''}`}
          onClick={() => setActiveTab('create')}
        >
          <Plus size={18} />
          Create
          <Tooltip content={NAV_TOOLTIPS.create} />
        </button>
        <button 
          className={`tab ${activeTab === 'my-swaps' ? 'active' : ''}`}
          onClick={() => setActiveTab('my-swaps')}
        >
          <Inbox size={18} />
          My Swaps
          <Tooltip content={NAV_TOOLTIPS['my-swaps']} />
        </button>
        <button 
          className={`tab ${activeTab === 'accept' ? 'active' : ''}`}
          onClick={() => setActiveTab('accept')}
        >
          <ArrowDownToLine size={18} />
          Accept
          <Tooltip content={NAV_TOOLTIPS.accept} />
        </button>
        <button 
          className={`tab ${activeTab === 'revoke' ? 'active' : ''}`}
          onClick={() => setActiveTab('revoke')}
        >
          <XCircle size={18} />
          Revoke
          <Tooltip content={NAV_TOOLTIPS.revoke} />
        </button>
      </nav>

      <main className="main-content">
        {activeTab === 'create' && <CreateSwap onSuccess={() => setActiveTab('my-swaps')} />}
        {activeTab === 'my-swaps' && <MySwaps />}
        {activeTab === 'accept' && <AcceptSwaps />}
        {activeTab === 'revoke' && <Revoke />}
      </main>

      <footer className="app-footer">
        <p>
          P2PSwap - Trustless Token Swapping | No fees, no middlemen
        </p>
        <p className="footer-links">
          <a href="https://github.com/thedarkjester/P2PSwap" target="_blank" rel="noopener noreferrer">
            GitHub
          </a>
          <span>•</span>
          <a href="https://etherscan.io/address/0xF1c35b66F6B94Cb3f7a5004342300F6f7d4edbbd" target="_blank" rel="noopener noreferrer">
            Contract
          </a>
          <span>•</span>
          <button className="footer-link-btn" onClick={() => setMoreInfoModalOpen(true)}>
            More info on swapping
          </button>
          <span>•</span>
          <button className="footer-link-btn" onClick={openTerms}>
            Terms of Use
          </button>
          <span>•</span>
          <button className="footer-link-btn" onClick={openPrivacy}>
            Privacy Policy
          </button>
        </p>
      </footer>

      <TermsModal 
        isOpen={termsModalOpen}
        onClose={() => setTermsModalOpen(false)}
        activeTab={termsModalTab}
        setActiveTab={setTermsModalTab}
      />

      <MoreInfoModal 
        isOpen={moreInfoModalOpen}
        onClose={() => setMoreInfoModalOpen(false)}
      />

      {/* Toast Notifications */}
      <div className="toast-container">
        {toasts.map((toast) => (
          <ToastComponent
            key={toast.id}
            toast={toast}
            onDismiss={dismissToast}
          />
        ))}
      </div>
    </div>
  );
}

function App() {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider theme={darkTheme({
          accentColor: '#00ff88',
          accentColorForeground: '#0a0a0f',
          borderRadius: 'medium',
        })}>
          <ToastProvider>
            <AppContent />
          </ToastProvider>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}

export default App;
