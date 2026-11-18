// Repeats the forged-mint attack N times against the live deployment and records how fast
// Firebreak answered each time, in wall-clock time and in blocks (which anyone can check).
import fs from 'node:fs'
import path from 'node:path'
import { ROOT, CHAINS, pub, tx, sleep } from './net.mjs'
import { forgedMint, reset } from './attack.mjs'

const { base, uni, lasna } = CHAINS

async function receiptBlock(ch, hash) {
  for (let i = 0; i < 10; i++) {
    try {
      const n = (await pub(ch).waitForTransactionReceipt({ hash, timeout: 60_000 })).blockNumber
      const b = await pub(ch).getBlock({ blockNumber: n })
      return { n: Number(n), ts: Number(b.timestamp) }
    } catch {
      await sleep(1000)
    }
  }
  return null
}

export async function bench(n = 5) {
  const rows = []
  for (let i = 0; i < n; i++) {
    console.log(`\n== Bench run ${i + 1}/${n}`)
    try {
      const r = await forgedMint({ log: () => {} })
      const mint = r.timeline.find((s) => s.kind === 'attack' && s.label.startsWith('Forged mint'))
      const get = (label) => r.timeline.find((s) => s.kind === 'firebreak' && s.label.startsWith(label))
      const breach = get('Firebreak sees'), hb = get('Base:'), hu = get('Unichain:')
      const row = {
        run: i + 1,
        at: r.at,
        mintHash: mint.hash,
        mintBlock: r.t0Block,
        breachMs: breach ? breach.ms - mint.ms : null,
        baseMs: hb ? hb.ms - mint.ms : null,
        uniMs: hu ? hu.ms - mint.ms : null,
        breachHash: breach?.hash ?? null,
        baseHash: r.seen.haltBase?.hash ?? null,
        uniHash: r.seen.haltUni?.hash ?? null,
        blocked: r.timeline.filter((s) => s.kind === 'blocked').map((s) => ({ label: s.label, hash: s.hash, chain: s.chain })),
        losses: r.timeline.filter((s) => s.kind === 'loss').length,
      }
      row.steps = r.timeline.map((x) => ({ ms: x.ms, chain: x.chain, kind: x.kind, label: x.label, hash: x.hash }))
      const m = await receiptBlock(base, row.mintHash)
      const hbB = row.baseHash && (await receiptBlock(base, row.baseHash))
      const huB = row.uniHash && (await receiptBlock(uni, row.uniHash))
      row.mintBlockTime = m?.ts
      if (hbB) Object.assign(row, { baseHaltBlock: hbB.n, baseBlocks: hbB.n - m.n, baseHaltBlockTime: hbB.ts, baseBlockSecs: hbB.ts - m.ts })
      if (huB) Object.assign(row, { uniHaltBlock: huB.n, uniHaltBlockTime: huB.ts, uniBlockSecs: huB.ts - m.ts })
      const borrow = r.timeline.find((x) => x.label.includes('borrow'))
      row.borrow = borrow ? borrow.kind : 'not tried'
      console.log(JSON.stringify(row))
      rows.push(row)
    } catch (e) {
      console.log('run failed:', e.shortMessage ?? e.message)
    }
    await reset({ log: () => {} }).catch((e) => console.log('reset failed:', e.shortMessage ?? e.message))
  }
  const ok = rows.filter((r) => r.baseMs != null)
  const stat = (k) => {
    const v = ok.map((r) => r[k]).filter((x) => x != null).sort((a, b) => a - b)
    if (!v.length) return null
    return { min: v[0], median: v[Math.floor(v.length / 2)], max: v[v.length - 1], avg: Math.round(v.reduce((a, b) => a + b, 0) / v.length) }
  }
  const out = { at: new Date().toISOString(), runs: rows, stats: { breachMs: stat('breachMs'), baseMs: stat('baseMs'), uniMs: stat('uniMs'), baseBlocks: stat('baseBlocks'), baseBlockSecs: stat('baseBlockSecs'), uniBlockSecs: stat('uniBlockSecs') } }
  fs.writeFileSync(path.join(ROOT, 'deployments', 'bench.json'), JSON.stringify(out, null, 2))
  fs.writeFileSync(path.join(ROOT, 'deployments', 'BENCH.md'), md(out))
  console.log('\nwrote deployments/BENCH.md')
  console.log(JSON.stringify(out.stats))
  return out
}

const s = (ms) => (ms == null ? '–' : `${(ms / 1000).toFixed(2)} s`)
const link = (ch, h) => (h ? `[${h.slice(0, 10)}…](${tx(ch, h)})` : '–')

export function md(o) {
  const st = o.stats
  let m = `# Firebreak response times\n\nThe forged-mint attack, repeated ${o.runs.length} times on testnet (${o.at}).\n`
  m += `Each time is measured from the moment the forged mint was confirmed on Base.\n\n`
  if (st.baseMs) {
    m += `| | Fastest | Median | Slowest | Average |\n|---|---:|---:|---:|---:|\n`
    m += `| Firebreak sees the breach (Lasna) | ${s(st.breachMs?.min)} | ${s(st.breachMs?.median)} | ${s(st.breachMs?.max)} | ${s(st.breachMs?.avg)} |\n`
    m += `| Base halted | ${s(st.baseMs.min)} | ${s(st.baseMs.median)} | ${s(st.baseMs.max)} | ${s(st.baseMs.avg)} |\n`
    m += `| Unichain halted | ${s(st.uniMs?.min)} | ${s(st.uniMs?.median)} | ${s(st.uniMs?.max)} | ${s(st.uniMs?.avg)} |\n`
    if (st.baseBlockSecs) m += `\nChecked against the chain itself: by block timestamps, Base was halted a median of **${st.baseBlockSecs.median} s** (${st.baseBlocks.median} blocks) after the forged mint's block, and Unichain **${st.uniBlockSecs.median} s** after it. Block timestamps are whole seconds.\n`
  }
  m += `\n## Every run\n\n| Run | Forged mint | Breach seen | Base halted | Unichain halted | Blocks on Base | Borrow | Bridge exit | Halt on Base |\n|---:|---|---:|---:|---:|---:|---|---|---|\n`
  for (const r of o.runs) m += `| ${r.run} | ${link(base, r.mintHash)} | ${s(r.breachMs)} | ${s(r.baseMs)} | ${s(r.uniMs)} | ${r.baseBlocks ?? '–'} | ${{ blocked: 'Blocked by Firebreak', failed: 'Reverted (not by Firebreak)', loss: 'Went through', 'not tried': '–' }[r.borrow] ?? '–'} | ${r.steps?.some((x) => x.label.startsWith('Bridge releases') && x.kind === 'blocked') ? 'Blocked by Firebreak' : '–'} | ${link(base, r.baseHash)} |\n`
  m += `\nWall-clock times come from a script polling public RPCs, so they include a little polling delay. Block counts come straight from the chain.\n`
  return m
}
