# Firebreak live demo

Run 2026-11-18T03:29:16.847Z · commit `8521810df056e4cceca9e7159892ac058b11061c`

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
| 527 | Base | Forged mint of 500 rsETH.b lands on Base | Attacker step | [0x96cf665d8a…](https://sepolia.basescan.org/tx/0x96cf665d8a1d199e0add9521a95b2a98b5e91124dd7b806f826a014414d0f772) |
| 1418 | Base | Attacker posts 250 as collateral | Blocked (reverted) | [0xa78246be29…](https://sepolia.basescan.org/tx/0xa78246be29d42672b046b12554698f065aff303d1ad554c84cf5a65fde3b634f) |
| 1418 | Base | Attacker burns 250 to exit through the bridge | Blocked (reverted) | [0xf0cdef8807…](https://sepolia.basescan.org/tx/0xf0cdef880736013081d42bfbc0ff11102261c34dfc1ec1e5e660d8c9af8be17e) |

## Attack 2 · forged vault releases on Unichain (Nomad-style)

Times are measured from the moment the attacker's first transaction was sent.

| ms | Chain | What happened | Result | Transaction |
|---:|---|---|---|---|
| 1991 | Unichain | Forged release #1: 5 rsETH | Went through | [0x22109c6b31…](https://sepolia.uniscan.xyz/tx/0x22109c6b318eaa6a1e3992d32499cb9e17002bc364413577293d55583d4fa32a) |
| 2154 | Lasna | Firebreak sees the books break and calls both chains | **Firebreak** | [0x30d7b63e79…](https://lasna.reactscan.net/tx/0x30d7b63e79b920263996de20602841a4f3c65cf5db3c7680788da3e0f3cb7d6f) |
| 2312 | Unichain | Forged release #2: 5 rsETH | Blocked (reverted) | [0xc3ce11b02f…](https://sepolia.uniscan.xyz/tx/0xc3ce11b02f43c5fd1ff99d95cd9f830a095b4339231f39950a33f39394df4b3e) |
| 2899 | Unichain | Forged release #3: 5 rsETH | Blocked (reverted) | [0xc235d8486c…](https://sepolia.uniscan.xyz/tx/0xc235d8486cf28ece99e8476bf94cf10cbf97db6f610dd7929652e8e5874893f6) |
| 3157 | Base | Base: bridge minter and lending pool halted | **Firebreak** | [0x7a2a2160c1…](https://sepolia.basescan.org/tx/0x7a2a2160c1510302b114e43fefd029af02efb62a0aa9a9d875ee55427c3667ce) |
| 3793 | Unichain | Unichain: bridge vault halted | **Firebreak** | [0xcd0ebbb601…](https://sepolia.uniscan.xyz/tx/0xcd0ebbb60116361f4d30a22e68eb262b74a0e54104605ace512636501ced94c5) |

Drained before the halt: **5 rsETH** of 40 attempted.

Reverted steps were sent on purpose with a fixed gas limit so the block is visible on-chain.
