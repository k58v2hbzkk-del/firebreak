// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

/// @title Guarded
/// @notice Something Firebreak can stop. Only this chain's FirebreakGuard may trip it; only the
///         owner (the protocol's governance) can bring it back. A machine can pull the brake,
///         but deciding it is safe again stays a human decision.
abstract contract Guarded {
    address public immutable owner;
    address public guard;
    bool public halted;

    event Halted(address indexed by);
    event Resumed(address indexed by);
    event GuardSet(address guard);

    error NotOwner();
    error NotGuard();
    error IsHalted();

    constructor() {
        owner = msg.sender;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier whenLive() {
        if (halted) revert IsHalted();
        _;
    }

    /// @notice One-time wiring to the guard (set after the guard is deployed).
    function setGuard(address guard_) external onlyOwner {
        guard = guard_;
        emit GuardSet(guard_);
    }

    /// @notice Called by FirebreakGuard when the reactive contract reports a breach.
    function firebreak() external {
        if (msg.sender != guard) revert NotGuard();
        if (!halted) {
            halted = true;
            emit Halted(msg.sender);
        }
    }

    /// @notice Governance brings the system back after investigating.
    function resume() external onlyOwner {
        halted = false;
        emit Resumed(msg.sender);
    }
}
