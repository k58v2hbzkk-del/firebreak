// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import { IPayable } from "@reactive/src/interfaces/IPayable.sol";
import { AbstractCallback } from "@reactive/src/base/AbstractCallback.sol";

interface IGuarded {
    function firebreak() external;
}

/// @title FirebreakGuard (one per protected chain)
/// @notice Receives the reactive contract's callback and halts every registered target on this
///         chain in the same transaction. It accepts calls only from Reactive Network's callback
///         proxy, carrying the address of our FirebreakReactive.
contract FirebreakGuard is AbstractCallback {
    uint256 public constant MAX_TARGETS = 8;

    address public immutable owner;
    address[] public targets;

    /// @notice Last trip, for the dashboard.
    uint256 public trips;
    uint256 public lastTripBlock;
    uint256 public lastOriginTx;

    event Tripped(uint8 indexed reason, uint256 indexed originChainId, uint256 originTx, uint256 detail, uint256 halted);
    event HaltFailed(address indexed target);
    event TargetAdded(address indexed target);

    error NotOwner();
    error TooMany();

    constructor(IPayable callbackProxy_, address reactive_) payable AbstractCallback(callbackProxy_, reactive_) {
        owner = msg.sender;
    }

    function addTarget(address target) external {
        if (msg.sender != owner) revert NotOwner();
        if (targets.length >= MAX_TARGETS) revert TooMany();
        targets.push(target);
        emit TargetAdded(target);
    }

    /// @notice Reactive callback. `rvm` is filled in by Reactive Network with the sender contract.
    /// @dev Never reverts on a bad target: a failed callback is still billed and would leave
    ///      every other target running.
    function trip(address rvm, uint8 reason, uint256 originChainId, uint256 originTx, uint256 detail)
        external
        onlyServiceProvider
        onlyCallbackSender(rvm)
    {
        uint256 n = targets.length;
        uint256 halted;
        for (uint256 i = 0; i < n; i++) {
            try IGuarded(targets[i]).firebreak() {
                halted++;
            } catch {
                emit HaltFailed(targets[i]);
            }
        }
        trips++;
        lastTripBlock = block.number;
        lastOriginTx = originTx;
        emit Tripped(reason, originChainId, originTx, detail, halted);
    }

    function targetCount() external view returns (uint256) {
        return targets.length;
    }

    /// @notice Settle callback debt from this contract's balance.
    function coverDebt() external {
        _coverDebt();
    }
}
