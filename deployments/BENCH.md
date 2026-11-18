# Firebreak response times

The forged-mint attack, repeated 6 times on testnet (2026-11-18T10:31:50.236Z).
Each time is measured from the moment the forged mint was confirmed on Base.

| | Fastest | Median | Slowest | Average |
|---|---:|---:|---:|---:|
| Firebreak sees the breach (Lasna) | 1.07 s | 1.12 s | 2.14 s | 1.32 s |
| Base halted | 1.00 s | 1.38 s | 2.41 s | 1.47 s |
| Unichain halted | 2.48 s | 2.75 s | 3.81 s | 2.91 s |

On Base, the halt landed a median of **7 block(s)** after the forged mint (Base Sepolia makes a block every 2 s).

## Every run

| Run | Forged mint | Breach seen | Base halted | Unichain halted | Blocks on Base | Attacker steps blocked | Halt on Base |
|---:|---|---:|---:|---:|---:|---:|---|
| 1 | [0xd014fe3b…](https://sepolia.basescan.org/tx/0xd014fe3b3c6c1a7da5048bdc12e7e4d4ee13cdce412e506178bc95b74fa64318) | 1.07 s | 1.35 s | 2.96 s | 4 | 2 | [0xa32d37d8…](https://sepolia.basescan.org/tx/0xa32d37d8d4dfea8de21b1fa4b630aac73e52c778b42c54ae8a02e0d6a80eb1ae) |
| 2 | [0xce063108…](https://sepolia.basescan.org/tx/0xce063108141308f34e4993557055aefc6a1dbdce4668f63339bec52eee0ff9d3) | 2.14 s | 2.41 s | 3.81 s | 9 | 1 | [0x2e299f61…](https://sepolia.basescan.org/tx/0x2e299f61b1881b9257ebe8c941bf04c7fb41695d891d9eeac774d2a1c93ceb9b) |
| 3 | [0x5a724642…](https://sepolia.basescan.org/tx/0x5a72464215891d7d76eb648899ae9e183321dd344ac91cc8e686d2d9d535fa35) | 1.38 s | 1.65 s | 2.75 s | 7 | 1 | [0xcf8621d1…](https://sepolia.basescan.org/tx/0xcf8621d1905cf8e1bfe41757e0efd634afb4b36745d03a1d1a7104e6531ee08f) |
| 4 | [0xf92eefc8…](https://sepolia.basescan.org/tx/0xf92eefc824044fbe13203f9684805d5ca476bbacd1a703f60e916769605f5f74) | 1.11 s | 1.38 s | 2.75 s | 7 | 1 | [0xa7a75974…](https://sepolia.basescan.org/tx/0xa7a75974d06d8f632db36c23cd07ccc67c7a714b755a9d3f021dfa0b5f630724) |
| 5 | [0x3289480d…](https://sepolia.basescan.org/tx/0x3289480d27a907c39e843af831f8e265cacce617ca15f199751b117d582ddecf) | 1.08 s | 1.00 s | 2.71 s | 5 | 2 | [0xfaae5c7c…](https://sepolia.basescan.org/tx/0xfaae5c7ca030e6575260fdbfcc171f6e595258285d66c173919132ad1cf14508) |
| 6 | [0x452586c6…](https://sepolia.basescan.org/tx/0x452586c6210e73a38ba43d8350a02cdbe49bad92c71b089bd9faae239606ca79) | 1.12 s | 1.03 s | 2.48 s | 5 | 2 | [0xc767936d…](https://sepolia.basescan.org/tx/0xc767936d2735222968bb77896df8afe6a4dc896528a5da48e43340be9c881df4) |

Wall-clock times come from a script polling public RPCs, so they include a little polling delay. Block counts come straight from the chain.
