// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { Guarded } from "./Guarded.sol";

/// @title LendingPool (Base Sepolia)
/// @notice Borrow tUSD against bridged rsETH.b. This is where stolen bridge tokens turn into
///         real money, so it is the market Firebreak protects.
/// @dev New collateral settles for SETTLE_BLOCKS before it can back a loan. With Reactive Omni's
///      ~1 s blocks, Firebreak decides well inside that window, so the delay can be seconds
///      instead of the minutes a human or a slow network would need.
contract LendingPool is Guarded {
    using SafeERC20 for IERC20;

    IERC20 public immutable collateral; // rsETH.b
    IERC20 public immutable debtAsset; // tUSD
    uint256 public constant PRICE = 3000; // tUSD per rsETH.b (fixed test oracle)
    uint256 public constant LTV_BPS = 7000; // 70 %
    uint256 public constant SETTLE_BLOCKS = 2; // ~4 s on Base

    struct Account {
        uint256 collateral;
        uint256 debt;
        uint256 settledAt; // block from which the latest deposit counts
    }

    mapping(address => Account) public accounts;

    event Deposited(address indexed user, uint256 amount, uint256 settledAt);
    event Borrowed(address indexed user, uint256 amount);
    event Repaid(address indexed user, uint256 amount);
    event Withdrawn(address indexed user, uint256 amount);

    error Unsettled(uint256 settledAt);
    error OverLimit(uint256 limit);
    error HasDebt();

    constructor(IERC20 collateral_, IERC20 debtAsset_) {
        collateral = collateral_;
        debtAsset = debtAsset_;
    }

    function deposit(uint256 amount) external whenLive {
        collateral.safeTransferFrom(msg.sender, address(this), amount);
        Account storage a = accounts[msg.sender];
        a.collateral += amount;
        a.settledAt = block.number + SETTLE_BLOCKS;
        emit Deposited(msg.sender, amount, a.settledAt);
    }

    function borrow(uint256 amount) external whenLive {
        Account storage a = accounts[msg.sender];
        if (block.number < a.settledAt) revert Unsettled(a.settledAt);
        uint256 limit = (a.collateral * PRICE * LTV_BPS) / 10_000;
        if (a.debt + amount > limit) revert OverLimit(limit);
        a.debt += amount;
        debtAsset.safeTransfer(msg.sender, amount);
        emit Borrowed(msg.sender, amount);
    }

    /// @notice Repaying is always allowed, even while halted.
    function repay(uint256 amount) external {
        Account storage a = accounts[msg.sender];
        if (amount > a.debt) amount = a.debt;
        debtAsset.safeTransferFrom(msg.sender, address(this), amount);
        a.debt -= amount;
        emit Repaid(msg.sender, amount);
    }

    /// @notice Debt-free users can always leave, even while halted.
    function withdraw(uint256 amount) external {
        Account storage a = accounts[msg.sender];
        if (a.debt != 0) revert HasDebt();
        a.collateral -= amount;
        collateral.safeTransfer(msg.sender, amount);
        emit Withdrawn(msg.sender, amount);
    }

    /// @notice Governance seizes collateral posted from an exploit (post-incident cleanup).
    function seize(address user) external onlyOwner returns (uint256 amount) {
        amount = accounts[user].collateral;
        accounts[user].collateral = 0;
        collateral.safeTransfer(owner, amount);
    }

    function borrowLimit(address user) external view returns (uint256) {
        return (accounts[user].collateral * PRICE * LTV_BPS) / 10_000;
    }
}
