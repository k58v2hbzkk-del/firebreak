// Plays an exploiter against the live deployment and times Firebreak's answer on every chain.
//   forgedMint:    Kelp-style. Mint rsETH.b on Base with no lock behind it, then race to cash out:
//                  post it as collateral and borrow, and burn it to pull real rsETH off Unichain.
//   forgedRelease: Nomad-style. Drain the Unichain vault with forged releases, again and again,
//                  the way copycats did for hours in 2022.
// Every attacker step is sent for real (with a fixed gas limit), so blocked steps are reverted
// transactions anyone can open in the explorer.
import { fileURLToPath } from 'node:url'
import { parseEther, formatEther, decodeEventLog } from 'viem'
import { CHAINS, keys, pub, wallet, artifact, loadDeployment, send, sleep, tx } from './net.mjs'

const { base, uni, lasna } = CHAINS
const RELAYER_WAIT_MS = Number(process.env.RELAYER_WAIT_MS ?? 5000)
const ABI = {
  minter: artifact('Minter', 'Bridge.sol').abi,
  escrow: artifact('Escrow', 'Bridge.sol').abi,
  pool: artifact('LendingPool', 'LendingPool.sol').abi,
  guard: artifact('FirebreakGuard', 'FirebreakGuard.sol').abi,
  rx: artifact('FirebreakReactive', 'FirebreakReactive.sol').abi,
  guarded: artifact('Guarded', 'Guarded.sol').abi,
  rsb: artifact('BridgedRsETH', 'Tokens.sol').abi,
  rs: artifact('RsETH', 'Tokens.sol').abi,
}

/** Fire a transaction without simulating, so a blocked step lands on-chain as a revert. */
async function fire(ch, account, address, abi, functionName, args, nonce) {
  const hash = await wallet(ch, account).writeContract({ address, abi, functionName, args, gas: 400_000n, ...(nonce != null ? { nonce } : {}) })
  return hash
}
async function block(ch, blockNumber) {
  for (let i = 0; ; i++) {
    try {
      return await pub(ch).getBlock({ blockNumber })
    } catch (e) {
      if (i >= 8) return { timestamp: 0n }
      await sleep(500)
    }
  }
}
async function settle(ch, hash) {
  const r = await pub(ch).waitForTransactionReceipt({ hash, timeout: 120_000 })
  let haltedThen = null
  if (r.status !== 'success' && r.to) {
    for (let i = 0; i < 8 && haltedThen == null; i++) {
      haltedThen = await pub(ch).readContract({ address: r.to, abi: ABI.guarded, functionName: 'halted', blockNumber: r.blockNumber }).catch(() => null)
      if (haltedThen == null) await sleep(500)
    }
  }
  return { ok: r.status === 'success', block: r.blockNumber, hash, haltedThen }
}
const verdict = (r) => (r.ok ? 'loss' : r.haltedThen ? 'blocked' : 'failed')

/** Watches for Firebreak's three answers and stamps when each was first seen. */
function watch(d, t0, fromBlocks) {
  const seen = {}
  let stop = false
  const targets = [
    ['breach', lasna, d.contracts.reactive, ABI.rx, 'Breach'],
    ['haltBase', base, d.contracts.guardBase, ABI.guard, 'Tripped'],
    ['haltUni', uni, d.contracts.guardUni, ABI.guard, 'Tripped'],
  ]
  const loop = async () => {
    while (!stop && Object.keys(seen).length < 3) {
      await Promise.all(
        targets.map(async ([k, ch, address, abi, eventName]) => {
          if (seen[k]) return
          const logs = await pub(ch).getContractEvents({ address, abi, eventName, fromBlock: fromBlocks[k] }).catch(() => [])
          if (logs.length) {
            const l = logs[0]
            const blk = await block(ch, l.blockNumber)
            seen[k] = { ms: Date.now() - t0, hash: l.transactionHash, block: Number(l.blockNumber), blockTime: blk ? Number(blk.timestamp) : null, args: l.args }
          }
        }),
      )
      await sleep(250)
    }
  }
  const done = loop()
  return { seen, stop: async () => ((stop = true), await done) }
}

async function startBlocks(d) {
  const [b, u, l] = await Promise.all([pub(base).getBlockNumber(), pub(uni).getBlockNumber(), pub(lasna).getBlockNumber()])
  return { haltBase: b, haltUni: u, breach: l }
}

