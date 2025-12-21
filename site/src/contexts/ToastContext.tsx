import { createContext, useContext, type ReactNode } from 'react';
import { useToast } from '../hooks/useToast';
import type { Toast } from '../components/Toast';

interface ToastContextType {
  showToast: (message: string, type: Toast['type'], txHash?: string, duration?: number) => string;
  dismissToast: (id: string) => void;
  updateToast: (id: string, updates: Partial<Toast>) => void;
  toasts: Toast[];
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const toast = useToast();
  return <ToastContext.Provider value={toast}>{children}</ToastContext.Provider>;
}

export function useToastContext() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToastContext must be used within ToastProvider');
  }
  return context;
}

