// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract MyToken is ERC721, Ownable {
  uint256 private _nextTokenId;

  constructor(address initialOwner) ERC721("MyToken", "MTK") Ownable(initialOwner) {}

  function safeMint(address to) public {
    uint256 tokenId = _nextTokenId++;
    _safeMint(to, tokenId);
  }

  function safeTransfer(address from, address to, uint256 tokenId) external {
    _safeTransfer(from, to, tokenId, "");
  }
}
