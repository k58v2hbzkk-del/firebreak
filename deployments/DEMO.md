# Firebreak live demo

Run 2026-11-18T03:37:43.967Z · commit `8521810df056e4cceca9e7159892ac058b11061c`

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
| 596 | Base | Forged mint of 100 rsETH.b lands on Base | Attacker step | [0xe714658167…](https://sepolia.basescan.org/tx/0xe714658167da14933e2851780736b34435f922cbee8a12cf3f5fd507e0acb746) |
| 1493 | Base | Attacker posts 50 as collateral | Attacker step | [0xd77471cb7b…](https://sepolia.basescan.org/tx/0xd77471cb7b4b776bdde638ca1f6fa758bc3a81ed213d16b656671cb573834135) |
| 1493 | Base | Attacker burns 50 to exit through the bridge | Attacker step | [0x7139c733a8…](https://sepolia.basescan.org/tx/0x7139c733a87c8253e562865951c3f590c147a5f9c37ff1e6843ea821255c1302) |
| 2234 | Lasna | Firebreak sees the books break and calls both chains | **Firebreak** | [0xdff7ca4114…](https://lasna.reactscan.net/tx/0xdff7ca4114ea7672b991c25fcad07cd3bc67c0a23d5997bf6a6b82fe13d3d2f8) |
| 2351 | Base | Base: bridge minter and lending pool halted | **Firebreak** | [0x149586bec3…](https://sepolia.basescan.org/tx/0x149586bec3aeda3fb0b4831b54bd395e820efc3ed7a267687ada9bb8d6fb4674) |
| 2352 | Base | Attacker tries to borrow 105,000 tUSD | Blocked (reverted) | [0xcc47bff339…](https://sepolia.basescan.org/tx/0xcc47bff33937aac721767081a7fcf40f11c6b394809e91ed14fc2a6499e482ed) |
| 3858 | Unichain | Unichain: bridge vault halted | **Firebreak** | [0x5d21548466…](https://sepolia.uniscan.xyz/tx/0x5d2154846676a874a18adf4abb20b0e4c58b30b87e2bfa87cac6d3bf22984d34) |
| 9528 | Unichain | Bridge releases 50 real rsETH on Unichain | Blocked (reverted) | [0xfc1ec067ad…](https://sepolia.uniscan.xyz/tx/0xfc1ec067ada2700403650fcfa51d5daca0c38e89eeb40c9414fb1ffddeaa2b16) |

## Attack 2 · forged vault releases on Unichain (Nomad-style)

Times are measured from the moment the attacker's first transaction was sent.

| ms | Chain | What happened | Result | Transaction |
|---:|---|---|---|---|
| 1421 | Unichain | Forged release #1: 5 rsETH | Went through | [0xc0f49887a8…](https://sepolia.uniscan.xyz/tx/0xc0f49887a83937c88faa9571f6be1e6af8a871fb198dc659486a2c27bd8258a2) |
| 2081 | Lasna | Firebreak sees the books break and calls both chains | **Firebreak** | [0x948af0606f…](https://lasna.reactscan.net/tx/0x948af0606f39903b11ed90b15fcd88104992cc7152a24324ba19dc32f2733a8e) |
| 2436 | Base | Base: bridge minter and lending pool halted | **Firebreak** | [0x151372f3ae…](https://sepolia.basescan.org/tx/0x151372f3ae99cd4f552a3bc1aaa323ff016f45e0c9394fce928ae76bc9209b7b) |
| 3659 | Unichain | Unichain: bridge vault halted | **Firebreak** | [0x197277725f…](https://sepolia.uniscan.xyz/tx/0x197277725f032e74a5b5fd1025d06a8ceb636cab6e070db3652b8bd9371f1a40) |
| 4696 | Unichain | Forged release #2: 5 rsETH | Blocked (reverted) | [0xd9d67d33d9…](https://sepolia.uniscan.xyz/tx/0xd9d67d33d9cec5ffc10e656ca82a94f1c0f55cd3e8af63209832b7fe3b24f963) |
| 7782 | Unichain | Forged release #3: 5 rsETH | Blocked (reverted) | [0x976d26099f…](https://sepolia.uniscan.xyz/tx/0x976d26099ff3dc9b1345b08b34a43f98c2ddf0b9248a05586c8b70bd6f493656) |

Drained before the halt: **5 rsETH** of 40 attempted.

Reverted steps were sent on purpose with a fixed gas limit so the block is visible on-chain.
