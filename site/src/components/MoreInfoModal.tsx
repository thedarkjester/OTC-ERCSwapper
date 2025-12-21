import { X, ArrowLeftRight, Shield, Coins, Clock, CheckCircle, AlertCircle, FileText, ExternalLink } from 'lucide-react';

interface MoreInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function MoreInfoModal({ isOpen, onClose }: MoreInfoModalProps) {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content more-info-modal" onClick={e => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>
          <X size={20} />
        </button>
        
        <div className="more-info-content">
          <div className="more-info-header">
            <ArrowLeftRight size={32} />
            <h2>More Info on Swapping</h2>
            <p className="more-info-subtitle">
              Learn how P2PSwap enables trustless peer-to-peer token exchanges with the security of an impartial escrow contract.
            </p>
          </div>

          <div className="more-info-sections">
            <section>
              <h3>What is P2PSwap?</h3>
              <p>
                P2PSwap is a decentralized peer-to-peer token swapping platform that enables direct exchanges 
                between users with the security of a fee-less, impartial escrow contract. No middlemen, no platform fees—just 
                secure, direct swaps.
              </p>
            </section>

            <section>
              <h3>What Can You Swap?</h3>
              <p>The Token Swapper supports a wide variety of token types:</p>
              <ul>
                <li><strong>ERC-20 tokens</strong> (and variants like ERC-777, xERC20)</li>
                <li><strong>ERC-721 tokens</strong> (NFTs)</li>
                <li><strong>ERC-1155 tokens</strong> (multi-token standard)</li>
                <li><strong>ETH</strong> (native Ethereum)</li>
              </ul>
              <p>
                You can swap any combination of these token types. For example:
              </p>
              <ul>
                <li>Sell ERC-20s for ETH</li>
                <li>Swap ERC-20s for other ERC-20s, an ERC-721, or ERC-1155 tokens</li>
                <li>Sell an NFT for ETH</li>
                <li>Swap NFTs for ERC-20s, other NFTs, or ERC-1155 tokens</li>
                <li>Swap ERC-1155 tokens for any other token type</li>
              </ul>
              <p>
                <strong>Note:</strong> All token swaps can optionally include ETH on either side. 
                For example: "My NFT for 3000 DAI and 1 ETH" or "10 of my ERC-1155s (Id=1) and 0.5 ETH for your NFT".
              </p>
            </section>

            <section>
              <h3>How Does It Work?</h3>
              <div className="swap-process">
                <div className="process-step">
                  <div className="step-number">1</div>
                  <div className="step-content">
                    <h4>Agree on Terms</h4>
                    <p>
                      Two parties (initiator and acceptor) agree on the swap details through any communication channel 
                      (Discord, Twitter, Telegram, etc.).
                    </p>
                  </div>
                </div>

                <div className="process-step">
                  <div className="step-number">2</div>
                  <div className="step-content">
                    <h4>Initiator Creates Swap</h4>
                    <p>
                      The initiator sets up the swap with agreed terms, including:
                    </p>
                    <ul>
                      <li>Expiry date (must be in the future)</li>
                      <li>Token contracts, IDs, and quantities for both sides</li>
                      <li>Acceptor address (or leave empty for open swaps)</li>
                      <li>Optional ETH portions (only one side can include ETH)</li>
                    </ul>
                  </div>
                </div>

                <div className="process-step">
                  <div className="step-number">3</div>
                  <div className="step-content">
                    <h4>Verify Details</h4>
                    <p>
                      Both parties verify the swap details are correct before proceeding.
                    </p>
                  </div>
                </div>

                <div className="process-step">
                  <div className="step-number">4</div>
                  <div className="step-content">
                    <h4>Approve Tokens</h4>
                    <p>
                      Both parties approve the Token Swapper contract to transfer their tokens. 
                      The UI will guide you through this process.
                    </p>
                  </div>
                </div>

                <div className="process-step">
                  <div className="step-number">5</div>
                  <div className="step-content">
                    <h4>Acceptor Completes Swap</h4>
                    <p>
                      The acceptor completes the swap. The contract automatically verifies:
                    </p>
                    <ul>
                      <li>Both parties still own their tokens</li>
                      <li>Both parties have approved the contract</li>
                      <li>The swap hasn't expired</li>
                    </ul>
                    <p>
                      If all checks pass, the tokens are swapped atomically in a single transaction.
                    </p>
                  </div>
                </div>