export async function forgedMint({ amount = '100', log = console.log } = {}) {
  const d = loadDeployment()
  const { attacker, relayer } = keys()
  const C = d.contracts
  const steps = []
  const step = (s) => (steps.push(s), log(`${String(s.ms).padStart(6)} ms  ${s.label}${s.hash ? `  ${s.hash}` : ''}`))
  const from = await startBlocks(d)
  const value = parseEther(amount)
  const nonce = await pub(base).getTransactionCount({ address: attacker.address, blockTag: 'pending' })

  const t0 = Date.now()
  const mintHash = await fire(base, attacker, C.minter, ABI.minter, 'forgedMint', [value], nonce)
  const w = watch(d, t0, from)
  const mint = await settle(base, mintHash)
  const mintBlock = await block(base, mint.block)
  step({ ms: Date.now() - t0, label: `Forged mint of ${amount} rsETH.b lands on Base`, chain: 'base', hash: mintHash, ok: mint.ok, kind: 'attack' })

  // the attacker's bot moves the instant it sees its mint: collateral + bridge exit, back to back
  const half = value / 2n
  const depHash = await fire(base, attacker, C.pool, ABI.pool, 'deposit', [half], nonce + 1)
  const burnHash = await fire(base, attacker, C.minter, ABI.minter, 'burn', [half, attacker.address], nonce + 2)
  const [dep, burn] = await Promise.all([settle(base, depHash), settle(base, burnHash)])
  step({ ms: Date.now() - t0, label: `Attacker posts ${formatEther(half)} as collateral`, chain: 'base', hash: depHash, ok: dep.ok, kind: dep.ok ? 'attack' : verdict(dep) })
  step({ ms: Date.now() - t0, label: `Attacker burns ${formatEther(half)} to exit through the bridge`, chain: 'base', hash: burnHash, ok: burn.ok, kind: burn.ok ? 'attack' : verdict(burn) })

  // borrow as soon as the pool's settle window allows
  if (dep.ok) {
    const acct = await pub(base).readContract({ address: C.pool, abi: ABI.pool, functionName: 'accounts', args: [attacker.address] })
    while ((await pub(base).getBlockNumber()) + 1n < acct[2]) await sleep(300)
    const lim = await pub(base).readContract({ address: C.pool, abi: ABI.pool, functionName: 'borrowLimit', args: [attacker.address] })
    const bh = await fire(base, attacker, C.pool, ABI.pool, 'borrow', [lim], nonce + 3)
    const b = await settle(base, bh)
    step({ ms: Date.now() - t0, label: `Attacker tries to borrow ${Number(formatEther(lim)).toLocaleString()} tUSD`, chain: 'base', hash: bh, ok: b.ok, kind: verdict(b) })
  }

  // the bridge relayer honours the burn, like a real (compromised-message) bridge would
  if (burn.ok) {
    const logs = await pub(base).getContractEvents({ address: C.minter, abi: ABI.minter, eventName: 'Burned', fromBlock: burn.block, toBlock: burn.block })
    const id = logs.find((l) => l.transactionHash === burnHash)?.args.id
    // like the honest round, the relayer waits a few seconds for confirmations before releasing
    // (real bridges wait minutes for finality)
    await sleep(RELAYER_WAIT_MS)
    const rh = await fire(uni, relayer, C.escrow, ABI.escrow, 'release', [id, attacker.address, half])
    const r = await settle(uni, rh)
    step({ ms: Date.now() - t0, label: `Bridge releases ${formatEther(half)} real rsETH on Unichain`, chain: 'uni', hash: rh, ok: r.ok, kind: verdict(r) })
  }

  await Promise.race([sleep(20_000), (async () => { while (Object.keys(w.seen).length < 3) await sleep(200) })()])
  await w.stop()
  return finish('forgedMint', d, steps, w.seen, { t0Block: Number(mint.block), t0BlockTime: Number(mintBlock.timestamp) })
}

export async function forgedRelease({ amount = '5', tries = 8, log = console.log } = {}) {
  const d = loadDeployment()
  const { attacker } = keys()
  const C = d.contracts
  const steps = []
  const step = (s) => (steps.push(s), log(`${String(s.ms).padStart(6)} ms  ${s.label}${s.hash ? `  ${s.hash}` : ''}`))
  const from = await startBlocks(d)
  const value = parseEther(amount)
  let nonce = await pub(uni).getTransactionCount({ address: attacker.address, blockTag: 'pending' })
  const t0 = Date.now()
  let w
  let first
  let drained = 0n
  for (let i = 0; i < tries; i++) {
    const h = await fire(uni, attacker, C.escrow, ABI.escrow, 'forgedRelease', [value], nonce++)
    if (!w) w = watch(d, t0, from)
    const r = await settle(uni, h)
    if (!first) first = await block(uni, r.block)
    if (r.ok) drained += value
    step({ ms: Date.now() - t0, label: `Forged release #${i + 1}: ${amount} rsETH`, chain: 'uni', hash: h, ok: r.ok, kind: verdict(r) })
    if (!r.ok && i >= 2) break // stopped; a couple of failed copycats are enough evidence
    // each copycat lands in its own block (Unichain confirms ahead of sealing the block)
    while ((await pub(uni).getBlockNumber()) <= r.block) await sleep(150)
  }
  await Promise.race([sleep(15_000), (async () => { while (Object.keys(w.seen).length < 3) await sleep(200) })()])
  await w.stop()
  return finish('forgedRelease', d, steps, w.seen, { t0BlockTime: Number(first.timestamp), drained: formatEther(drained), attempted: formatEther(value * BigInt(tries)) })
}

