// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import { IERC721Swapper } from "./IERC721Swapper.sol";
import { Utils } from "./Utils.sol";

/**
 * @title A simple NFT swapper contract with no fee takers.
 * @author The Dark Jester
 * @notice You can use this contract for ERC721 swaps where one party can set up a deal and the other accept.
 * @notice Any party can sweeten the deal with ETH, but that must be set up by the initiator.
 */
contract ERC721Swapper is IERC721Swapper {
  using Utils for *;

  address private constant ZERO_ADDRESS = address(0);

  // user account => balance
  mapping(address userAddress => uint256 balance) public balances;

  // Deployer pays for the slot vs. the first swapper. Being kind.
  uint256 public swapId = 1;

  mapping(uint256 id => bytes32 hashedSwap) public swapHashes;

  /// @dev This exists purely to drop the deployment cost by a few hundred gas.
  constructor() payable {}

  /**
   * @notice Initiates a swap of two NFTs.
   * @dev If ETH is sent, it is used as the initiator ETH portion.
   * @dev NB: Some invariant conditions:
   * @dev msg.sender is validated to be the initiator, and,
   * This is deliberate so that nobody and do it without you knowing.
   * @dev msg.value must match the _swap.initiatorETHPortion to avoid sneaky exploits.
   * @param _swap The full swap details.
   */
  function initiateSwap(Swap memory _swap) external payable {
    if (_swap.initiatorNftContract == ZERO_ADDRESS) {
      revert ZeroAddressDisallowed();
    }
    if (_swap.acceptorNftContract == ZERO_ADDRESS) {
      revert ZeroAddressDisallowed();
    }

    if (_swap.acceptor == ZERO_ADDRESS) {
      revert ZeroAddressDisallowed();
    }

    if (msg.sender != _swap.initiator) {
      revert InitiatorNotMatched(_swap.initiator, msg.sender);
    }

    if (msg.value != _swap.initiatorETHPortion) {
      revert InitiatorEthPortionNotMatched(_swap.initiatorETHPortion, msg.value);
    }

    if (msg.value > 0 && _swap.acceptorETHPortion > 0) {
      revert TwoWayEthPortionsDisallowed();
    }

    unchecked {
      uint256 newSwapId = swapId++;
      swapHashes[newSwapId] = Utils.hashSwap(_swap);

      // _swap emitted to pass in later when querying, completing or removing
      emit SwapInitiated(newSwapId, msg.sender, _swap.acceptor, _swap);
    }
  }

  /**
   * @notice Completes the swap.
   * @dev If ETH is sent, it is used as the acceptor ETH portion.
   * @dev msg.sender is the acceptor.
   * @dev The ETH portion is added to either the acceptor or the initiator balance.
   * @param _swapId The ID of the swap.
   * @param _swap The swap data to use and verify.
   */
  function completeSwap(uint256 _swapId, Swap memory _swap) external payable {
    if (swapHashes[_swapId] != Utils.hashSwap(_swap)) {
      revert SwapCompleteOrDoesNotExist();
    }

    if (_swap.acceptor != msg.sender) {
      revert NotAcceptor();
    }

    if (_swap.initiatorETHPortion > 0 && msg.value > 0) {
      revert TwoWayEthPortionsDisallowed();
    }

    if (_swap.acceptorETHPortion != msg.value) {
      revert IncorrectOrMissingAcceptorETH(_swap.acceptorETHPortion);
    }

    /// @dev Doing this prevents reentry.
    delete swapHashes[_swapId];

    if (msg.value > 0) {
      unchecked {
        /// @dev msg.value should never overflow - nobody has that amount of ETH.
        balances[_swap.initiator] += msg.value;
      }
    }

    if (_swap.initiatorETHPortion > 0) {
      unchecked {
        /// @dev This should never overflow - portion is either zero or a number way less that max uint256.
        balances[_swap.acceptor] += _swap.initiatorETHPortion;
      }
    }

    emit SwapComplete(_swapId, _swap.initiator, _swap.acceptor, _swap);

    IERC721(_swap.initiatorNftContract).safeTransferFrom(_swap.initiator, _swap.acceptor, _swap.initiatorTokenId);
    IERC721(_swap.acceptorNftContract).safeTransferFrom(_swap.acceptor, _swap.initiator, _swap.acceptorTokenId);
  }

  /**
   * @notice Cancels/Removes the swap if not accepted.
   * @dev msg.sender is the initiator.
   * @dev The Initiator ETH portion is added to the initiator balance if exists.
   * @param _swapId The ID of the swap.
   */
  function removeSwap(uint256 _swapId, Swap memory _swap) external {
    if (swapHashes[_swapId] != Utils.hashSwap(_swap)) {
      revert SwapCompleteOrDoesNotExist();
    }

    if (_swap.initiator != msg.sender) {
      revert NotInitiator();
    }

    delete swapHashes[_swapId];

    if (_swap.initiatorETHPortion > 0) {
      unchecked {
        // msg.value should never overflow - nobody has that amount of ETH
        balances[msg.sender] += _swap.initiatorETHPortion;
      }
    }

    emit SwapRemoved(_swapId, msg.sender);
  }

  /**
   * @notice Withdraws the msg.sender's balance if it exists.
   * @dev The ETH balance is sent to the msg.sender.
   */
  function withdraw() external {
    uint256 callerBalance = balances[msg.sender];

    if (callerBalance == 0) {
      revert EmptyWithdrawDisallowed();
    }

    delete balances[msg.sender];

    emit BalanceWithDrawn(msg.sender, callerBalance);

    bytes4 errorSelector = IERC721Swapper.ETHSendingFailed.selector;
    assembly {
      let success := call(gas(), caller(), callerBalance, 0, 0, 0, 0)
      if iszero(success) {
        let ptr := mload(0x40)
        mstore(ptr, errorSelector)
        revert(ptr, 0x4)
      }
    }
  }

  /**
   * @notice Retrieves the Swap status.
   * @param _swapId The ID of the swap.
   * @param _swap The swap details.
   * @return swapStatus The checked ownership and permissions struct for both parties's NFTs.
   */
  function getSwapStatus(uint256 _swapId, Swap memory _swap) external view returns (SwapStatus memory swapStatus) {
    if (swapHashes[_swapId] != Utils.hashSwap(_swap)) {
      revert SwapCompleteOrDoesNotExist();
    }

    IERC721 initiatorNftContract = IERC721(_swap.initiatorNftContract);

    swapStatus.initiatorOwnsToken = initiatorNftContract.ownerOf(_swap.initiatorTokenId) == _swap.initiator;
    swapStatus.initiatorApprovalsSet = initiatorNftContract.getApproved(_swap.initiatorTokenId) == address(this);

    IERC721 acceptorNftContract = IERC721(_swap.acceptorNftContract);
    swapStatus.acceptorOwnsToken = acceptorNftContract.ownerOf(_swap.acceptorTokenId) == _swap.acceptor;
    swapStatus.acceptorApprovalsSet = acceptorNftContract.getApproved(_swap.acceptorTokenId) == address(this);
  }
}
/*   
                                                              
T H E D A R K J E S T E R . E T H


                                        %%##%%%&                                
                           ,@@@@(     %#%%%%%%%%%&                              
                          ,&&&&@@@& %##%%%&%    ,#&                             
                          &&&&%&&&&%%#%#%%&       #                             
                         *&   %&& @% .% @&%       .,                            
                         /     & %  @#% @%&%                                    
                                  /....@/#&&                                    
                                  .../*@..%&.                                   
                                 ,    **&@&&                                    
                           *&#%%&%&&@@&&&&%&@@&@                                
                       %#####&&&&&&&&&/(&&&&&&&&&&&%%                            
                     %#######&&&&&&&#//((%&&&&&&&&&@@&&(                         
 @@# *&*   @&       &%######%&&&&&&////((((&&&&&&&&@@&&&&                        
 . .%&&&&%%@&*     &%########&&&&//////(((((#&&&&&&@@&@%@#                       
     &&&@@&@@@@@&&@&#&&%#####&&&////(((())(((&&&&&@@@@@@&                       
    &*&&&@&%@@@@@@@@@&&%#%###&#((((((()))))))))%&&&&&&@%%%                       
     &%&&&&@@@@@@@&@&&#*  ##&&#\(((#(((())))))%%&&@@&&&%%@                      
    % %*&%.%.  .*@&@#  * .#%&&&&//(# T D J ((&&&&@@@ &&&&&&&*                   
       / %*              , #%&&&&&/////((((/&&&&&&@  @&&&&&&%%%##/#/  .*&&*      
         .,                 #&&&&&&%///(((/&&&&&&&(    /&%%%&%%%%&%&%%%%@@@@@@@@,
                             @%#%%%##\%%&/&&@&@@*         &%%&%%%&%%%&%@@@@ #%@@
                            &#&&@&&&&&\&/@@@@@@@@@             *%&&%&&%&&@@   #@ 
                           ##&@&&%%%%%&&&@&@&@@&&@               %%&&%#.%  @    
                          ,#%&@&&&%#%%&&&&&&@@&&@@/             *% *%%( &       
                          .#%@@@&@%%%%&&&&&&&&&&@@.                 *%          
                          %#&@@&&@%%%%&&&&&&&&&&&&&.                 (          
                          ##&@&&&&%%%&&&&&%%&&%%&&&%                            
                          #%&@&&&&&%%&%&&&%%%%%%%%&%&                           
                         *#&&@&&&&@#@@%%&&%%%%%%%%%&%&                          
                         %&&@@&&&&&@@@@%%%%%%%%%%%%%%%&                         
                         &&&@@&&&&&@@#   %%%%%%%%%%%%%%.                        
                         &&&@@&&&&&&#     *%%%%%%%%%%%%%                        
                         .%&@@&&&&&@        %%%%%%%%%%%%%                       
                          &&@@&@@&&/         ,%%%%%%%%%%%&,                     
                           &@@@@@@&@           %%%%%%%%%%%%%                    
                           @@@@@@@@@#           (%%%%%%&%%%%%%                  
                           (&&@@@@@@@             %%%%%%&%%%%%#                 
                            @&&@@@@@&@             /%%%%%&%%%%%(                
                             &&&@@@@@@               %%%%%&&%%%%                
                             *&&&@@@@@@               %%%%%%&&%%&               
                              (&&&@@@@&@.               &%%%%%&%%%&             
                               #&&@@@@@@@                 &%%&%&%&&             
                                  @@@@@@@&@                  &&&&%%&%           
                                  &@@&&&&@ .                %&%&&%@%&&%         
                                 *&@@&&@@&&                 %%%.@&(&&@          
                             &&@&&&&@@@@@@(                 %(%#&&%(%,          
                               (#%#,                         ,,&&@&&&,  
                                                              
T H E D A R K J E S T E R . E T H
                
*/
