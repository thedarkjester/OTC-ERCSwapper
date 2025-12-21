import { useState } from 'react';
import { useAccount } from 'wagmi';
import { Loader2, ArrowDownToLine, RefreshCw, Globe, Eye, EyeOff } from 'lucide-react';
import { useSwapEvents } from '../hooks/useSwapEvents';
import { SwapCard } from './SwapCard';

export function AcceptSwaps() {
  const { isConnected } = useAccount();
  const [activeTab, setActiveTab] = useState<'direct' | 'open'>('direct');
  const { 
    acceptableSwaps,
    openSwaps,
    isLoading, 
    refetch,
    updateSwap,
    hideSwap,
    unhideSwap,
    isHidden,
    showHidden,
    setShowHidden,
    hiddenCount,
  } = useSwapEvents();

  if (!isConnected) {
    return (
      <div className="card">
        <div className="empty-state">
          <ArrowDownToLine size={48} />
          <h3>Connect Your Wallet</h3>
          <p>Connect your wallet to see swaps you can accept</p>
        </div>
      </div>
    );
  }

  const totalSwaps = acceptableSwaps.length + openSwaps.length;

  return (
    <div className="card">
      <div className="card-header">
        <h2 className="card-title">
          <ArrowDownToLine size={24} />
          Swaps For You
        </h2>
        <div className="header-actions">
          {hiddenCount > 0 && (
            <button 
              className={`btn btn-icon ${showHidden ? 'active' : ''}`}
              onClick={() => setShowHidden(!showHidden)}
              title={showHidden ? 'Hide hidden swaps' : `Show ${hiddenCount} hidden swaps`}
            >
              {showHidden ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          )}
          <button 
            className="btn btn-icon" 
            onClick={refetch}
            disabled={isLoading}
          >
            <RefreshCw size={18} className={isLoading ? 'spin' : ''} />
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="loading-state">
          <Loader2 size={32} className="spin" />
          <p>Loading swaps...</p>
        </div>
      ) : totalSwaps === 0 ? (
        <div className="empty-state">
          <ArrowDownToLine size={48} />
          <h3>No Pending Swaps</h3>
          <p>No one has created a swap for you yet</p>
        </div>
      ) : (
        <>
          {/* Tabs */}
          <div className="tabs">
            <button
              className={`tab ${activeTab === 'direct' ? 'active' : ''}`}
              onClick={() => setActiveTab('direct')}
            >
              <ArrowDownToLine size={18} />
              Direct Offers ({acceptableSwaps.length})
            </button>
            <button
              className={`tab ${activeTab === 'open' ? 'active' : ''}`}
              onClick={() => setActiveTab('open')}
            >
              <Globe size={18} />
              Open Swaps ({openSwaps.length})
            </button>
          </div>

          {/* Tab Content */}
          {activeTab === 'direct' && (
            <div className="swaps-section">
              {acceptableSwaps.length > 0 ? (
                <div className="swaps-grid">
                  {acceptableSwaps.map((swap) => (
                    <SwapCard 
                      key={swap.swapId.toString()} 
                      swapEvent={swap}
                      mode="acceptor"
                      onAction={refetch}
                      onUpdate={updateSwap}
                      onHide={() => hideSwap(swap.swapId)}
                      onUnhide={showHidden ? () => unhideSwap(swap.swapId) : undefined}
                      isHidden={isHidden(swap.swapId)}
                      isCompleted={false}
                    />
                  ))}
                </div>
              ) : (
                <div className="empty-state">
                  <ArrowDownToLine size={48} />
                  <h3>No Direct Offers</h3>
                  <p>No one has created a direct swap for you yet</p>
                </div>
              )}
            </div>
          )}

          {activeTab === 'open' && (
            <div className="swaps-section">
              {openSwaps.length > 0 ? (
                <>
                  <p className="section-desc">These swaps are open for anyone to accept</p>
                  <div className="swaps-grid">
                    {openSwaps.map((swap) => (
                      <SwapCard 
                        key={swap.swapId.toString()} 
                        swapEvent={swap}
                        mode="acceptor"
                        onAction={refetch}
                        onUpdate={updateSwap}
                        onHide={() => hideSwap(swap.swapId)}
                        onUnhide={showHidden ? () => unhideSwap(swap.swapId) : undefined}
                        isHidden={isHidden(swap.swapId)}
                        isCompleted={false}
                      />
                    ))}
                  </div>
                </>
              ) : (
                <div className="empty-state">
                  <Globe size={48} />
                  <h3>No Open Swaps</h3>
                  <p>There are no open swaps available at the moment</p>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
