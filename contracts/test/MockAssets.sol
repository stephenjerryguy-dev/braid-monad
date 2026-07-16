// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";

contract MockERC20 is ERC20 {
    constructor() ERC20("Meme Thread", "MEME") {}
    function mint(address to, uint256 amount) external { _mint(to, amount); }
}

contract MockERC721 is ERC721 {
    uint256 public nextId;
    constructor() ERC721("Monad Relic", "RELIC") {}
    function mint(address to) external returns (uint256 id) {
        id = ++nextId;
        _safeMint(to, id);
    }
}

interface IEntropyCallbackTarget {
    function _entropyCallback(uint64 sequence, address provider, bytes32 randomNumber) external;
}

contract MockEntropy {
    uint128 public fee = 0.01 ether;
    uint64 public nextSequence = 1;
    function getFeeV2() external view returns (uint128) { return fee; }
    function requestV2() external payable returns (uint64 sequence) {
        require(msg.value >= fee, "fee");
        sequence = nextSequence++;
    }
    function fulfill(address consumer, uint64 sequence, bytes32 randomNumber) external {
        IEntropyCallbackTarget(consumer)._entropyCallback(sequence, address(this), randomNumber);
    }
}