function finish(kind, d, steps, seen, extra) {
  const lines = [
    seen.breach && { ms: seen.breach.ms, label: 'Firebreak sees the books break and calls both chains', chain: 'lasna', hash: seen.breach.hash, ok: true, kind: 'firebreak' },
    seen.haltBase && { ms: seen.haltBase.ms, label: 'Base: bridge minter and lending pool halted', chain: 'base', hash: seen.haltBase.hash, ok: true, kind: 'firebreak' },
    seen.haltUni && { ms: seen.haltUni.ms, label: 'Unichain: bridge vault halted', chain: 'uni', hash: seen.haltUni.hash, ok: true, kind: 'firebreak' },
  ].filter(Boolean)
  // polling sees a halt late; a step that reverted because its target was halted proves the
  // halt had landed by then, so use whichever came first
  for (const l of lines) {
    if (l.chain === 'lasna') continue
    const proof = steps.filter((s) => s.chain === l.chain && s.kind === 'blocked').map((s) => s.ms)
    if (proof.length && Math.min(...proof) < l.ms) l.ms = Math.min(...proof) - 1
  }
  const timeline = [...steps, ...lines].sort((a, b) => a.ms - b.ms)
  console.log(`-- ${kind} summary`)
  for (const t of timeline) console.log(`${String(t.ms).padStart(6)} ms  [${t.kind}] ${t.label}`)
  const url = (s) => tx({ base, uni, lasna }[s.chain], s.hash)
  return { kind, at: new Date().toISOString(), ...extra, timeline: timeline.map((s) => ({ ...s, url: url(s) })), seen }
}

/** Governance cleanup after a demo run: claw back forged tokens, refill the vault, re-arm, resume. */
export async function reset({ log = console.log } = {}) {
  const d = loadDeployment()
  const { deployer, attacker } = keys()
  const C = d.contracts
  const poolAcct = await pub(base).readContract({ address: C.pool, abi: ABI.pool, functionName: 'accounts', args: [attacker.address] })
  if (poolAcct[0] > 0n) {
    await send(base, deployer, C.pool, ABI.pool, 'seize', [attacker.address])
    await send(base, deployer, C.minter, ABI.minter, 'confiscate', [deployer.address, poolAcct[0]])
  }
  const fake = await pub(base).readContract({ address: C.rsETHb, abi: ABI.rsb, functionName: 'balanceOf', args: [attacker.address] })
  if (fake > 0n) await send(base, deployer, C.minter, ABI.minter, 'confiscate', [attacker.address, fake])
  const stolen = await pub(uni).readContract({ address: C.rsETH, abi: ABI.rs, functionName: 'balanceOf', args: [attacker.address] })
  if (stolen > 0n) await send(uni, attacker, C.rsETH, ABI.rs, 'transfer', [C.escrow, stolen])
  // top the vault back up so backing covers supply again before re-arming
  {
    const [vault, sup] = await Promise.all([
      pub(uni).readContract({ address: C.rsETH, abi: ABI.rs, functionName: 'balanceOf', args: [C.escrow] }),
      pub(base).readContract({ address: C.rsETHb, abi: ABI.rsb, functionName: 'totalSupply' }),
    ])
    if (sup > vault) await send(uni, deployer, C.rsETH, ABI.rs, 'transfer', [C.escrow, sup - vault])
  }
  await sleep(1500)
  const [backing, supply] = await Promise.all([
    pub(uni).readContract({ address: C.rsETH, abi: ABI.rs, functionName: 'balanceOf', args: [C.escrow] }),
    pub(base).readContract({ address: C.rsETHb, abi: ABI.rsb, functionName: 'totalSupply' }),
  ])
  await send(lasna, deployer, C.reactive, ABI.rx, 'rearm', [backing, supply])
  for (const [ch, a] of [[base, C.minter], [base, C.pool], [uni, C.escrow]]) {
    if (await pub(ch).readContract({ address: a, abi: ABI.guarded, functionName: 'halted' })) await send(ch, deployer, a, ABI.guarded, 'resume')
  }
  log(`reset: books backing=${formatEther(backing)} supply=${formatEther(supply)}, re-armed, resumed`)
  return { backing: formatEther(backing), supply: formatEther(supply) }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const which = process.argv[2] ?? 'forgedMint'
  const out = which === 'reset' ? await reset() : which === 'forgedRelease' ? await forgedRelease() : await forgedMint()
  console.log(JSON.stringify(out, (_, v) => (typeof v === 'bigint' ? v.toString() : v), 2))
}
