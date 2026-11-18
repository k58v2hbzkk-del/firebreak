# Firebreak live demo

Run 2026-11-18T03:31:33.714Z · commit `8521810df056e4cceca9e7159892ac058b11061c`

| Contract | Chain | Address |
|---|---|---|
| FirebreakReactive | Reactive Lasna | [0x4cfca7aedab62c0f13a5a2a83716d6bb43bb69ff](https://lasna.reactscan.net/address/0x4cfca7aedab62c0f13a5a2a83716d6bb43bb69ff) |
| FirebreakGuard | Base Sepolia | [0xce787168b0eadf976a2b56ba5f761c0b9fba34a3](https://sepolia.basescan.org/address/0xce787168b0eadf976a2b56ba5f761c0b9fba34a3) |
| FirebreakGuard | Unichain Sepolia | [0xc23f166b20f1c209cfc97721584533f75be74062](https://sepolia.uniscan.xyz/address/0xc23f166b20f1c209cfc97721584533f75be74062) |
| Minter (bridge) | Base Sepolia | [0x012ad07ae2656b6cc628c01848e6eec1a30dd090](https://sepolia.basescan.org/address/0x012ad07ae2656b6cc628c01848e6eec1a30dd090) |
| LendingPool | Base Sepolia | [0xea7f1baae748457977e38946c8ea0e08362d5b72](https://sepolia.basescan.org/address/0xea7f1baae748457977e38946c8ea0e08362d5b72) |
| rsETH.b | Base Sepolia | [0x09f76b0332c9d5641421e5a0b01dc8e590af2be6](https://sepolia.basescan.org/address/0x09f76b0332c9d5641421e5a0b01dc8e590af2be6) |
| Escrow (bridge vault) | Unichain Sepolia | [0xb655dd9f9c562afe50f13ab41f2975c6945ee5e7](https://sepolia.uniscan.xyz/address/0xb655dd9f9c562afe50f13ab41f2975c6945ee5e7) |
| rsETH | Unichain Sepolia | [0xf1e35894139725822f30073b924da4d23b680782](https://sepolia.uniscan.xyz/address/0xf1e35894139725822f30073b924da4d23b680782) |

## Attack 1 · forged mint on Base (Kelp-style)

Times are measured from the moment the attacker's first transaction was sent.

| ms | Chain | What happened | Result | Transaction |
|---:|---|---|---|---|
| 750 | Base | Forged mint of 500 rsETH.b lands on Base | Attacker step | [0x7b6a0e4a80…](https://sepolia.basescan.org/tx/0x7b6a0e4a801d1c64fba6b52d0083a9eea10e354a676359cd530417929cce81ad) |
| 1733 | Base | Attacker posts 250 as collateral | Attacker step | [0xe28b8f7255…](https://sepolia.basescan.org/tx/0xe28b8f725578c840cec46a2c38873c06b25caddfdfa11e959906dd11ced18947) |
| 1733 | Base | Attacker burns 250 to exit through the bridge | Attacker step | [0xb218a83fd3…](https://sepolia.basescan.org/tx/0xb218a83fd359dd166b6bc846fdedb12419cd871f9b4e016ab543efa1e262221d) |
| 2217 | Lasna | Firebreak sees the books break and calls both chains | **Firebreak** | [0xbfcc5e282a…](https://lasna.reactscan.net/tx/0xbfcc5e282ae5a0d1543fc8277e7c59c04e6b4d6859c9974b41c6256cbe417354) |
| 2643 | Base | Base: bridge minter and lending pool halted | **Firebreak** | [0x70c39cd289…](https://sepolia.basescan.org/tx/0x70c39cd289f5b874660ecbd44f53c4928cab3c92f6e4661b1e508f7f9dce3eae) |
| 2744 | Base | Attacker tries to borrow 525,000 tUSD | Blocked (reverted) | [0x79688f6205…](https://sepolia.basescan.org/tx/0x79688f62057eb53fd643f720fb66785b451f2d323a7d9310f0117f70ac17c514) |
| 3581 | Unichain | Bridge releases 250 real rsETH on Unichain | Reverted (other reason) | [0x6e68f4a637…](https://sepolia.uniscan.xyz/tx/0x6e68f4a637be12c5ea1fb0209c7b2f861c7b61986dd3b8da25232e28b98ec9d2) |
| 4105 | Unichain | Unichain: bridge vault halted | **Firebreak** | [0x44ada3136c…](https://sepolia.uniscan.xyz/tx/0x44ada3136c4e58b37837400ce9a907274679c2a256de875c7d0d3d81574c4544) |

## Attack 2 · forged vault releases on Unichain (Nomad-style)

Times are measured from the moment the attacker's first transaction was sent.

| ms | Chain | What happened | Result | Transaction |
|---:|---|---|---|---|
| 2261 | Unichain | Forged release #1: 5 rsETH | Went through | [0x4bd3f3298a…](https://sepolia.uniscan.xyz/tx/0x4bd3f3298a3a78fb7e7a495ce0462b8e81d30d3abb449e864c1c4caa56c36cce) |
| 2827 | Unichain | Forged release #2: 5 rsETH | Reverted (other reason) | [0x0104d68fb2…](https://sepolia.uniscan.xyz/tx/0x0104d68fb2a92c8bcfb4ea0d6dc6e45a75e91e871484d6f1a01be401c0c12dc5) |
| 3080 | Lasna | Firebreak sees the books break and calls both chains | **Firebreak** | [0x1ccfd6b974…](https://lasna.reactscan.net/tx/0x1ccfd6b974b02bcaee82ae7bb02c2aa2a86890efce185953fc5e378c586ef282) |
| 3391 | Unichain | Forged release #3: 5 rsETH | Reverted (other reason) | [0x8e8ab44f01…](https://sepolia.uniscan.xyz/tx/0x8e8ab44f01439d27673ea1907fc33f69e5124d5c00550459dab93829b106b4ea) |
| 3510 | Base | Base: bridge minter and lending pool halted | **Firebreak** | [0x675d87e21d…](https://sepolia.basescan.org/tx/0x675d87e21d22d365c4aafef3e73349ea588179cff6984b72886f2cec05a3adac) |
| 4206 | Unichain | Unichain: bridge vault halted | **Firebreak** | [0xee948e8000…](https://sepolia.uniscan.xyz/tx/0xee948e80006fce62036a19afe8175b17d41d715b5e7378003a31e04792b1f7ec) |

Drained before the halt: **5 rsETH** of 40 attempted.

Reverted steps were sent on purpose with a fixed gas limit so the block is visible on-chain.
