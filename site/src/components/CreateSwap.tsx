import { useState, useEffect } from 'react';
import { useAccount, usePublicClient } from 'wagmi';
import { type Address, isAddress, parseEther } from 'viem';
import { ArrowLeftRight, Plus, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { TokenType, TOKEN_TYPE_LABELS } from '../config/contracts';
import { useSwapContract, createSwapFromForm } from '../hooks/useSwapContract';
import { useTokenApproval } from '../hooks/useTokenApproval';
import { useTokenMetadata, parseTokenAmount } from '../hooks/useTokenMetadata';
import { useSwapValidation } from '../hooks/useSwapValidation';
import { useSwapEvents } from '../hooks/useSwapEvents';
import { useToastContext } from '../contexts/ToastContext';
import { TokenInfo } from './TokenInfo';
import { ErrorModal } from './ErrorModal';
import { sanitizeText } from '../utils/sanitize';
import { logger } from '../utils/logger';
import type { SwapFormData } from '../types';

// Helper to safely convert ETH string to wei
function ethToWei(ethAmount: string): string | null {
  if (!ethAmount || ethAmount === '' || ethAmount === '0') return null;
  try {
    const wei = parseEther(ethAmount);
    return wei.toString();
  } catch {
    return null;
  }
}

const initialFormData: SwapFormData = {
  initiatorTokenType: TokenType.ERC20,
  initiatorERCContract: '',
  initiatorTokenId: '0',
  initiatorTokenQuantity: '',
  initiatorETHPortion: '',
  acceptorTokenType: TokenType.ERC20,
  acceptorERCContract: '',
  acceptorTokenId: '0',
  acceptorTokenQuantity: '',
  acceptorETHPortion: '',
  acceptor: '',
  expiryDays: 7,
};

export function CreateSwap({ onSuccess }: { onSuccess?: () => void }) {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const { initiateSwap, isPending, isConfirming, contractAddress } = useSwapContract();
  const { approve, checkApproval, isPending: isApproving } = useTokenApproval();
  const { validateSwap } = useSwapValidation();
  const { addSwapFromTx, refetch } = useSwapEvents();
  const { showToast, updateToast } = useToastContext();
  
  const [formData, setFormData] = useState<SwapFormData>(initialFormData);
  const [step, setStep] = useState<'form' | 'approval' | 'confirm'>('form');
  const [error, setError] = useState<string | null>(null);
  const [errorType, setErrorType] = useState<'error' | 'warning' | 'restriction'>('error');
  const [errorTitle, setErrorTitle] = useState<string>('Error');
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [success, setSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [isApprovingLocal, setIsApprovingLocal] = useState(false);

  // Helper to show error modal
  const showError = (
    message: string, 
    type: 'error' | 'warning' | 'restriction' = 'error',
    title?: string
  ) => {
    setError(message);
    setErrorType(type);
    setErrorTitle(title || (type === 'restriction' ? 'Transfer Restriction' : type === 'warning' ? 'Warning' : 'Error'));
    setShowErrorModal(true);
  };

  const dismissError = () => {
    setShowErrorModal(false);
  };

  // Use human-readable amounts for ERC20/ERC777
  const [initiatorHumanAmount, setInitiatorHumanAmount] = useState('');
  const [acceptorHumanAmount, setAcceptorHumanAmount] = useState('');

  // Token metadata for calculating wei values
  const initiatorMeta = useTokenMetadata(
    formData.initiatorERCContract,
    formData.initiatorTokenType,
    formData.initiatorTokenId
  );
  
  const acceptorMeta = useTokenMetadata(
    formData.acceptorERCContract,
    formData.acceptorTokenType,
    formData.acceptorTokenId
  );

  // Update wei quantity when human amount changes
  useEffect(() => {
    if (initiatorHumanAmount && initiatorMeta.metadata?.decimals !== null) {
      const wei = parseTokenAmount(initiatorHumanAmount, initiatorMeta.metadata?.decimals ?? 18);
      setFormData(prev => ({ ...prev, initiatorTokenQuantity: wei }));
    }
  }, [initiatorHumanAmount, initiatorMeta.metadata?.decimals]);

  useEffect(() => {
    if (acceptorHumanAmount && acceptorMeta.metadata?.decimals !== null) {
      const wei = parseTokenAmount(acceptorHumanAmount, acceptorMeta.metadata?.decimals ?? 18);
      setFormData(prev => ({ ...prev, acceptorTokenQuantity: wei }));
    }
  }, [acceptorHumanAmount, acceptorMeta.metadata?.decimals]);

  const updateField = (field: keyof SwapFormData, value: string | number) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setError(null);
  };

  const validateForm = (): string | null => {
    // Check that at least one side has tokens or ETH
    const initiatorHasValue = 
      formData.initiatorTokenType !== TokenType.NONE || 
      (formData.initiatorETHPortion && parseFloat(formData.initiatorETHPortion) > 0);
    
    const acceptorHasValue = 
      formData.acceptorTokenType !== TokenType.NONE || 
      (formData.acceptorETHPortion && parseFloat(formData.acceptorETHPortion) > 0);

    if (!initiatorHasValue) {
      return 'You must offer something (tokens or ETH)';
    }

    if (!acceptorHasValue) {
      return 'Acceptor must provide something (tokens or ETH)';
    }

    // Both can't have ETH portions
    if (formData.initiatorETHPortion && formData.acceptorETHPortion && 
        parseFloat(formData.initiatorETHPortion) > 0 && parseFloat(formData.acceptorETHPortion) > 0) {
      return 'Only one party can provide ETH';
    }

    // Validate token contracts
    if (formData.initiatorTokenType !== TokenType.NONE) {
      if (!formData.initiatorERCContract) {
        return 'Your token contract address is required';
      }
      if (!isAddress(formData.initiatorERCContract)) {
        return 'Your token contract address is invalid';
      }
    }

    if (formData.acceptorTokenType !== TokenType.NONE) {
      if (!formData.acceptorERCContract) {
        return 'Acceptor token contract address is required';
      }
      if (!isAddress(formData.acceptorERCContract)) {
        return 'Acceptor token contract address is invalid';
      }
    }

    // Validate quantities for ERC20/ERC777/1155
    if ((formData.initiatorTokenType === TokenType.ERC20 || 
         formData.initiatorTokenType === TokenType.ERC777 ||
         formData.initiatorTokenType === TokenType.ERC1155) 
        && (!formData.initiatorTokenQuantity || formData.initiatorTokenQuantity === '0')) {
      return 'Your token quantity is required';
    }

    if ((formData.acceptorTokenType === TokenType.ERC20 || 
         formData.acceptorTokenType === TokenType.ERC777 ||
         formData.acceptorTokenType === TokenType.ERC1155) 
        && (!formData.acceptorTokenQuantity || formData.acceptorTokenQuantity === '0')) {
      return 'Acceptor token quantity is required';
    }

    // Validate acceptor address if provided
    if (formData.acceptor && !isAddress(formData.acceptor)) {
      return 'Acceptor address is invalid';
    }

    // Acceptor cannot be the same as initiator
    if (formData.acceptor && address && formData.acceptor.toLowerCase() === address.toLowerCase()) {
      return 'Acceptor cannot be the same as the initiator (yourself)';
    }

    // ERC721 with empty acceptor not allowed
    if (formData.acceptorTokenType === TokenType.ERC721 && !formData.acceptor) {
      return 'Acceptor address is required for NFT swaps';
    }

    return null;
  };

  const handleCheckApproval = async () => {
    if (!address) return;
    
    setError(null);
    setShowErrorModal(false);
    setIsValidating(true);

    try {
      // Step 1: Basic form validation
      const formValidationError = validateForm();
      if (formValidationError) {
        showError(formValidationError, 'warning', 'Validation Error');
        setIsValidating(false);
        return;
      }

      // Step 2: Run comprehensive validation
      const validationErrors = await validateSwap(
        {
          initiatorTokenType: formData.initiatorTokenType,
          initiatorERCContract: formData.initiatorERCContract,
          initiatorTokenId: formData.initiatorTokenId,
          initiatorTokenQuantity: formData.initiatorTokenQuantity,
          initiatorETHPortion: formData.initiatorETHPortion,
          acceptorTokenType: formData.acceptorTokenType,
          acceptorERCContract: formData.acceptorERCContract,
          acceptorTokenId: formData.acceptorTokenId,
          acceptorTokenQuantity: formData.acceptorTokenQuantity,
          acceptorETHPortion: formData.acceptorETHPortion,
          acceptor: formData.acceptor,
          expiryDays: formData.expiryDays,
        },
        address
      );

      // Separate errors and warnings
      const errors = validationErrors.filter(e => e.type === 'error');
      const warnings = validationErrors.filter(e => e.type === 'warning');

      // If there are blocking errors, show them all
      if (errors.length > 0) {
        const hasRestriction = errors.some(e => e.category === 'restriction');
        const errorMessages = errors.map((e) => {
          const prefix = e.party === 'initiator' ? '• [You]' : e.party === 'acceptor' ? '• [Acceptor]' : '•';
          return `${prefix} ${e.message}`;
        }).join('\n\n');

        showError(
          errorMessages,
          hasRestriction ? 'restriction' : 'error',
          errors.length === 1 
            ? (errors[0].category === 'restriction' ? 'Operator Restriction' : 'Validation Error')
            : 'Multiple Issues Found'
        );
        setIsValidating(false);
        return;
      }

      // Show warnings but continue
      if (warnings.length > 0) {
        logger.log('Swap warnings:', warnings);
        // Could show a non-blocking warning modal here if desired
      }

      // Step 3: Check approval status
      if (formData.initiatorTokenType !== TokenType.NONE) {
        const hasApproval = await checkApproval(
          formData.initiatorTokenType,
          formData.initiatorERCContract as Address,
          BigInt(formData.initiatorTokenId || '0'),
          BigInt(formData.initiatorTokenQuantity || '0')
        );
        
        if (!hasApproval) {
          setStep('approval');
          setIsValidating(false);
          return;
        }
      }
      
      setStep('confirm');
    } catch (err) {
      logger.error('Validation error:', err);
      showError('Failed to validate swap. Please check your inputs and try again.', 'error');
    } finally {
      setIsValidating(false);
    }
  };

  const handleApprove = async () => {
    if (!address || !publicClient) return;
    
    let pendingToastId: string | null = null;
    try {
      setIsApprovingLocal(true);
      setError(null);
      setShowErrorModal(false);
      pendingToastId = showToast('Approving tokens...', 'pending');
      const hash = await approve(
        formData.initiatorTokenType,
        formData.initiatorERCContract as Address,
        BigInt(formData.initiatorTokenId || '0'),
        BigInt(formData.initiatorTokenQuantity || '0')
      );
      
      if (hash) {
        // Wait for transaction receipt
        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        // Update pending toast to success/error
        if (receipt.status === 'success') {
          updateToast(pendingToastId, {
            message: 'Tokens approved successfully!',
            type: 'success',
            txHash: hash,
          });
          setStep('confirm');
        } else {
          updateToast(pendingToastId, {
            message: 'Approval transaction failed',
            type: 'error',
            txHash: hash,
          });
        }
      } else {
        updateToast(pendingToastId, {
          message: 'Approval completed',
          type: 'success',
        });
        setStep('confirm');
      }
    } catch (err) {
      // Check for user rejection in multiple ways
      const errorMessage = err instanceof Error ? err.message : String(err);
      const errorString = errorMessage.toLowerCase();
      const isUserRejection = err instanceof Error && (
        errorString.includes('user rejected') ||
        errorString.includes('user denied') ||
        errorString.includes('denied transaction signature') ||
        errorString.includes('rejected the request') ||
        errorString.includes('user rejected the request')
      );
      
      if (isUserRejection) {
        // Don't show error modal or log for user rejections - just show toast
        if (pendingToastId) {
          updateToast(pendingToastId, {
            message: 'Approval was rejected',
            type: 'error',
          });
        } else {
          showToast('Approval was rejected', 'error');
        }
        } else {
          logger.error('Approval error:', err);
          showError('Approval failed. Please try again.', 'error', 'Approval Failed');
          if (pendingToastId) {
          updateToast(pendingToastId, {
            message: 'Approval failed',
            type: 'error',
          });
        }
      }
    } finally {
      setIsApprovingLocal(false);
    }
  };

  const handleSubmit = async () => {
    if (!address || !publicClient) {
      showError('Wallet not connected', 'error');
      return;
    }
    
    setIsSubmitting(true);
    setError(null);
    setShowErrorModal(false);
    
    let pendingToastId: string | null = null;
    try {
      const swap = createSwapFromForm(address, formData);
      logger.log('Initiating swap:', swap);
      
      pendingToastId = showToast('Creating swap...', 'pending');
      const hash = await initiateSwap(swap);
      logger.log('Transaction hash:', hash);
      
      // Wait for transaction receipt
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      
      if (receipt.status === 'success') {
        // Add swap to list from transaction receipt (pass receipt to avoid waiting again)
        const newSwap = await addSwapFromTx(hash, receipt);
        
        // Update pending toast to success
        if (newSwap) {
          updateToast(pendingToastId, {
            message: 'Swap created successfully!',
            type: 'success',
            txHash: hash,
          });
          
          // Small delay to ensure state updates before switching tabs
          setTimeout(() => {
            setSuccess(true);
            setFormData(initialFormData);
            setInitiatorHumanAmount('');
            setAcceptorHumanAmount('');
            setStep('form');
            onSuccess?.();
          }, 100);
        } else {
          // If swap wasn't added, trigger a refetch to pick up the swap
          logger.warn('Swap transaction succeeded but event was not found in receipt, triggering refetch');
          updateToast(pendingToastId, {
            message: 'Swap created! Refreshing list...',
            type: 'success',
            txHash: hash,
          });
          
          // Trigger a refetch to pick up the swap
          refetch();
          
          // Small delay before switching tabs to allow refetch to complete
          setTimeout(() => {
            setSuccess(true);
            setFormData(initialFormData);
            setInitiatorHumanAmount('');
            setAcceptorHumanAmount('');
            setStep('form');
            onSuccess?.();
          }, 1000);
        }
      } else {
        updateToast(pendingToastId, {
          message: 'Swap creation transaction failed',
          type: 'error',
          txHash: hash,
        });
      }
    } catch (err: unknown) {
      // Check for user rejection in multiple ways
      const errorMessage = err instanceof Error ? err.message : String(err);
      const errorString = errorMessage.toLowerCase();
      const isUserRejection = err instanceof Error && (
        errorString.includes('user rejected') ||
        errorString.includes('user denied') ||
        errorString.includes('denied transaction signature') ||
        errorString.includes('rejected the request') ||
        errorString.includes('user rejected the request')
      );
      
      if (isUserRejection) {
        // Don't show error modal or log for user rejections - just show toast
        if (pendingToastId) {
          updateToast(pendingToastId, {
            message: 'Swap creation was rejected',
            type: 'error',
          });
        } else {
          showToast('Swap creation was rejected', 'error');
        }
      } else {
        logger.error('Swap initiation error:', err);
        let errorMessage = 'Transaction failed';
        let errorTitle = 'Transaction Failed';
        
        if (err instanceof Error) {
          // Parse common error messages
          if (err.message.includes('insufficient funds')) {
            errorMessage = 'Insufficient funds for gas';
            errorTitle = 'Insufficient Funds';
          } else if (err.message.includes('SwapIsInThePast')) {
            errorMessage = 'Swap expiry date is in the past';
            errorTitle = 'Invalid Expiry';
          } else {
            errorMessage = err.message.slice(0, 150);
          }
        }
        
        showError(errorMessage, 'error', errorTitle);
        if (pendingToastId) {
          updateToast(pendingToastId, {
            message: errorMessage,
            type: 'error',
          });
        }
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setFormData(initialFormData);
    setInitiatorHumanAmount('');
    setAcceptorHumanAmount('');
    setStep('form');
    setError(null);
    setSuccess(false);
  };

  if (!isConnected) {
    return (
      <div className="card">
        <div className="empty-state">
          <AlertCircle size={48} />
          <h3>Connect Your Wallet</h3>
          <p>Please connect your wallet to create a swap</p>
        </div>
      </div>
    );
  }

  if (!contractAddress) {
    return (
      <div className="card">
        <div className="empty-state">
          <AlertCircle size={48} />
          <h3>Unsupported Network</h3>
          <p>Please switch to Ethereum, Sepolia, or Linea</p>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="card">
        <div className="empty-state success">
          <CheckCircle2 size={48} />
          <h3>Swap Created!</h3>
          <p>Your swap has been initiated successfully</p>
          <button className="btn btn-primary" onClick={resetForm}>
            Create Another
          </button>
        </div>
      </div>
    );
  }

  const isFungibleInitiator = formData.initiatorTokenType === TokenType.ERC20 || 
                               formData.initiatorTokenType === TokenType.ERC777;
  const isFungibleAcceptor = formData.acceptorTokenType === TokenType.ERC20 || 
                              formData.acceptorTokenType === TokenType.ERC777;

  return (
    <div className="card">
      <h2 className="card-title">
        <Plus size={24} />
        Create New Swap
      </h2>

      {/* Error Modal */}
      <ErrorModal
        isOpen={showErrorModal}
        onClose={dismissError}
        title={errorTitle}
        message={error || ''}
        type={errorType}
      />

      {step === 'form' && (
        <div className="swap-form">
          <div className="swap-sides">
            {/* Your Side */}
            <div className="swap-side">
              <h3>You Offer</h3>
              
              <div className="form-group">
                <label>Token Type</label>
                <select
                  value={formData.initiatorTokenType}
                  onChange={(e) => {
                    updateField('initiatorTokenType', parseInt(e.target.value));
                    setInitiatorHumanAmount('');
                    updateField('initiatorTokenQuantity', '');
                  }}
                >
                  {Object.entries(TOKEN_TYPE_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>

              {formData.initiatorTokenType !== TokenType.NONE && (
                <>
                  <div className="form-group">
                    <label>Token Contract</label>
                    <input
                      type="text"
                      placeholder="0x..."
                      value={formData.initiatorERCContract}
                      onChange={(e) => updateField('initiatorERCContract', e.target.value)}
                    />
                  </div>

                  {/* Token Info Display */}
                  <TokenInfo
                    tokenAddress={formData.initiatorERCContract}
                    tokenType={formData.initiatorTokenType}
                    tokenId={formData.initiatorTokenId}
                    quantity={formData.initiatorTokenQuantity}
                  />

                  {(formData.initiatorTokenType === TokenType.ERC721 || 
                    formData.initiatorTokenType === TokenType.ERC1155) && (
                    <div className="form-group">
                      <label>Token ID</label>
                      <input
                        type="text"
                        placeholder="0"
                        value={formData.initiatorTokenId}
                        onChange={(e) => updateField('initiatorTokenId', e.target.value)}
                      />
                    </div>
                  )}

                  {(formData.initiatorTokenType === TokenType.ERC1155) && (
                    <div className="form-group">
                      <label>Quantity</label>
                      <input
                        type="text"
                        placeholder="Amount"
                        value={formData.initiatorTokenQuantity}
                        onChange={(e) => updateField('initiatorTokenQuantity', e.target.value)}
                      />
                    </div>
                  )}

                  {isFungibleInitiator && (
                    <div className="form-group">
                      <label>
                        Amount 
                        {initiatorMeta.metadata?.symbol && ` (${sanitizeText(initiatorMeta.metadata.symbol)})`}
                      </label>
                      <input
                        type="text"
                        placeholder={initiatorMeta.metadata?.decimals !== null 
                          ? `e.g., 100 (${initiatorMeta.metadata?.decimals} decimals)` 
                          : 'Enter amount'}
                        value={initiatorHumanAmount}
                        onChange={(e) => setInitiatorHumanAmount(e.target.value)}
                      />
                      {formData.initiatorTokenQuantity && (
                        <span className="form-hint">
                          Wei: {formData.initiatorTokenQuantity}
                        </span>
                      )}
                    </div>
                  )}
                </>
              )}

              <div className="form-group">
                <label>+ ETH (optional) <span className="label-hint">18 decimals</span></label>
                <input
                  type="text"
                  placeholder="0.0"
                  value={formData.initiatorETHPortion}
                  onChange={(e) => updateField('initiatorETHPortion', e.target.value)}
                  disabled={!!formData.acceptorETHPortion && parseFloat(formData.acceptorETHPortion) > 0}
                />
                {ethToWei(formData.initiatorETHPortion) && (
                  <span className="form-hint">
                    Wei: {ethToWei(formData.initiatorETHPortion)}
                  </span>
                )}
              </div>
            </div>

            <div className="swap-arrow">
              <ArrowLeftRight size={32} />
            </div>

            {/* Acceptor Side */}
            <div className="swap-side">
              <h3>You Receive</h3>
              
              <div className="form-group">
                <label>Token Type</label>
                <select
                  value={formData.acceptorTokenType}
                  onChange={(e) => {
                    updateField('acceptorTokenType', parseInt(e.target.value));
                    setAcceptorHumanAmount('');
                    updateField('acceptorTokenQuantity', '');
                  }}
                >
                  {Object.entries(TOKEN_TYPE_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>

              {formData.acceptorTokenType !== TokenType.NONE && (
                <>
                  <div className="form-group">
                    <label>Token Contract</label>
                    <input
                      type="text"
                      placeholder="0x..."
                      value={formData.acceptorERCContract}
                      onChange={(e) => updateField('acceptorERCContract', e.target.value)}
                    />
                  </div>

                  {/* Token Info Display */}
                  <TokenInfo
                    tokenAddress={formData.acceptorERCContract}
                    tokenType={formData.acceptorTokenType}
                    tokenId={formData.acceptorTokenId}
                    quantity={formData.acceptorTokenQuantity}
                  />

                  {(formData.acceptorTokenType === TokenType.ERC721 || 
                    formData.acceptorTokenType === TokenType.ERC1155) && (
                    <div className="form-group">
                      <label>Token ID</label>
                      <input
                        type="text"
                        placeholder="0"
                        value={formData.acceptorTokenId}
                        onChange={(e) => updateField('acceptorTokenId', e.target.value)}
                      />
                    </div>
                  )}

                  {(formData.acceptorTokenType === TokenType.ERC1155) && (
                    <div className="form-group">
                      <label>Quantity</label>
                      <input
                        type="text"
                        placeholder="Amount"
                        value={formData.acceptorTokenQuantity}
                        onChange={(e) => updateField('acceptorTokenQuantity', e.target.value)}
                      />
                    </div>
                  )}

                  {isFungibleAcceptor && (
                    <div className="form-group">
                      <label>
                        Amount 
                        {acceptorMeta.metadata?.symbol && ` (${sanitizeText(acceptorMeta.metadata.symbol)})`}
                      </label>
                      <input
                        type="text"
                        placeholder={acceptorMeta.metadata?.decimals !== null 
                          ? `e.g., 100 (${acceptorMeta.metadata?.decimals} decimals)` 
                          : 'Enter amount'}
                        value={acceptorHumanAmount}
                        onChange={(e) => setAcceptorHumanAmount(e.target.value)}
                      />
                      {formData.acceptorTokenQuantity && (
                        <span className="form-hint">
                          Wei: {formData.acceptorTokenQuantity}
                        </span>
                      )}
                    </div>
                  )}
                </>
              )}

              <div className="form-group">
                <label>+ ETH from acceptor (optional) <span className="label-hint">18 decimals</span></label>
                <input
                  type="text"
                  placeholder="0.0"
                  value={formData.acceptorETHPortion}
                  onChange={(e) => updateField('acceptorETHPortion', e.target.value)}
                  disabled={!!formData.initiatorETHPortion && parseFloat(formData.initiatorETHPortion) > 0}
                />
                {ethToWei(formData.acceptorETHPortion) && (
                  <span className="form-hint">
                    Wei: {ethToWei(formData.acceptorETHPortion)}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="swap-options">
            <div className="swap-options-section">
              <h3>Who and When</h3>
              <div className="swap-options-content">
                <div className="form-group">
                  <label>Acceptor Address (leave empty for open swap)</label>
                  <input
                    type="text"
                    placeholder="0x... or leave empty for anyone"
                    value={formData.acceptor}
                    onChange={(e) => updateField('acceptor', e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label>Expires in (days)</label>
                  <input
                    type="number"
                    min="1"
                    max="365"
                    value={formData.expiryDays}
                    onChange={(e) => updateField('expiryDays', parseInt(e.target.value) || 7)}
                  />
                </div>
              </div>
            </div>
          </div>

          <button 
            className="btn btn-primary btn-full"
            onClick={handleCheckApproval}
            disabled={isPending || isConfirming || isValidating}
          >
            {isValidating ? (
              <>
                <Loader2 size={18} className="spin" />
                Validating...
              </>
            ) : (
              'Continue'
            )}
          </button>
        </div>
      )}

      {step === 'approval' && (
        <div className="approval-step">
          <h3>Token Approval Required</h3>
          <p>You need to approve the swap contract to transfer your tokens.</p>
          
          <TokenInfo
            tokenAddress={formData.initiatorERCContract}
            tokenType={formData.initiatorTokenType}
            tokenId={formData.initiatorTokenId}
            quantity={formData.initiatorTokenQuantity}
          />
          
          <button 
            className="btn btn-primary btn-full"
            onClick={handleApprove}
            disabled={isApprovingLocal || isApproving}
          >
            {isApprovingLocal || isApproving ? (
              <>
                <Loader2 size={18} className="spin" />
                Approving...
              </>
            ) : (
              'Approve Tokens'
            )}
          </button>
          
          <button 
            className="btn btn-secondary btn-full"
            onClick={() => setStep('form')}
          >
            Back
          </button>
        </div>
      )}

      {step === 'confirm' && (
        <div className="confirm-step">
          <h3>Confirm Swap</h3>
          
          <div className="swap-summary">
            <div className="summary-section">
              <h4>You Offer</h4>
              {formData.initiatorTokenType !== TokenType.NONE && (
                <TokenInfo
                  tokenAddress={formData.initiatorERCContract}
                  tokenType={formData.initiatorTokenType}
                  tokenId={formData.initiatorTokenId}
                  quantity={formData.initiatorTokenQuantity}
                />
              )}
              {formData.initiatorETHPortion && parseFloat(formData.initiatorETHPortion) > 0 && (
                <div className="eth-summary">
                  <div className="summary-row">
                    <span>ETH:</span>
                    <span>{formData.initiatorETHPortion} ETH</span>
                  </div>
                  <div className="summary-row muted">
                    <span>Wei:</span>
                    <span className="mono">{ethToWei(formData.initiatorETHPortion)}</span>
                  </div>
                </div>
              )}
            </div>

            <div className="summary-section">
              <h4>You Receive</h4>
              {formData.acceptorTokenType !== TokenType.NONE && (
                <TokenInfo
                  tokenAddress={formData.acceptorERCContract}
                  tokenType={formData.acceptorTokenType}
                  tokenId={formData.acceptorTokenId}
                  quantity={formData.acceptorTokenQuantity}
                />
              )}
              {formData.acceptorETHPortion && parseFloat(formData.acceptorETHPortion) > 0 && (
                <div className="eth-summary">
                  <div className="summary-row">
                    <span>ETH:</span>
                    <span>{formData.acceptorETHPortion} ETH</span>
                  </div>
                  <div className="summary-row muted">
                    <span>Wei:</span>
                    <span className="mono">{ethToWei(formData.acceptorETHPortion)}</span>
                  </div>
                </div>
              )}
            </div>

            <div className="summary-row">
              <span>Acceptor:</span>
              <span>{formData.acceptor || 'Anyone (Open Swap)'}</span>
            </div>
            <div className="summary-row">
              <span>Expires:</span>
              <span>{formData.expiryDays} days</span>
            </div>
          </div>

          <button 
            className="btn btn-primary btn-full"
            onClick={handleSubmit}
            disabled={isPending || isConfirming || isSubmitting}
          >
            {isPending || isConfirming || isSubmitting ? (
              <>
                <Loader2 size={18} className="spin" />
                {isSubmitting ? 'Creating Swap...' : 'Confirming...'}
              </>
            ) : (
              'Create Swap'
            )}
          </button>
          
          <button 
            className="btn btn-secondary btn-full"
            onClick={() => setStep('form')}
            disabled={isPending || isConfirming || isSubmitting}
          >
            Back
          </button>
        </div>
      )}
    </div>
  );
}
