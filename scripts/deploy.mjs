// Deploys Firebreak to Unichain Sepolia, Base Sepolia and Reactive Lasna, wires it up, and seeds
// the bridge with one honest round trip. Writes deployments/firebreak.json.
import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'
import { parseEther, maxUint256 } from 'viem'
import { CHAINS, ADDR, ROOT, DEPLOYMENT, keys, deploy, send, artifact, pub, wallet, sleep } from './net.mjs'

const { deployer, relayer, attacker } = keys()
const { base, uni, lasna } = CHAINS
const A = (n, f) => artifact(n, f).abi
const c = {}
const txs = {}
console.log(`deployer ${deployer.address}\nrelayer  ${relayer.address}\nattacker ${attacker.address}\n`)

// ---- Unichain Sepolia: the asset and the bridge vault
c.rsETH = (await deploy(uni, deployer, 'RsETH', [], 0n, 'Tokens.sol')).address
c.escrow = (await deploy(uni, deployer, 'Escrow', [c.rsETH, relayer.address], 0n, 'Bridge.sol')).address

// ---- Base Sepolia: the bridged token, the minter, and the lending pool
c.rsETHb = (await deploy(base, deployer, 'BridgedRsETH', [], 0n, 'Tokens.sol')).address
c.minter = (await deploy(base, deployer, 'Minter', [c.rsETHb, relayer.address], 0n, 'Bridge.sol')).address
await send(base, deployer, c.rsETHb, A('BridgedRsETH', 'Tokens.sol'), 'setMinter', [c.minter])
c.tUSD = (await deploy(base, deployer, 'TestUSD', [parseEther('10000000')], 0n, 'Tokens.sol')).address
c.pool = (await deploy(base, deployer, 'LendingPool', [c.rsETHb, c.tUSD], 0n, 'LendingPool.sol')).address
await send(base, deployer, c.tUSD, A('TestUSD', 'Tokens.sol'), 'transfer', [c.pool, parseEther('10000000')])

// ---- Reactive Lasna: the brain
const rx = await deploy(lasna, deployer, 'FirebreakReactive', [uni.id, c.escrow, base.id, c.minter], parseEther(process.env.RX_FUND ?? '1'), 'FirebreakReactive.sol')
c.reactive = rx.address
txs.reactiveDeploy = rx.hash

// ---- Guards (pin the reactive contract as their only caller)
const gFund = parseEther(process.env.GUARD_FUND ?? '0.002')
c.guardBase = (await deploy(base, deployer, 'FirebreakGuard', [ADDR.baseProxy, c.reactive], gFund, 'FirebreakGuard.sol')).address
c.guardUni = (await deploy(uni, deployer, 'FirebreakGuard', [ADDR.uniProxy, c.reactive], gFund, 'FirebreakGuard.sol')).address
const G = A('FirebreakGuard', 'FirebreakGuard.sol')
const GD = A('Guarded', 'Guarded.sol')
await send(base, deployer, c.guardBase, G, 'addTarget', [c.minter])
await send(base, deployer, c.guardBase, G, 'addTarget', [c.pool])
await send(uni, deployer, c.guardUni, G, 'addTarget', [c.escrow])
await send(base, deployer, c.minter, GD, 'setGuard', [c.guardBase])
await send(base, deployer, c.pool, GD, 'setGuard', [c.guardBase])
await send(uni, deployer, c.escrow, GD, 'setGuard', [c.guardUni])
txs.subscribe = (await send(lasna, deployer, c.reactive, A('FirebreakReactive', 'FirebreakReactive.sol'), 'setGuards', [c.guardUni, c.guardBase])).hash

// ---- gas for the two demo actors
for (const ch of [base, uni]) {
  for (const who of [relayer, attacker]) {
    const bal = await pub(ch).getBalance({ address: who.address })
    if (bal < parseEther('0.0004')) {
      const h = await wallet(ch, deployer).sendTransaction({ to: who.address, value: parseEther('0.0008') })
      await pub(ch).waitForTransactionReceipt({ hash: h })
    }
  }
}

// attacker pre-approves the pool so the race starts the moment the forged mint lands
await send(base, attacker, c.rsETHb, A('BridgedRsETH', 'Tokens.sol'), 'approve', [c.pool, maxUint256])

// ---- seed: one honest lock -> mint, which must NOT trip Firebreak
const RS = A('RsETH', 'Tokens.sol')
await send(uni, deployer, c.rsETH, RS, 'mint', [deployer.address, parseEther('100000')])
await send(uni, deployer, c.rsETH, RS, 'approve', [c.escrow, maxUint256])
const lock = await send(uni, deployer, c.escrow, A('Escrow', 'Bridge.sol'), 'lock', [parseEther('200'), deployer.address])
txs.honestLock = lock.hash
const lockId = BigInt(lock.receipt.logs.find((l) => l.address.toLowerCase() === c.escrow.toLowerCase()).topics[1])
await sleep(6000) // a real bridge waits for finality; Firebreak needs only ~1 s to book the lock
txs.honestMint = (await send(base, relayer, c.minter, A('Minter', 'Bridge.sol'), 'mint', [lockId, deployer.address, parseEther('200')])).hash

// confirm the books on Lasna
const RX = A('FirebreakReactive', 'FirebreakReactive.sol')
let books
for (let i = 0; i < 30; i++) {
  const [backing, supply, armed] = await Promise.all(['backing', 'supply', 'armed'].map((f) => pub(lasna).readContract({ address: c.reactive, abi: RX, functionName: f })))
  books = { backing: backing.toString(), supply: supply.toString(), armed }
  if (supply > 0n) break
  await sleep(2000)
}
console.log('books on Lasna after the honest round:', books)

let commit = ''
try { commit = execSync('git rev-parse HEAD', { cwd: ROOT }).toString().trim() } catch {}
const out = { deployedAt: new Date().toISOString(), commit, chains: { base: base.id, unichain: uni.id, lasna: lasna.id }, contracts: c, actors: { deployer: deployer.address, relayer: relayer.address, attacker: attacker.address }, txs, books }
fs.mkdirSync(path.dirname(DEPLOYMENT), { recursive: true })
fs.writeFileSync(DEPLOYMENT, JSON.stringify(out, null, 2))
console.log(`\nwrote ${DEPLOYMENT}`)
