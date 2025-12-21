import { useEffect } from 'react';
import { useChainId } from 'wagmi';
import { CheckCircle, XCircle, Loader2, X } from 'lucide-react';

function getExplorerTxUrl(chainId: number, txHash: string): string {
  const explorers: Record<number, string> = {
    1: `https://etherscan.io/tx/${txHash}`,
    11155111: `https://sepolia.etherscan.io/tx/${txHash}`,
    59144: `https://lineascan.build/tx/${txHash}`,
    59141: `https://sepolia.lineascan.build/tx/${txHash}`,
  };
  return explorers[chainId] || `https://etherscan.io/tx/${txHash}`;
}

export type ToastType = 'success' | 'error' | 'info' | 'pending';

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
  txHash?: string;
  duration?: number;
}

interface ToastProps {
  toast: Toast;
  onDismiss: (id: string) => void;
}

export function ToastComponent({ toast, onDismiss }: ToastProps) {
  const chainId = useChainId();
  
  useEffect(() => {
    if (toast.type !== 'pending' && toast.duration !== 0) {
      const timer = setTimeout(() => {
        onDismiss(toast.id);
      }, toast.duration || 5000);
      return () => clearTimeout(timer);
    }
  }, [toast, onDismiss]);

  const getIcon = () => {
    switch (toast.type) {
      case 'success':
        return <CheckCircle size={20} />;
      case 'error':
        return <XCircle size={20} />;
      case 'pending':
        return <Loader2 size={20} className="spin" />;
      default:
        return null;
    }
  };

  const getClassName = () => {
    const base = 'toast';
    switch (toast.type) {
      case 'success':
        return `${base} toast-success`;
      case 'error':
        return `${base} toast-error`;
      case 'pending':
        return `${base} toast-pending`;
      default:
        return `${base} toast-info`;
    }
  };

  return (
    <div className={getClassName()}>
      <div className="toast-icon">{getIcon()}</div>
      <div className="toast-content">
        <div className="toast-message">{toast.message}</div>
        {toast.txHash && (
          <a
            href={getExplorerTxUrl(chainId, toast.txHash)}
            target="_blank"
            rel="noopener noreferrer"
            className="toast-link"
            onClick={(e) => e.stopPropagation()}
          >
            View on Explorer
          </a>
        )}
      </div>
      {toast.type !== 'pending' && (
        <button
          className="toast-close"
          onClick={() => onDismiss(toast.id)}
          aria-label="Dismiss"
        >
          <X size={16} />
        </button>
      )}
    </div>
  );
}

