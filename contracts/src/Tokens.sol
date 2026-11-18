// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Canonical test asset on Unichain Sepolia (stands in for a restaked ETH token).
contract RsETH is ERC20 {
    address public immutable minter;

    constructor() ERC20("Restaked ETH (test)", "rsETH") {
        minter = msg.sender;
    }

    function mint(address to, uint256 amount) external {
        require(msg.sender == minter, "minter");
        _mint(to, amount);
    }
}

/// @notice The bridged copy on Base Sepolia. Only the bridge's Minter can mint or burn.
contract BridgedRsETH is ERC20 {
    address public minter;
    address private immutable deployer;

    constructor() ERC20("Bridged rsETH (test)", "rsETH.b") {
        deployer = msg.sender;
    }

    function setMinter(address minter_) external {
        require(msg.sender == deployer && minter == address(0), "once");
        minter = minter_;
    }

    function mint(address to, uint256 amount) external {
        require(msg.sender == minter, "minter");
        _mint(to, amount);
    }

    function burnFrom(address from, uint256 amount) external {
        require(msg.sender == minter, "minter");
        _burn(from, amount);
    }
}

/// @notice Test dollar the lending pool lends out.
contract TestUSD is ERC20 {
    constructor(uint256 supply) ERC20("Test USD", "tUSD") {
        _mint(msg.sender, supply);
    }
}
