import { X, AlertCircle, AlertTriangle, ShieldAlert } from 'lucide-react';

interface ErrorModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  message: string;
  type?: 'error' | 'warning' | 'restriction';
}

export function ErrorModal({ 
  isOpen, 
  onClose, 
  title = 'Error', 
  message,
  type = 'error'
}: ErrorModalProps) {
  if (!isOpen) return null;

  const getIcon = () => {
    switch (type) {
      case 'warning':
        return <AlertTriangle size={32} />;
      case 'restriction':
        return <ShieldAlert size={32} />;
      default:
        return <AlertCircle size={32} />;
    }
  };

  const getTitle = () => {
    if (title) return title;
    switch (type) {
      case 'warning':
        return 'Warning';
      case 'restriction':
        return 'Transfer Restriction';
      default:
        return 'Error';
    }
  };

  // Split message by newlines and render each as a separate paragraph
  const messageLines = message.split('\n').filter(line => line.trim());
  const hasMultipleErrors = messageLines.length > 1;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className={`modal-content error-modal error-modal-${type}`} onClick={e => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>
          <X size={20} />
        </button>

        <div className="error-modal-content">
          <div className={`error-modal-icon ${type}`}>
            {getIcon()}
          </div>
          
          <h2 className="error-modal-title">{getTitle()}</h2>
          
          <div className={`error-modal-message ${hasMultipleErrors ? 'error-list' : ''}`}>
            {messageLines.map((line, index) => (
              <p key={index} className="error-line">{line}</p>
            ))}
          </div>

          <button className="btn btn-primary btn-full" onClick={onClose}>
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}

