# Firebreak

**A cross-chain circuit breaker for bridge exploits, run by Reactive Network.**

When a bridge is exploited, the damage spreads across chains faster than any team can sign a pause. Forged tokens are minted on one chain, posted as collateral on another, and bridged out before a multisig wakes up. Firebreak keeps one set of books for both sides of a bridge on Reactive Network. The moment those books stop adding up, it halts the bridge and the lending market on every chain in a single reactive transaction. There is no bot, no keeper and no server to switch off.

Built for the **Reactive Omni Buildathon**, track **Every Second Counts**.

- Live demo: https://firebreak-63zx.onrender.com
- Recorded on-chain runs: [`deployments/DEMO.md`](deployments/DEMO.md)
- Response times over 6 attacks in a row: [`deployments/BENCH.md`](deployments/BENCH.md)

## How fast

The same forged-mint attack, run 6 times in a row on testnet, timed from the forged mint confirming on Base:

| | Fastest | Median | Slowest |
|---|---:|---:|---:|
| Base halted | 1.00 s | 1.38 s | 2.41 s |
| Unichain halted | 2.48 s | 2.75 s | 3.81 s |

The attacker's exit through the bridge was blocked in every run. By the chain's own block timestamps, Base was halted a median of 1 s after the forged mint's block. Every run, with links to each transaction, is in [`deployments/BENCH.md`](deployments/BENCH.md).

## The problem

In April 2026 a forged cross-chain message let an attacker mint about 116,500 rsETH on a bridge and spread it into lending markets across chains, about $290M in losses. In 2022, Nomad's vault was drained by hundreds of copycat transactions over hours. In both cases, every chain did exactly what it was told. **No single chain can check a bridge's promise, because each chain only sees half of it.**

## How Firebreak works

```
 Unichain Sepolia                 Reactive Lasna                    Base Sepolia
 ┌───────────────┐   Locked    ┌──────────────────────┐   Minted   ┌──────────────┐
 │ Escrow (vault)│ ──────────▶ │  FirebreakReactive   │ ◀───────── │ Minter       │
 │               │   Released  │  one ledger for both │   Burned   │ LendingPool  │
 └──────▲────────┘ ──────────▶ │  chains              │ ◀───────── └──────▲───────┘
        │                      └──────────┬───────────┘                   │
        │      trip() callback            │ breach        trip() callback │
 ┌──────┴────────┐ ◀──────────────────────┴──────────────────▶ ┌──────────┴───┐
 │FirebreakGuard │                                             │FirebreakGuard│
 └───────────────┘                                             └──────────────┘
```

1. **One ledger for both halves.** `FirebreakReactive` subscribes to the vault on Unichain (`Locked`, `Released`) and the minter on Base (`Minted`, `Burned`).
2. **Every event is checked.** A mint must match a lock with the same id and amount. A release must match a burn. Supply may never exceed backing.
3. **On a breach, every chain halts at once.** One reactive transaction requests a callback to the `FirebreakGuard` on each chain, which halts the minter, the lending pool and the vault.
4. **Humans decide when it is safe again.** Only governance can resume. Repaying loans and withdrawing debt-free collateral keep working while halted.

### Why it needs Reactive Omni

The lending pool makes new bridged collateral settle for 2 blocks (about 4 s on Base) before it can back a loan. That window is only safe because Omni's ~1 s blocks and instant finality let Firebreak decide inside it. Remove Reactive and nothing can see both chains at once. Slow it down to 7 s blocks and every honest borrower would have to wait several times longer.

## Live demo: play the attacker

The site runs two real exploits against the testnet deployment and times Firebreak's answer on every chain:

- **Forge a mint (Kelp-style).** The attacker mints 100 rsETH.b on Base with nothing locked, then races to post it as collateral, borrow, and burn it to pull real rsETH off Unichain.
- **Drain the vault (Nomad-style).** The attacker sends forged releases from the Unichain vault again and again.

Every attacker step is a real transaction. Blocked steps are sent with a fixed gas limit so the revert is visible in the explorer. After each run, governance cleanup claws back forged tokens, re-arms Firebreak and resumes the system.

## Contracts

| Contract | Chain | Role |
|---|---|---|
| `FirebreakReactive` | Reactive Lasna | The ledger and the brake. Subscribes, checks, requests callbacks |
| `FirebreakGuard` | Base Sepolia, Unichain Sepolia | Accepts callbacks only from the Reactive callback proxy carrying our reactive contract, halts every registered target |
| `Escrow` | Unichain Sepolia | The bridge vault (lock / release) |
| `Minter` | Base Sepolia | Mints and burns the bridged token |
| `LendingPool` | Base Sepolia | Borrow tUSD against bridged collateral, with a 2-block settle window |
| `Guarded` | both | Base for anything Firebreak can halt: only the guard can halt, only the owner can resume |

`forgedMint` and `forgedRelease` exist only to let anyone play the attacker. They model a forged or stolen validator message, which a real bridge cannot tell apart from a real one on its own chain.

Addresses and transactions: [`deployments/firebreak.json`](deployments/firebreak.json) and [`deployments/DEMO.md`](deployments/DEMO.md).

## Run it yourself

```sh
cd contracts
git clone --depth 1 https://github.com/Reactive-Network/reactive-lib-omni lib/reactive-lib
git clone --depth 1 https://github.com/foundry-rs/forge-std lib/forge-std
git clone --depth 1 --branch v5.1.0 https://github.com/OpenZeppelin/openzeppelin-contracts lib/openzeppelin-contracts
forge test          # 13 tests incl. a fuzz test: any unbacked mint trips
forge build
cd .. && npm install
DEPLOYER_KEY=0x... node scripts/run.mjs fund+deploy+demo
```

`test/local-reactive.mjs` stands in for Reactive Network on three local anvil chains, so the full loop (deploy, attack, halt, reset) can be tested end to end without testnet funds.

The GitHub Action runs the tests, funds the wallets (Sepolia ETH bridged to Base and Unichain, lREACT from Reactive's faucet), deploys, runs both attacks and commits the results whenever `deploy.txt` changes.

### Web app

```sh
npm run build && DEPLOYER_KEY=0x... npm start   # http://localhost:3000
```

The server reads all three chains, runs at most one attack at a time with a cooldown and a daily cap, and streams every step to the page.

## Limits (honest)

- Firebreak cannot stop the first forged transaction: nothing on that chain can tell it is forged. It stops what comes next: the borrowing, the bridging out and the copycats.
- In the Nomad-style run, releases that land before the halt get through. The recorded runs show how many.
- The demo bridge relayer waits 5 seconds before acting on an event (real bridges wait minutes, for finality). Firebreak needs about 2 seconds, so it books the honest half first and halts the vault before a forged burn can be released.
- Testnet only, not audited.

## Credits

`reactive-lib-omni` (Reactive Network), OpenZeppelin Contracts v5.1.0, forge-std, viem. All Firebreak code was written during the buildathon.

## License

MIT
