// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title BraidStaking
/// @notice Native MON staking whose rewards come only from real protocol fees.
contract BraidStaking is ReentrancyGuard {
    uint256 private constant SCALE = 1e27;

    uint256 public totalStaked;
    uint256 public accRewardPerShare;
    uint256 public undistributedRewards;

    mapping(address => uint256) public balanceOf;
    mapping(address => uint256) public rewardDebt;
    mapping(address => uint256) public claimable;

    event Staked(address indexed account, uint256 amount);
    event Unstaked(address indexed account, uint256 amount);
    event RewardAdded(address indexed source, uint256 amount);
    event RewardClaimed(address indexed account, uint256 amount);

    error ZeroAmount();
    error InsufficientStake();
    error TransferFailed();

    function stake() external payable nonReentrant {
        if (msg.value == 0) revert ZeroAmount();
        _accrue(msg.sender);
        balanceOf[msg.sender] += msg.value;
        totalStaked += msg.value;

        if (undistributedRewards != 0) {
            accRewardPerShare += (undistributedRewards * SCALE) / totalStaked;
            undistributedRewards = 0;
        }
        rewardDebt[msg.sender] = (balanceOf[msg.sender] * accRewardPerShare) / SCALE;
        emit Staked(msg.sender, msg.value);
    }

    function unstake(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        if (amount > balanceOf[msg.sender]) revert InsufficientStake();
        _accrue(msg.sender);
        balanceOf[msg.sender] -= amount;
        totalStaked -= amount;
        rewardDebt[msg.sender] = (balanceOf[msg.sender] * accRewardPerShare) / SCALE;
        (bool ok,) = msg.sender.call{value: amount}("");
        if (!ok) revert TransferFailed();
        emit Unstaked(msg.sender, amount);
    }

    function notifyReward() external payable {
        if (msg.value == 0) revert ZeroAmount();
        if (totalStaked == 0) {
            undistributedRewards += msg.value;
        } else {
            accRewardPerShare += (msg.value * SCALE) / totalStaked;
        }
        emit RewardAdded(msg.sender, msg.value);
    }

    function claimRewards() external nonReentrant {
        _accrue(msg.sender);
        uint256 amount = claimable[msg.sender];
        if (amount == 0) revert ZeroAmount();
        claimable[msg.sender] = 0;
        (bool ok,) = msg.sender.call{value: amount}("");
        if (!ok) revert TransferFailed();
        emit RewardClaimed(msg.sender, amount);
    }

    function pendingRewards(address account) external view returns (uint256) {
        uint256 accumulated = (balanceOf[account] * accRewardPerShare) / SCALE;
        return claimable[account] + accumulated - rewardDebt[account];
    }

    function _accrue(address account) internal {
        uint256 accumulated = (balanceOf[account] * accRewardPerShare) / SCALE;
        if (accumulated > rewardDebt[account]) {
            claimable[account] += accumulated - rewardDebt[account];
        }
        rewardDebt[account] = accumulated;
    }
}
