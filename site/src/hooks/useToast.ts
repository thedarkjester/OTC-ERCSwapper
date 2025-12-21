import { useState, useCallback } from 'react';
import type { Toast } from '../components/Toast';

let toastIdCounter = 0;

export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((message: string, type: Toast['type'], txHash?: string, duration?: number) => {
    const id = `toast-${++toastIdCounter}`;
    const toast: Toast = {
      id,
      message,
      type,
      txHash,
      duration,
    };
    
    setToasts((prev) => [...prev, toast]);
    return id;
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const updateToast = useCallback((id: string, updates: Partial<Toast>) => {
    setToasts((prev) =>
      prev.map((toast) => (toast.id === id ? { ...toast, ...updates } : toast))
    );
  }, []);

  return {
    toasts,
    showToast,
    dismissToast,
    updateToast,
  };
}

