// Turns the deployer's Sepolia ETH into what Firebreak needs: Base Sepolia ETH, Unichain Sepolia
// ETH (via the official OP-stack L1 bridges) and lREACT on Reactive Lasna (via Reactive's faucet).
import { parseEther, parseAbi } from 'viem'
import { CHAINS, ADDR, keys, pub, wallet, balances, fmt, sleep } from './net.mjs'

const bridgeAbi = parseAbi(['function depositETH(uint32 minGasLimit, bytes extraData) payable'])
const { deployer } = keys()
const want = {
  base: parseEther(process.env.WANT_BASE ?? '0.008'),
  uni: parseEther(process.env.WANT_UNI ?? '0.008'),
  lasna: parseEther(process.env.WANT_LREACT ?? '2'),
}

const b = await balances(deployer.address)
console.log(`Deployer ${deployer.address}`)
for (const k of Object.keys(b)) console.log(`  ${k.padEnd(8)} ${fmt(b[k])}`)

const l1 = wallet(CHAINS.sepolia, deployer)
const jobs = []
if (b.base >= 0n && b.base < want.base / 2n) {
  const v = want.base - b.base
  const h = await l1.writeContract({ address: ADDR.baseL1Bridge, abi: bridgeAbi, functionName: 'depositETH', args: [200_000, '0x'], value: v })
  console.log(`Bridging ${fmt(v)} ETH to Base Sepolia: ${h}`)
  jobs.push(['base', b.base])
}
if (b.uni >= 0n && b.uni < want.uni / 2n) {
  const v = want.uni - b.uni
  const h = await l1.writeContract({ address: ADDR.uniL1Bridge, abi: bridgeAbi, functionName: 'depositETH', args: [200_000, '0x'], value: v })
  console.log(`Bridging ${fmt(v)} ETH to Unichain Sepolia: ${h}`)
  jobs.push(['uni', b.uni])
}
if (b.lasna >= 0n && b.lasna < want.lasna / 2n) {
  const v = (want.lasna - b.lasna) / 100n // 1 ETH buys 100 lREACT
  const h = await l1.sendTransaction({ to: ADDR.sepoliaFaucet, value: v })
  console.log(`Buying ${fmt(want.lasna - b.lasna)} lREACT with ${fmt(v)} Sepolia ETH: ${h}`)
  jobs.push(['lasna', b.lasna])
}

// wait for deposits to show up (OP-stack deposits take ~1-3 minutes)
const deadline = Date.now() + 15 * 60_000
for (const [k, before] of jobs) {
  for (;;) {
    const now = await pub(CHAINS[k]).getBalance({ address: deployer.address }).catch(() => before)
    if (now > before) {
      console.log(`  ${k} funded: ${fmt(now)}`)
      break
    }
    if (Date.now() > deadline) throw new Error(`${k} funding did not arrive in time`)
    await sleep(10_000)
  }
}
const after = await balances(deployer.address)
console.log('After:')
for (const k of Object.keys(after)) console.log(`  ${k.padEnd(8)} ${fmt(after[k])}`)
