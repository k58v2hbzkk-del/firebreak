// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import { Test, Vm } from "forge-std/Test.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { ISystemContract } from "@reactive/src/interfaces/ISystemContract.sol";
import { IReactive } from "@reactive/src/interfaces/IReactive.sol";
import { IPayable } from "@reactive/src/interfaces/IPayable.sol";
import { AbstractCallback } from "@reactive/src/base/AbstractCallback.sol";
import { AbstractPayer } from "@reactive/src/base/AbstractPayer.sol";

import { RsETH, BridgedRsETH, TestUSD } from "../src/Tokens.sol";
import { Escrow, Minter } from "../src/Bridge.sol";
import { LendingPool } from "../src/LendingPool.sol";
import { Guarded } from "../src/Guarded.sol";
import { FirebreakGuard } from "../src/FirebreakGuard.sol";
import { FirebreakReactive } from "../src/FirebreakReactive.sol";

/// Stand-in for Reactive's system contract / callback proxy: records subscriptions and callbacks.
contract MockSystem {
    struct Cb { uint256 chainId; address recipient; bytes payload; address sender; }
    Cb[] public cbs;
    uint256 public subs;
    mapping(address => uint256) public debt;
    receive() external payable {}
    function subscribe(uint256, address, uint256, uint256, uint256, uint256) external { subs++; }
    function unsubscribe(uint256, address, uint256, uint256, uint256, uint256) external {}
    function requestCallbackV_1_0(ISystemContract.CallbackConfiguration_V_1_0 memory c) external {
        cbs.push(Cb(c.chainId, c.recipient, c.payload, msg.sender));
    }
    function count() external view returns (uint256) { return cbs.length; }
    function cb(uint256 i) external view returns (Cb memory) { return cbs[i]; }
}

