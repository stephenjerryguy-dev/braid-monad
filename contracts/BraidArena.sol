// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {IEntropyConsumer} from "@pythnetwork/entropy-sdk-solidity/IEntropyConsumer.sol";
import {IEntropyV2} from "@pythnetwork/entropy-sdk-solidity/IEntropyV2.sol";

/// @title BraidArena
/// @notice No-value testnet game and raffle using Pyth Entropy V2 callbacks.
contract BraidArena is ERC721, Ownable, ReentrancyGuard, IEntropyConsumer {
    using Strings for uint256;

    enum RequestKind { None, RiskRoll, RaffleDraw }
    struct GameRequest { address player; bool guessedHigh; }

    IEntropyV2 public immutable entropy;
    uint256 public roundId = 1;
    uint256 public badgeId;
    uint64 public roundClosesAt;
    mapping(address => uint256) public points;
    mapping(uint256 => address[]) private entrants;
    mapping(uint256 => mapping(address => bool)) public enteredFree;
    mapping(uint256 => address) public winner;
    mapping(uint64 => RequestKind) public requestKind;
    mapping(uint64 => GameRequest) public gameRequests;
    mapping(uint64 => uint256) public drawRequests;

    event RiskRequested(uint64 indexed sequence, address indexed player, bool guessedHigh);
    event RiskSettled(uint64 indexed sequence, address indexed player, uint8 roll, bool won, uint256 pointsAwarded);
    event RaffleEntered(uint256 indexed roundId, address indexed player, uint8 entries);
    event DrawRequested(uint64 indexed sequence, uint256 indexed roundId);
    event WinnerDrawn(uint256 indexed roundId, address indexed winner, uint256 badgeId);

    error InvalidAction();
    error InsufficientFee();
    error NotEnoughPoints();

    constructor(address entropyAddress, address safeOwner)
        ERC721("Braid Proof Badge", "BRAID")
        Ownable(safeOwner)
    {
        if (entropyAddress == address(0) || safeOwner == address(0)) revert InvalidAction();
        entropy = IEntropyV2(entropyAddress);
        roundClosesAt = uint64(block.timestamp + 1 days);
    }

    function entropyFee() external view returns (uint256) {
        return entropy.getFeeV2();
    }

    function riskRoll(bool guessedHigh) external payable nonReentrant returns (uint64 sequence) {
        uint256 fee = entropy.getFeeV2();
        if (msg.value < fee) revert InsufficientFee();
        sequence = entropy.requestV2{value: fee}();
        requestKind[sequence] = RequestKind.RiskRoll;
        gameRequests[sequence] = GameRequest(msg.sender, guessedHigh);
        if (msg.value > fee) _refund(msg.sender, msg.value - fee);
        emit RiskRequested(sequence, msg.sender, guessedHigh);
    }

    function enterRaffle(uint8 extraEntries) external {
        uint8 count = extraEntries;
        if (!enteredFree[roundId][msg.sender]) {
            enteredFree[roundId][msg.sender] = true;
            count += 1;
        }
        if (count == 0 || extraEntries > 4) revert InvalidAction();
        uint256 cost = uint256(extraEntries) * 25;
        if (points[msg.sender] < cost) revert NotEnoughPoints();
        points[msg.sender] -= cost;
        for (uint256 i; i < count; ++i) entrants[roundId].push(msg.sender);
        emit RaffleEntered(roundId, msg.sender, count);
    }

    function draw() external payable nonReentrant returns (uint64 sequence) {
        if (block.timestamp < roundClosesAt || entrants[roundId].length < 2) revert InvalidAction();
        uint256 fee = entropy.getFeeV2();
        if (msg.value < fee) revert InsufficientFee();
        uint256 drawingRound = roundId;
        sequence = entropy.requestV2{value: fee}();
        requestKind[sequence] = RequestKind.RaffleDraw;
        drawRequests[sequence] = drawingRound;
        roundId = drawingRound + 1;
        roundClosesAt = uint64(block.timestamp + 1 days);
        if (msg.value > fee) _refund(msg.sender, msg.value - fee);
        emit DrawRequested(sequence, drawingRound);
    }

    function entrantCount(uint256 round) external view returns (uint256) {
        return entrants[round].length;
    }

    function getEntropy() internal view override returns (address) {
        return address(entropy);
    }

    function entropyCallback(uint64 sequence, address, bytes32 randomNumber) internal override {
        RequestKind kind = requestKind[sequence];
        requestKind[sequence] = RequestKind.None;
        if (kind == RequestKind.RiskRoll) {
            GameRequest memory request = gameRequests[sequence];
            delete gameRequests[sequence];
            uint8 roll = uint8(uint256(randomNumber) % 100) + 1;
            bool won = request.guessedHigh ? roll >= 60 : roll <= 40;
            uint256 award = won ? 25 : 5;
            points[request.player] += award;
            emit RiskSettled(sequence, request.player, roll, won, award);
            return;
        }
        if (kind == RequestKind.RaffleDraw) {
            uint256 drawingRound = drawRequests[sequence];
            delete drawRequests[sequence];
            address[] storage pool = entrants[drawingRound];
            if (pool.length == 0) return;
            address selected = pool[uint256(randomNumber) % pool.length];
            winner[drawingRound] = selected;
            uint256 tokenId = ++badgeId;
            _safeMint(selected, tokenId);
            emit WinnerDrawn(drawingRound, selected, tokenId);
        }
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        string memory svg = string.concat(
            '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800"><rect width="800" height="800" fill="#11110f"/>',
            '<path d="M80 610C250 160 520 670 720 190" fill="none" stroke="#b8ff6a" stroke-width="44"/>',
            '<path d="M80 190C280 680 530 130 720 610" fill="none" stroke="#7567ff" stroke-width="44"/>',
            '<text x="70" y="100" fill="#f7f3e8" font-family="monospace" font-size="34">BRAID / PROOF BADGE</text>',
            '<text x="70" y="750" fill="#f7f3e8" font-family="monospace" font-size="28">#', tokenId.toString(), '</text></svg>'
        );
        string memory json = string.concat(
            '{"name":"Braid Proof Badge #', tokenId.toString(),
            '","description":"A no-value testnet badge drawn with Pyth Entropy on Monad.","image":"data:image/svg+xml;base64,',
            Base64.encode(bytes(svg)), '"}'
        );
        return string.concat("data:application/json;base64,", Base64.encode(bytes(json)));
    }

    function _refund(address to, uint256 amount) internal {
        (bool ok,) = to.call{value: amount}("");
        if (!ok) revert InvalidAction();
    }
}
