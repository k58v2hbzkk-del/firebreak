// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { Guarded } from "./Guarded.sol";
import { BridgedRsETH } from "./Tokens.sol";

/// @title Escrow (Unichain Sepolia)
/// @notice The bridge's vault. Locking rsETH here lets the bridge mint rsETH.b on Base; burning
///         rsETH.b on Base lets the bridge's relayer release rsETH from here.
/// @dev `forgedRelease` exists only for the live demo: it plays a release signed by a stolen or
///      forged validator key (Nomad, Ronin, Kelp). The contract treats it like any other release,
///      exactly as a real bridge would, because the forgery is indistinguishable on this chain.
contract Escrow is Guarded {
    using SafeERC20 for IERC20;

    IERC20 public immutable asset;
    address public immutable relayer;
    uint256 public nextLockId = 1;
    mapping(uint256 => bool) public releasedId;

    event Locked(uint256 indexed id, address indexed from, address to, uint256 amount);
    event Released(uint256 indexed id, address indexed to, uint256 amount);

    error AlreadyReleased(uint256 id);
    error NotRelayer();
    error Zero();

    constructor(IERC20 asset_, address relayer_) {
        asset = asset_;
        relayer = relayer_;
    }

    /// @notice Lock rsETH to receive rsETH.b on Base at `to`.
    function lock(uint256 amount, address to) external whenLive returns (uint256 id) {
        if (amount == 0) revert Zero();
        asset.safeTransferFrom(msg.sender, address(this), amount);
        id = nextLockId++;
        emit Locked(id, msg.sender, to, amount);
    }

    /// @notice The bridge relayer releases rsETH for a burn it saw on Base.
    function release(uint256 burnId, address to, uint256 amount) external whenLive {
        if (msg.sender != relayer) revert NotRelayer();
        _release(burnId, to, amount);
    }

    /// @notice DEMO ONLY: a release backed by a forged validator message. Anyone can play the attacker.
    function forgedRelease(uint256 amount) external whenLive {
        if (amount == 0 || amount > 50 ether) revert Zero();
        _release(uint256(keccak256(abi.encode(msg.sender, block.number, gasleft()))), msg.sender, amount);
    }

    function _release(uint256 id, address to, uint256 amount) internal {
        if (releasedId[id]) revert AlreadyReleased(id);
        releasedId[id] = true;
        asset.safeTransfer(to, amount);
        emit Released(id, to, amount);
    }

    /// @notice Governance tops the vault back up after a demo drain (not a bridge action).
    function sweepBack(address from, uint256 amount) external onlyOwner {
        asset.safeTransferFrom(from, address(this), amount);
    }
}

/// @title Minter (Base Sepolia)
/// @notice Mints rsETH.b for locks the relayer saw on Unichain, and burns it on the way back.
/// @dev `forgedMint` exists only for the live demo: it plays a mint signed with a forged message,
///      like the 2026 rsETH bridge exploit. Nothing on Base can tell it apart from a real one.
contract Minter is Guarded {
    BridgedRsETH public immutable token;
    address public immutable relayer;
    uint256 public nextBurnId = 1;
    mapping(uint256 => bool) public mintedId;

    event Minted(uint256 indexed id, address indexed to, uint256 amount);
    event Burned(uint256 indexed id, address indexed from, address to, uint256 amount);
    event Confiscated(address indexed from, uint256 amount);

    error AlreadyMinted(uint256 id);
    error NotRelayer();
    error Zero();

    constructor(BridgedRsETH token_, address relayer_) {
        token = token_;
        relayer = relayer_;
    }

    /// @notice The bridge relayer mints for lock `lockId` on Unichain.
    function mint(uint256 lockId, address to, uint256 amount) external whenLive {
        if (msg.sender != relayer) revert NotRelayer();
        _mint(lockId, to, amount);
    }

    /// @notice DEMO ONLY: a mint backed by a forged message. Anyone can play the attacker.
    function forgedMint(uint256 amount) external whenLive {
        if (amount == 0 || amount > 1000 ether) revert Zero();
        _mint(uint256(keccak256(abi.encode("forged", msg.sender, block.number, gasleft()))), msg.sender, amount);
    }

    function _mint(uint256 id, address to, uint256 amount) internal {
        if (mintedId[id]) revert AlreadyMinted(id);
        mintedId[id] = true;
        token.mint(to, amount);
        emit Minted(id, to, amount);
    }

    /// @notice Governance claws back tokens that were minted without backing (post-incident cleanup).
    function confiscate(address from, uint256 amount) external onlyOwner {
        token.burnFrom(from, amount);
        emit Confiscated(from, amount);
    }

    /// @notice Burn rsETH.b to get rsETH back on Unichain at `to`.
    function burn(uint256 amount, address to) external whenLive returns (uint256 id) {
        if (amount == 0) revert Zero();
        token.burnFrom(msg.sender, amount);
        id = nextBurnId++;
        emit Burned(id, msg.sender, to, amount);
    }
}