contract FirebreakTest is Test {
    uint256 constant UNI = 1301;
    uint256 constant BASE = 84532;
    address constant SYS = 0x8888888888888888888888888888888888888888;

    MockSystem sys;
    address proxy = address(0xC0FFEE); // callback proxy on both chains in this test
    address relayer = address(0xB41D6E);
    address user = address(0xA11CE);
    address attacker = address(0xBAD);

    RsETH rs;
    BridgedRsETH rsb;
    TestUSD usd;
    Escrow escrow;
    Minter minter;
    LendingPool pool;
    FirebreakReactive rx;
    FirebreakGuard gHome;
    FirebreakGuard gBridged;

    function setUp() public {
        vm.etch(SYS, address(new MockSystem()).code);
        sys = MockSystem(payable(SYS));

        rs = new RsETH();
        escrow = new Escrow(IERC20(address(rs)), relayer);
        rsb = new BridgedRsETH();
        minter = new Minter(rsb, relayer);
        rsb.setMinter(address(minter));
        usd = new TestUSD(1_000_000 ether);
        pool = new LendingPool(IERC20(address(rsb)), IERC20(address(usd)));
        usd.transfer(address(pool), 1_000_000 ether);

        rx = new FirebreakReactive(UNI, address(escrow), BASE, address(minter));
        gHome = new FirebreakGuard(IPayable(payable(proxy)), address(rx));
        gBridged = new FirebreakGuard(IPayable(payable(proxy)), address(rx));
        rx.setGuards(address(gHome), address(gBridged));
        gHome.addTarget(address(escrow));
        gBridged.addTarget(address(minter));
        gBridged.addTarget(address(pool));
        escrow.setGuard(address(gHome));
        minter.setGuard(address(gBridged));
        pool.setGuard(address(gBridged));

        rs.mint(user, 100 ether);
        rs.mint(address(escrow), 0); // no-op, keeps escrow empty until a lock
    }

    // ---------------------------------------------------------------- helpers

    /// Feeds every log `src` emitted (as recorded) into the reactive contract, as Lasna would.
    function _relayLogs(Vm.Log[] memory logs, uint256 chainId, address src) internal {
        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].emitter != src) continue;
            bytes32[] memory t = logs[i].topics;
            IReactive.LogRecord memory r = IReactive.LogRecord({
                chainId: chainId,
                contractAddress: src,
                topic0: uint256(t[0]),
                topic1: t.length > 1 ? uint256(t[1]) : 0,
                topic2: t.length > 2 ? uint256(t[2]) : 0,
                topic3: t.length > 3 ? uint256(t[3]) : 0,
                data: logs[i].data,
                blockNumber: block.number,
                opCode: 2 + t.length,
                blockHash: 0,
                txHash: uint256(keccak256(abi.encode(i, block.number))),
                logIndex: i
            });
            vm.prank(SYS);
            rx.react(r);
        }
    }

    /// Delivers every pending callback the way the callback proxy does: first arg = sender.
    function _deliverCallbacks() internal {
        uint256 n = sys.count();
        for (uint256 i = 0; i < n; i++) {
            MockSystem.Cb memory c = sys.cb(i);
            bytes memory p = c.payload;
            // overwrite the placeholder (first word after the selector) with the reactive contract
            assembly { mstore(add(p, 36), mload(add(c, 96))) }
            vm.prank(proxy);
            (bool ok,) = c.recipient.call(p);
            assertTrue(ok, "callback failed");
        }
    }

    function _lockAndMint(uint256 amount) internal returns (uint256 lockId) {
        vm.recordLogs();
        vm.startPrank(user);
        rs.approve(address(escrow), amount);
        lockId = escrow.lock(amount, user);
        vm.stopPrank();
        _relayLogs(vm.getRecordedLogs(), UNI, address(escrow));

        vm.recordLogs();
        vm.prank(relayer);
        minter.mint(lockId, user, amount);
        _relayLogs(vm.getRecordedLogs(), BASE, address(minter));
    }

    // ---------------------------------------------------------------- tests

    function test_subscribesToBothHalvesOfTheBridge() public view {
        assertEq(sys.subs(), 4);
    }

    function test_honestRoundTripNeverTrips() public {
        _lockAndMint(10 ether);
        assertEq(rx.backing(), 10 ether);
        assertEq(rx.supply(), 10 ether);

        vm.recordLogs();
        vm.prank(user);
        uint256 burnId = minter.burn(4 ether, user);
        _relayLogs(vm.getRecordedLogs(), BASE, address(minter));

        vm.recordLogs();
        vm.prank(relayer);
        escrow.release(burnId, user, 4 ether);
        _relayLogs(vm.getRecordedLogs(), UNI, address(escrow));

        assertEq(rx.backing(), 6 ether);
        assertEq(rx.supply(), 6 ether);
        assertTrue(rx.armed());
        assertEq(sys.count(), 0);
    }

    function test_forgedMintHaltsBridgeAndLendingOnBothChains() public {
        _lockAndMint(10 ether);

        vm.recordLogs();
        vm.prank(attacker);
        minter.forgedMint(500 ether);
        _relayLogs(vm.getRecordedLogs(), BASE, address(minter));

        assertFalse(rx.armed());
        assertEq(rx.breaches(), 1);
        assertEq(sys.count(), 2, "one callback per chain");
        assertEq(sys.cb(0).chainId, BASE);
        assertEq(sys.cb(1).chainId, UNI);

        _deliverCallbacks();
        assertTrue(minter.halted());
        assertTrue(pool.halted());
        assertTrue(escrow.halted());

        // the attacker's cash-out paths are all closed
        vm.startPrank(attacker);
        rsb.approve(address(pool), type(uint256).max);
        vm.expectRevert(Guarded.IsHalted.selector);
        pool.deposit(500 ether);
        vm.expectRevert(Guarded.IsHalted.selector);
        minter.burn(500 ether, attacker);
        vm.stopPrank();
        vm.prank(relayer);
        vm.expectRevert(Guarded.IsHalted.selector);
        escrow.release(999, attacker, 5 ether);
    }

    function test_attackerCannotBorrowInsideTheSettleWindow() public {
        vm.startPrank(attacker);
        minter.forgedMint(100 ether);
        rsb.approve(address(pool), type(uint256).max);
        pool.deposit(100 ether);
        vm.expectRevert(abi.encodeWithSelector(LendingPool.Unsettled.selector, block.number + 2));
        pool.borrow(1 ether);
        vm.stopPrank();
    }

    function test_forgedReleaseTripsAndStopsTheDrain() public {
        _lockAndMint(40 ether); // vault holds 40

        vm.recordLogs();
        vm.prank(attacker);
        escrow.forgedRelease(5 ether); // first one gets out: nothing on-chain can tell
        _relayLogs(vm.getRecordedLogs(), UNI, address(escrow));
        _deliverCallbacks();

        assertEq(uint8(_lastReason()), uint8(FirebreakReactive.Reason.ForgedRelease));
        vm.roll(block.number + 1);
        vm.prank(attacker);
        vm.expectRevert(Guarded.IsHalted.selector);
        escrow.forgedRelease(5 ether); // copycats are stopped
        assertEq(rs.balanceOf(address(escrow)), 35 ether);
    }

    function test_replayedMintIdIsABreach() public {
        uint256 id = _lockAndMint(10 ether);
        vm.recordLogs();
        vm.prank(relayer);
        vm.expectRevert(abi.encodeWithSelector(Minter.AlreadyMinted.selector, id));
        minter.mint(id, user, 10 ether);
        // even if a buggy minter allowed it, the books catch a mint whose lock is a different amount
        vm.recordLogs();
        vm.prank(relayer);
        minter.mint(id + 1000, user, 10 ether);
        _relayLogs(vm.getRecordedLogs(), BASE, address(minter));
        assertFalse(rx.armed());
    }

    function test_oneIncidentOneRoundOfHalts() public {
        vm.recordLogs();
        vm.startPrank(attacker);
        minter.forgedMint(1 ether);
        minter.forgedMint(2 ether);
        vm.stopPrank();
        _relayLogs(vm.getRecordedLogs(), BASE, address(minter));
        assertEq(sys.count(), 2);
        assertEq(rx.breaches(), 1);
    }

    function test_rearmAfterGovernanceReview() public {
        vm.recordLogs();
        vm.prank(attacker);
        minter.forgedMint(1 ether);
        _relayLogs(vm.getRecordedLogs(), BASE, address(minter));
        assertFalse(rx.armed());
        rx.rearm(0, 0);
        assertTrue(rx.armed());

        vm.prank(attacker);
        vm.expectRevert(FirebreakReactive.NotOwner.selector);
        rx.rearm(0, 0);
    }

    function test_guardOnlyAcceptsOurReactiveThroughTheProxy() public {
        bytes memory good = abi.encodeWithSignature(
            "trip(address,uint8,uint256,uint256,uint256)", address(rx), uint8(1), BASE, uint256(1), uint256(1)
        );
        // not the proxy
        vm.expectRevert(abi.encodeWithSelector(AbstractPayer.NotAuthorized.selector, address(this), proxy));
        (bool ok,) = address(gBridged).call(good);
        ok; // the expectRevert above checks the revert

        // the proxy, but carrying another reactive contract
        bytes memory bad = abi.encodeWithSignature(
            "trip(address,uint8,uint256,uint256,uint256)", attacker, uint8(1), BASE, uint256(1), uint256(1)
        );
        vm.prank(proxy);
        vm.expectRevert(abi.encodeWithSelector(AbstractCallback.CallbackNotAuthorized.selector, attacker, address(rx)));
        gBridged.trip(attacker, 1, BASE, 1, 1);
        bad;

        vm.prank(proxy);
        gBridged.trip(address(rx), 1, BASE, 1, 1);
        assertTrue(pool.halted() && minter.halted());
        assertEq(gBridged.trips(), 1);
    }

    function test_onlyGuardCanHaltOnlyOwnerCanResume() public {
        vm.prank(attacker);
        vm.expectRevert(Guarded.NotGuard.selector);
        pool.firebreak();

        vm.prank(proxy);
        gBridged.trip(address(rx), 4, BASE, 0, 0);
        vm.prank(attacker);
        vm.expectRevert(Guarded.NotOwner.selector);
        pool.resume();
        pool.resume();
        assertFalse(pool.halted());
    }

    function test_honestBorrowWorksAfterSettling() public {
        _lockAndMint(10 ether);
        vm.startPrank(user);
        rsb.approve(address(pool), type(uint256).max);
        pool.deposit(10 ether);
        vm.roll(block.number + 2);
        pool.borrow(20_000 ether); // 10 * 3000 * 70 % = 21,000 limit
        vm.expectRevert(abi.encodeWithSelector(LendingPool.OverLimit.selector, 21_000 ether));
        pool.borrow(2_000 ether);
        vm.stopPrank();
        assertEq(usd.balanceOf(user), 20_000 ether);
    }

    function testFuzz_supplyNeverSilentlyExceedsBacking(uint96 locked, uint96 extra) public {
        vm.assume(locked > 0 && locked <= 100 ether && extra > 0 && extra < 1_000 ether);
        _lockAndMint(locked);
        assertTrue(rx.armed());
        vm.recordLogs();
        vm.prank(attacker);
        minter.forgedMint(extra);
        _relayLogs(vm.getRecordedLogs(), BASE, address(minter));
        assertFalse(rx.armed(), "any unbacked mint trips");
    }

    function test_governanceCleanupRestoresTheBooks() public {
        _lockAndMint(10 ether);
        vm.startPrank(attacker);
        minter.forgedMint(50 ether);
        rsb.approve(address(pool), type(uint256).max);
        pool.deposit(20 ether);
        vm.stopPrank();
        pool.seize(attacker);
        minter.confiscate(address(this), 20 ether);
        minter.confiscate(attacker, 30 ether);
        assertEq(rsb.totalSupply(), rs.balanceOf(address(escrow)), "supply back to backing");
        vm.prank(attacker);
        vm.expectRevert(Guarded.NotOwner.selector);
        minter.confiscate(user, 1);
    }

    function _lastReason() internal view returns (FirebreakReactive.Reason r) {
        // decode from the Guard's last Tripped via the callback payload
        MockSystem.Cb memory c = sys.cb(sys.count() - 1);
        bytes memory p = c.payload;
        uint8 reason;
        assembly { reason := mload(add(p, 68)) }
        r = FirebreakReactive.Reason(reason);
    }
}
