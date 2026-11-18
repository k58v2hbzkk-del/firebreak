# Firebreak live demo

Run 2026-11-18T03:35:33.727Z · commit `8521810df056e4cceca9e7159892ac058b11061c`

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
| 829 | Base | Forged mint of 100 rsETH.b lands on Base | Attacker step | [0x404d409c69…](https://sepolia.basescan.org/tx/0x404d409c69b5789ebc88dcb980542df24e76e483405c2e7d46c695f1b4c84257) |
| 1706 | Base | Attacker posts 50 as collateral | Attacker step | [0xefe139d9da…](https://sepolia.basescan.org/tx/0xefe139d9da6e234611dde45035c531966cfb2ba9d3bff3ff9166bbf8ae7fba65) |
| 1706 | Base | Attacker burns 50 to exit through the bridge | Attacker step | [0xcc7c0be8b8…](https://sepolia.basescan.org/tx/0xcc7c0be8b8043d4659983c8894dac133525368b396552315b345d2d4c3e8170a) |
| 2694 | Lasna | Firebreak sees the books break and calls both chains | **Firebreak** | [0x6a4d995358…](https://lasna.reactscan.net/tx/0x6a4d9953581e8d6c6cf9d607a59d31831d55b868b06d46f4fba696e4f2f03533) |
| 2781 | Base | Attacker tries to borrow 105,000 tUSD | Blocked (reverted) | [0xfdee4d0de8…](https://sepolia.basescan.org/tx/0xfdee4d0de8382b91311c554a59e53a404e6fe6f0f0401c5a29fbc0c0ce3c54ba) |
| 3558 | Base | Base: bridge minter and lending pool halted | **Firebreak** | [0x8a5a7de51b…](https://sepolia.basescan.org/tx/0x8a5a7de51bde10e08a4fe8c2d14cac9a788119f9ccbefe0bea667939ac6058c5) |
| 4699 | Unichain | Unichain: bridge vault halted | **Firebreak** | [0x1b7d44603e…](https://sepolia.uniscan.xyz/tx/0x1b7d44603e5942b3eae707306bb4c496ac3e56c3900c6769add72babf095dd15) |
| 8980 | Unichain | Bridge releases 50 real rsETH on Unichain | Reverted (other reason) | [0x5eb0bd3158…](https://sepolia.uniscan.xyz/tx/0x5eb0bd3158c57740317d465f38b863f223b4a1013f5f4ea5d4f4fc08dd725f37) |

## Attack 2 · forged vault releases on Unichain (Nomad-style)

Times are measured from the moment the attacker's first transaction was sent.

| ms | Chain | What happened | Result | Transaction |
|---:|---|---|---|---|
| 2291 | Unichain | Forged release #1: 5 rsETH | Went through | [0x40382b0580…](https://sepolia.uniscan.xyz/tx/0x40382b0580858e5ce79d2955d0f434eec8f7f77cc6a4b22a4874cae60c64fbd8) |
| 3103 | Lasna | Firebreak sees the books break and calls both chains | **Firebreak** | [0xe27da1663b…](https://lasna.reactscan.net/tx/0xe27da1663b2abb6a593b50e529a5d9dc47fa0b0bade7489b5afa0f2d384faf4b) |
| 3575 | Base | Base: bridge minter and lending pool halted | **Firebreak** | [0x3b55dbfc55…](https://sepolia.basescan.org/tx/0x3b55dbfc55027750c79670f305ec1aa5a6fc5752cff9b1bd2f44ee664d3f449b) |
| 4013 | Unichain | Forged release #2: 5 rsETH | Reverted (other reason) | [0x390151ad4e…](https://sepolia.uniscan.xyz/tx/0x390151ad4eea9c1e914ba51fa4473089048715a7615a57c4085bc37f80acacd7) |
| 4592 | Unichain | Unichain: bridge vault halted | **Firebreak** | [0x0ddbef40ac…](https://sepolia.uniscan.xyz/tx/0x0ddbef40acc879cbd9fb80a27786a856f426fdb9959cb64f113636f00828569b) |
| 7912 | Unichain | Forged release #3: 5 rsETH | Reverted (other reason) | [0xf2d2d94be5…](https://sepolia.uniscan.xyz/tx/0xf2d2d94be584c6201360ac39de0eee256a6329b3f99aa3c27c37c3af62dba0a8) |

Drained before the halt: **5 rsETH** of 40 attempted.

Reverted steps were sent on purpose with a fixed gas limit so the block is visible on-chain.
