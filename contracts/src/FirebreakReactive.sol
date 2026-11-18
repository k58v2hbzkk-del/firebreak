// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import { ISystemContract } from "@reactive/src/interfaces/ISystemContract.sol";
import { AbstractReactive } from "@reactive/src/base/AbstractReactive.sol";

/// @title FirebreakReactive (Reactive Lasna)
/// @notice Keeps the bridge's books across both chains and pulls the brake the moment they
///         stop adding up.
///
///         The bridge's promise is simple: every rsETH.b on Base is backed by rsETH locked on
///         Unichain, and every rsETH that leaves the vault was burned on Base first. No single
///         chain can check that promise, because each chain sees only half of it. This
///         contract sees both halves:
///
///           Locked   (Unichain) +backing, remembers the lock
///           Minted   (Base)     must match a lock of the same id and amount
///           Burned   (Base)     -supply, remembers the burn
///           Released (Unichain) must match a burn of the same id and amount
///
///         A mint with no lock behind it, a release with no burn behind it, or supply above
///         backing is a breach. On a breach it asks every chain's FirebreakGuard to halt the
///         bridge and the lending pool, in one reactive transaction.
contract FirebreakReactive is AbstractReactive {
    // keccak256("Locked(uint256,address,address,uint256)")
    uint256 public constant LOCKED_TOPIC = uint256(keccak256("Locked(uint256,address,address,uint256)"));
    uint256 public constant RELEASED_TOPIC = uint256(keccak256("Released(uint256,address,uint256)"));
    uint256 public constant MINTED_TOPIC = uint256(keccak256("Minted(uint256,address,uint256)"));
    uint256 public constant BURNED_TOPIC = uint256(keccak256("Burned(uint256,address,address,uint256)"));

    uint64 public constant CALLBACK_GAS = 600_000;

    enum Reason { None, UnbackedMint, ForgedRelease, SupplyOverBacking, Manual }

    address public immutable owner;
    uint256 public immutable homeChain; // Unichain Sepolia: escrow
    uint256 public immutable bridgedChain; // Base Sepolia: minter
    address public immutable escrow;
    address public immutable minter;

    address public guardHome;
    address public guardBridged;

    /// @notice Running books, in token wei.
    uint256 public backing; // locked - released
    uint256 public supply; // minted - burned
    mapping(uint256 => uint256) public lockOf; // lock id => amount
    mapping(uint256 => uint256) public burnOf; // burn id => amount
    mapping(uint256 => bool) public mintSeen;
    mapping(uint256 => bool) public releaseSeen;

    bool public armed = true;
    uint256 public breaches;
    uint256 public eventsSeen;

    event Books(uint256 backing, uint256 supply);
    event Breach(Reason indexed reason, uint256 indexed originChainId, uint256 originTx, uint256 amount);
    event Rearmed(uint256 backing, uint256 supply);
    event GuardsSet(address home, address bridged);

    error NotOwner();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor(uint256 homeChain_, address escrow_, uint256 bridgedChain_, address minter_) payable {
        owner = msg.sender;
        homeChain = homeChain_;
        escrow = escrow_;
        bridgedChain = bridgedChain_;
        minter = minter_;
    }

    /// @notice Wire the guards and start watching. Guards are deployed after this contract,
    ///         because each guard pins this contract's address as its only allowed caller.
    function setGuards(address home_, address bridged_) external onlyOwner {
        guardHome = home_;
        guardBridged = bridged_;
        emit GuardsSet(home_, bridged_);
        SYSTEM.subscribe(homeChain, escrow, LOCKED_TOPIC, REACTIVE_IGNORE, REACTIVE_IGNORE, REACTIVE_IGNORE);
        SYSTEM.subscribe(homeChain, escrow, RELEASED_TOPIC, REACTIVE_IGNORE, REACTIVE_IGNORE, REACTIVE_IGNORE);
        SYSTEM.subscribe(bridgedChain, minter, MINTED_TOPIC, REACTIVE_IGNORE, REACTIVE_IGNORE, REACTIVE_IGNORE);
        SYSTEM.subscribe(bridgedChain, minter, BURNED_TOPIC, REACTIVE_IGNORE, REACTIVE_IGNORE, REACTIVE_IGNORE);
    }

    /// @notice After governance has dealt with an incident: restart from audited books.
    function rearm(uint256 backing_, uint256 supply_) external onlyOwner {
        backing = backing_;
        supply = supply_;
        armed = true;
        emit Rearmed(backing_, supply_);
    }

    /// @notice Manual brake for the owner (also proves the callback path without an attack).
    function panic() external onlyOwner {
        _breach(Reason.Manual, block.chainid, 0, 0);
    }

    function coverDebt() external {
        _coverDebt();
    }

    // ---------------------------------------------------------------- react

    /// @dev Never reverts on an unexpected log: a reverting react() is still billed.
    function react(LogRecord calldata log_) external onlySystem {
        eventsSeen++;
        uint256 id = log_.topic1;

        if (log_.chainId == homeChain && log_.contractAddress == escrow) {
            if (log_.topic0 == LOCKED_TOPIC) {
                // data: (address to, uint256 amount)
                (, uint256 amount) = abi.decode(log_.data, (address, uint256));
                lockOf[id] = amount;
                backing += amount;
            } else if (log_.topic0 == RELEASED_TOPIC) {
                uint256 amount = abi.decode(log_.data, (uint256));
                bool forged = releaseSeen[id] || burnOf[id] != amount || amount == 0;
                releaseSeen[id] = true;
                backing = backing > amount ? backing - amount : 0;
                if (forged) return _breach(Reason.ForgedRelease, log_.chainId, log_.txHash, amount);
            } else {
                return;
            }
        } else if (log_.chainId == bridgedChain && log_.contractAddress == minter) {
            if (log_.topic0 == MINTED_TOPIC) {
                uint256 amount = abi.decode(log_.data, (uint256));
                bool forged = mintSeen[id] || lockOf[id] != amount || amount == 0;
                mintSeen[id] = true;
                supply += amount;
                if (forged) return _breach(Reason.UnbackedMint, log_.chainId, log_.txHash, amount);
            } else if (log_.topic0 == BURNED_TOPIC) {
                // data: (address to, uint256 amount)
                (, uint256 amount) = abi.decode(log_.data, (address, uint256));
                burnOf[id] = amount;
                supply = supply > amount ? supply - amount : 0;
            } else {
                return;
            }
        } else {
            return;
        }

        emit Books(backing, supply);
        if (supply > backing) _breach(Reason.SupplyOverBacking, log_.chainId, log_.txHash, supply - backing);
    }

    function _breach(Reason reason, uint256 originChainId, uint256 originTx, uint256 amount) internal {
        emit Books(backing, supply);
        if (!armed) return; // one incident, one round of halts
        armed = false;
        breaches++;
        emit Breach(reason, originChainId, originTx, amount);

        // First argument is overwritten by Reactive Network with this contract's address.
        bytes memory payload = abi.encodeWithSignature(
            "trip(address,uint8,uint256,uint256,uint256)", address(0), uint8(reason), originChainId, originTx, amount
        );
        // Halt where the attacker cashes out first: the chain the bad event did NOT happen on
        // is the next hop, but both are sent in the same reactive transaction.
        _callback(bridgedChain, guardBridged, payload);
        _callback(homeChain, guardHome, payload);
    }

    function _callback(uint256 chainId, address recipient, bytes memory payload) internal {
        if (recipient == address(0)) return;
        SYSTEM.requestCallbackV_1_0(
            ISystemContract.CallbackConfiguration_V_1_0({
                chainId: chainId, recipient: recipient, gasLimit: CALLBACK_GAS, payload: payload
            })
        );
    }
}
