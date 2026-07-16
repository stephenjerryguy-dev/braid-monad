// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IBraidRewardSink {
    function notifyReward() external payable;
}

/// @title BraidMarket
/// @notice Oracleless, funded peer-to-peer loans against ERC-721 or ERC-20 collateral.
contract BraidMarket is ReentrancyGuard, IERC721Receiver {
    using SafeERC20 for IERC20;

    enum CollateralKind { ERC721, ERC20 }
    enum Status { Open, Active, Repaid, Defaulted, Cancelled }

    struct Offer {
        address lender;
        address borrower;
        address collateralToken;
        uint256 collateralIdOrAmount;
        uint256 principal;
        uint256 repayment;
        uint64 duration;
        uint64 expiry;
        uint64 dueAt;
        uint256 agentId;
        CollateralKind kind;
        Status status;
    }

    uint256 public constant INTEREST_FEE_BPS = 1000; // 10% of interest, not principal.
    uint256 public nextOfferId = 1;
    IBraidRewardSink public immutable rewardSink;
    mapping(uint256 => Offer) public offers;

    event OfferCreated(uint256 indexed offerId, address indexed lender, CollateralKind kind, address collateralToken, uint256 principal, uint256 agentId);
    event OfferCancelled(uint256 indexed offerId);
    event LoanStarted(uint256 indexed offerId, address indexed borrower, uint64 dueAt);
    event LoanRepaid(uint256 indexed offerId, uint256 repayment, uint256 stakingReward);
    event CollateralClaimed(uint256 indexed offerId, address indexed lender);

    error InvalidTerms();
    error InvalidStatus();
    error NotLender();
    error NotBorrower();
    error NotDue();
    error TransferFailed();

    constructor(address rewardSink_) {
        if (rewardSink_ == address(0)) revert InvalidTerms();
        rewardSink = IBraidRewardSink(rewardSink_);
    }

    function createOffer(
        CollateralKind kind,
        address collateralToken,
        uint256 collateralIdOrAmount,
        uint256 repayment,
        uint64 duration,
        uint64 expiry,
        uint256 agentId
    ) external payable returns (uint256 offerId) {
        if (
            msg.value == 0 || collateralToken == address(0) || repayment < msg.value ||
            duration == 0 || expiry <= block.timestamp ||
            (kind == CollateralKind.ERC20 && collateralIdOrAmount == 0)
        ) revert InvalidTerms();

        offerId = nextOfferId++;
        offers[offerId] = Offer({
            lender: msg.sender,
            borrower: address(0),
            collateralToken: collateralToken,
            collateralIdOrAmount: collateralIdOrAmount,
            principal: msg.value,
            repayment: repayment,
            duration: duration,
            expiry: expiry,
            dueAt: 0,
            agentId: agentId,
            kind: kind,
            status: Status.Open
        });
        emit OfferCreated(offerId, msg.sender, kind, collateralToken, msg.value, agentId);
    }

    function cancelOffer(uint256 offerId) external nonReentrant {
        Offer storage offer = offers[offerId];
        if (offer.status != Status.Open) revert InvalidStatus();
        if (offer.lender != msg.sender) revert NotLender();
        offer.status = Status.Cancelled;
        _sendValue(offer.lender, offer.principal);
        emit OfferCancelled(offerId);
    }

    function acceptOffer(uint256 offerId) external nonReentrant {
        Offer storage offer = offers[offerId];
        if (offer.status != Status.Open || block.timestamp > offer.expiry) revert InvalidStatus();
        offer.status = Status.Active;
        offer.borrower = msg.sender;
        offer.dueAt = uint64(block.timestamp) + offer.duration;
        _takeCollateral(offer, msg.sender);
        _sendValue(msg.sender, offer.principal);
        emit LoanStarted(offerId, msg.sender, offer.dueAt);
    }

    function repay(uint256 offerId) external payable nonReentrant {
        Offer storage offer = offers[offerId];
        if (offer.status != Status.Active || block.timestamp > offer.dueAt) revert InvalidStatus();
        if (offer.borrower != msg.sender) revert NotBorrower();
        if (msg.value != offer.repayment) revert InvalidTerms();
        offer.status = Status.Repaid;

        uint256 interest = offer.repayment - offer.principal;
        uint256 stakingReward = (interest * INTEREST_FEE_BPS) / 10_000;
        if (stakingReward != 0) rewardSink.notifyReward{value: stakingReward}();
        _sendValue(offer.lender, offer.repayment - stakingReward);
        _returnCollateral(offer, offer.borrower);
        emit LoanRepaid(offerId, offer.repayment, stakingReward);
    }

    function claimDefault(uint256 offerId) external nonReentrant {
        Offer storage offer = offers[offerId];
        if (offer.status != Status.Active) revert InvalidStatus();
        if (offer.lender != msg.sender) revert NotLender();
        if (block.timestamp <= offer.dueAt) revert NotDue();
        offer.status = Status.Defaulted;
        _returnCollateral(offer, offer.lender);
        emit CollateralClaimed(offerId, offer.lender);
    }

    function _takeCollateral(Offer storage offer, address from) internal {
        if (offer.kind == CollateralKind.ERC721) {
            IERC721(offer.collateralToken).safeTransferFrom(from, address(this), offer.collateralIdOrAmount);
        } else {
            IERC20(offer.collateralToken).safeTransferFrom(from, address(this), offer.collateralIdOrAmount);
        }
    }

    function _returnCollateral(Offer storage offer, address to) internal {
        if (offer.kind == CollateralKind.ERC721) {
            IERC721(offer.collateralToken).safeTransferFrom(address(this), to, offer.collateralIdOrAmount);
        } else {
            IERC20(offer.collateralToken).safeTransfer(to, offer.collateralIdOrAmount);
        }
    }

    function _sendValue(address to, uint256 amount) internal {
        (bool ok,) = to.call{value: amount}("");
        if (!ok) revert TransferFailed();
    }

    function onERC721Received(address, address, uint256, bytes calldata) external pure returns (bytes4) {
        return IERC721Receiver.onERC721Received.selector;
    }
}
