import { useAccount } from 'wagmi';
import { Loader2, Inbox, RefreshCw, Eye, EyeOff, CheckCircle2 } from 'lucide-react';
import { useSwapEvents } from '../hooks/useSwapEvents';
import { SwapCard } from './SwapCard';

export function MySwaps() {
  const { isConnected } = useAccount();
  const { 
    initiatedSwaps,
    completedSwaps,
    isLoading, 
    refetch,
    updateSwap,
    hideSwap,
    unhideSwap,
    isHidden,
    showHidden,
    setShowHidden,
    showCompleted,
    setShowCompleted,
    hiddenCount,
  } = useSwapEvents();

  if (!isConnected) {
    return (
      <div className="card">
        <div className="empty-state">
          <Inbox size={48} />
          <h3>Connect Your Wallet</h3>
          <p>Connect your wallet to see your swaps</p>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="card-header">
        <h2 className="card-title">
          <Inbox size={24} />
          My Initiated Swaps
        </h2>
        <div className="header-actions">
          {completedSwaps.length > 0 && (
            <button 
              className={`btn btn-icon ${showCompleted ? 'active' : ''}`}
              onClick={() => setShowCompleted(!showCompleted)}
              title={showCompleted ? 'Hide completed swaps' : `Show ${completedSwaps.length} completed swaps`}
            >
              <CheckCircle2 size={18} />
            </button>
          )}
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
      ) : initiatedSwaps.length === 0 && (!showCompleted || completedSwaps.length === 0) ? (
        <div className="empty-state">
          <Inbox size={48} />
          <h3>No Active Swaps</h3>
          <p>You haven't initiated any swaps yet</p>
        </div>
      ) : (
        <>
          {/* Active (pending) swaps */}
          {initiatedSwaps.length > 0 && (
            <div className="swaps-section">
              <h3 className="section-title">Active Swaps ({initiatedSwaps.length})</h3>
              <div className="swaps-grid">
                {initiatedSwaps.map((swap) => (
                  <SwapCard 
                    key={swap.swapId.toString()} 
                    swapEvent={swap}
                    mode="initiator"
                    onAction={refetch}
                    onUpdate={updateSwap}
                    onHide={() => hideSwap(swap.swapId)}
                    onUnhide={showHidden ? () => unhideSwap(swap.swapId) : undefined}
                    isHidden={isHidden(swap.swapId)}
                    isCompleted={false}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Completed swaps */}
          {showCompleted && completedSwaps.length > 0 && (
            <div className="swaps-section">
              <h3 className="section-title">
                <CheckCircle2 size={18} />
                Completed Swaps ({completedSwaps.length})
              </h3>
              <div className="swaps-grid">
                {completedSwaps.map((swap) => (
                  <SwapCard 
                    key={swap.swapId.toString()} 
                    swapEvent={swap}
                    mode="initiator"
                    onAction={refetch}
                    onUpdate={updateSwap}
                    onHide={() => hideSwap(swap.swapId)}
                    onUnhide={showHidden ? () => unhideSwap(swap.swapId) : undefined}
                    isHidden={isHidden(swap.swapId)}
                    isCompleted={true}
                  />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