                <div className="process-step">
                  <div className="step-number">6</div>
                  <div className="step-content">
                    <h4>ETH Distribution</h4>
                    <p>
                      If either party included ETH in the swap, it is automatically sent to them 
                      when the swap completes.
                    </p>
                  </div>
                </div>
              </div>
            </section>

            <section>
              <h3>Open Swaps</h3>
              <p>
                When creating a swap, you can leave the acceptor address empty to create an <strong>open swap</strong>. 
                This allows anyone to accept the swap, provided they meet the criteria you specified.
              </p>
              <p>
                <strong>Example:</strong> "First person to give me 1 ETH can have my SuperDuperNFT (Id = 1)"
              </p>
              <p>
                <strong>Note:</strong> Open swaps cannot be used for ERC-721 tokens on the acceptor side—only ERC-20, 
                ERC-1155, or ETH variants are applicable.
              </p>
            </section>

            <section>
              <h3>Important Notes</h3>
              <div className="info-boxes">
                <div className="info-box">
                  <Shield size={20} />
                  <div>
                    <h4>Security</h4>
                    <p>
                      The contract is non-upgradeable and has no owner. Once deployed, it cannot be changed or rug-pulled. 
                      All swaps are executed atomically—either both parties get their tokens or the transaction fails.
                    </p>
                    <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      <a 
                        href="https://diligence.consensys.io/audits/private/chl9kaod7d8tlq" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        style={{ 
                          display: 'flex', 
                          alignItems: 'center', 
                          gap: '0.5rem',
                          color: '#00ff88',
                          textDecoration: 'none',
                          fontSize: '0.875rem'
                        }}
                      >
                        <FileText size={16} />
                        <span>Consensys Diligence Audit</span>
                        <ExternalLink size={14} />
                      </a>
                      <a 
                        href="https://github.com/gkrastenov/audits/blob/9ec0d368833c67231b953ea9efc193a55de826b1/solo/P2PSwap-Security-Review.pdf" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        style={{ 
                          display: 'flex', 
                          alignItems: 'center', 
                          gap: '0.5rem',
                          color: '#00ff88',
                          textDecoration: 'none',
                          fontSize: '0.875rem'
                        }}
                      >
                        <FileText size={16} />
                        <span>KeySecurity Audit Report</span>
                        <ExternalLink size={14} />
                      </a>
                    </div>
                  </div>
                </div>

                <div className="info-box">
                  <Coins size={20} />
                  <div>
                    <h4>No Fees</h4>
                    <p>
                      P2PSwap charges zero platform fees. You only pay blockchain gas costs to network validators. 
                      This makes it ideal for large swaps where traditional exchange fees would be significant.
                    </p>
                  </div>
                </div>

                <div className="info-box">
                  <Clock size={20} />
                  <div>
                    <h4>Expiry & Cancellation</h4>
                    <p>
                      If a swap expires and the initiator included ETH, they can retrieve their ETH by removing the swap. 
                      The initiator can also cancel a swap at any time before it's completed.
                    </p>
                  </div>
                </div>

                <div className="info-box">
                  <CheckCircle size={20} />
                  <div>
                    <h4>Gas Optimized</h4>
                    <p>
                      The contract has been extensively optimized for gas efficiency using techniques like assembly hashing, 
                      transient storage (on supported chains), and minimal on-chain storage.
                    </p>
                  </div>
                </div>
              </div>
            </section>

            <section>
              <h3>Supported Networks</h3>
              <p>P2PSwap is currently deployed on:</p>
              <ul>
                <li><strong>Ethereum Mainnet</strong></li>
                <li><strong>Ethereum Sepolia</strong> (testnet)</li>
                <li><strong>Linea Mainnet</strong></li>
                <li><strong>Linea Sepolia</strong> (testnet)</li>
              </ul>
            </section>

            <section>
              <h3>Getting Started</h3>
              <p>
                Ready to start swapping? Connect your wallet and navigate to the <strong>Create</strong> tab to set up your first swap. 
                You can also browse <strong>Accept</strong> to see swaps available to you or open swaps anyone can accept.
              </p>
              <div className="warning-box">
                <AlertCircle size={20} />
                <div>
                  <h4>Always Verify</h4>
                  <p>
                    Before completing any swap, always verify:
                  </p>
                  <ul>
                    <li>Token contract addresses are correct</li>
                    <li>Token IDs match what you expect</li>
                    <li>Quantities are accurate</li>
                    <li>The swap hasn't expired</li>
                  </ul>
                  <p>
                    Once a swap is completed, it cannot be reversed. Blockchain transactions are permanent.
                  </p>
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}

