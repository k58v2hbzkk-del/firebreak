# Firebreak response times

The forged-mint attack, repeated 6 times on testnet (2026-11-18T10:25:48.017Z).
Each time is measured from the moment the forged mint was confirmed on Base.

| | Fastest | Median | Slowest | Average |
|---|---:|---:|---:|---:|
| Firebreak sees the breach (Lasna) | 0.87 s | 1.82 s | 1.85 s | 1.54 s |
| Base halted | 1.14 s | 2.09 s | 2.14 s | 1.82 s |
| Unichain halted | 2.50 s | 3.23 s | 3.72 s | 3.17 s |

On Base, the halt landed a median of **8 block(s)** after the forged mint (Base Sepolia makes a block every 2 s).

## Every run

| Run | Forged mint | Breach seen | Base halted | Unichain halted | Blocks on Base | Attacker steps blocked | Halt on Base |
|---:|---|---:|---:|---:|---:|---:|---|
| 1 | [0x636b2f43…](https://sepolia.basescan.org/tx/0x636b2f43b31d92514e5ad9a3bf004915b81a7dd16f00546313ed97c65afc4909) | 1.82 s | 2.09 s | 3.20 s | 7 | 1 | [0x4133c7ed…](https://sepolia.basescan.org/tx/0x4133c7ed908e4bc2fef80c367cc9ee52205078badf050c6815e07ef3ecc41a13) |
| 2 | [0xb676e713…](https://sepolia.basescan.org/tx/0xb676e7134cbc6519f46ecc8c8d20284d2280f77ec5e26f345d9e7f78ff4282c0) | 0.87 s | 1.14 s | 2.50 s | 6 | 2 | [0xccd3940b…](https://sepolia.basescan.org/tx/0xccd3940b07f20f42a6080d117b4cfe17a8bdf70ca20f1ea11aec96c62e8d623f) |
| 3 | [0x7a4c6859…](https://sepolia.basescan.org/tx/0x7a4c685919c727db3c303de564ca8888396449a3e585a9493a40652764354278) | 1.74 s | 2.02 s | 3.65 s | 9 | 1 | [0x9ab41855…](https://sepolia.basescan.org/tx/0x9ab41855b74623b051efc48bdfe88a639eaed706cde7c21676571a0eb1fcc419) |
| 4 | [0x19e6bf51…](https://sepolia.basescan.org/tx/0x19e6bf51588fc782e475a7e33eec6055ee353099bc0b627b1e96837db56a5144) | 1.85 s | 2.14 s | 3.23 s | 8 | 1 | [0x450afc7e…](https://sepolia.basescan.org/tx/0x450afc7e55f5d7d110135e29fc70365dba2f758598b05592489c1e5e0fc5b1a4) |
| 5 | [0xc8ed0bc1…](https://sepolia.basescan.org/tx/0xc8ed0bc1302b267bba0ae344fe0d34bd47d1d445644ef3e46e818277282a0aaf) | 1.11 s | 1.38 s | 2.74 s | 6 | 1 | [0x89cb95b1…](https://sepolia.basescan.org/tx/0x89cb95b18b8642bbc93678e0e9332fa97abee1991e73c5f775e03b0ad4987810) |
| 6 | [0x9766d78d…](https://sepolia.basescan.org/tx/0x9766d78d18ce13c14d44c4ca7fc10411fc11762da46bfb934e2b3811eef4e9c1) | 1.84 s | 2.12 s | 3.72 s | 8 | 1 | [0x11d4f294…](https://sepolia.basescan.org/tx/0x11d4f2941cc69e3bb0049d63a5e64e3f79f816ada74f2013502aa528b20d1a60) |

Wall-clock times come from a script polling public RPCs, so they include a little polling delay. Block counts come straight from the chain.
