// CI entry point. `node scripts/run.mjs <fund|deploy|demo|all>`
// demo: plays both attacks against the live deployment, records timings, resets, writes DEMO.md.
import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'
import { ROOT, DEPLOYMENT, CHAINS, at, keys, balances, fmt } from './net.mjs'

const what = (process.argv[2] ?? 'all').trim()
const run = (f) => execSync(`node ${path.join(ROOT, 'scripts', f)}`, { stdio: 'inherit', env: process.env })

if (what === 'fund' || what === 'all') run('fund.mjs')
if (what === 'deploy' || what === 'all') run('deploy.mjs')
if (what === 'demo' || what === 'all') await demo()
if (what === 'balances') {
  const { deployer } = keys()
  const b = await balances(deployer.address)
  for (const k of Object.keys(b)) console.log(`${k.padEnd(8)} ${fmt(b[k])}`)
}

async function demo() {
  const { forgedMint, forgedRelease, reset } = await import('./attack.mjs')
  const d = JSON.parse(fs.readFileSync(DEPLOYMENT, 'utf8'))
  const runs = []
  console.log('\n== Attack 1: forged mint (Kelp-style)')
  runs.push(await forgedMint())
  await reset()
  console.log('\n== Attack 2: forged releases (Nomad-style)')
  runs.push(await forgedRelease())
  await reset()
  const file = path.join(ROOT, 'deployments', 'demo.json')
  fs.writeFileSync(file, JSON.stringify({ runs }, (_, v) => (typeof v === 'bigint' ? v.toString() : v), 2))
  fs.writeFileSync(path.join(ROOT, 'deployments', 'DEMO.md'), md(d, runs))
  console.log('wrote deployments/DEMO.md')
}

function md(d, runs) {
  const { base, uni, lasna } = CHAINS
  const C = d.contracts
  const rows = [
    ['FirebreakReactive', 'Reactive Lasna', lasna, C.reactive],
    ['FirebreakGuard', 'Base Sepolia', base, C.guardBase],
    ['FirebreakGuard', 'Unichain Sepolia', uni, C.guardUni],
    ['Minter (bridge)', 'Base Sepolia', base, C.minter],
    ['LendingPool', 'Base Sepolia', base, C.pool],
    ['rsETH.b', 'Base Sepolia', base, C.rsETHb],
    ['Escrow (bridge vault)', 'Unichain Sepolia', uni, C.escrow],
    ['rsETH', 'Unichain Sepolia', uni, C.rsETH],
  ]
  let s = `# Firebreak live demo\n\nRun ${new Date().toISOString()} · commit \`${d.commit}\`\n\n| Contract | Chain | Address |\n|---|---|---|\n`
  for (const [n, cn, ch, a] of rows) s += `| ${n} | ${cn} | [${a}](${at(ch, a)}) |\n`
  for (const r of runs) {
    const title = r.kind === 'forgedMint' ? 'Attack 1 · forged mint on Base (Kelp-style)' : 'Attack 2 · forged vault releases on Unichain (Nomad-style)'
    s += `\n## ${title}\n\nTimes are measured from the moment the attacker's first transaction was sent.\n\n| ms | Chain | What happened | Result | Transaction |\n|---:|---|---|---|---|\n`
    for (const t of r.timeline) {
      const res = t.kind === 'firebreak' ? '**Firebreak**' : t.kind === 'blocked' ? 'Blocked (reverted)' : t.kind === 'loss' ? 'Went through' : 'Attacker step'
      s += `| ${t.ms} | ${{ base: 'Base', uni: 'Unichain', lasna: 'Lasna' }[t.chain]} | ${t.label} | ${res} | [${t.hash.slice(0, 12)}…](${t.url}) |\n`
    }
    if (r.drained) s += `\nDrained before the halt: **${r.drained} rsETH** of ${r.attempted} attempted.\n`
  }
  s += `\nReverted steps were sent on purpose with a fixed gas limit so the block is visible on-chain.\n`
  return s
}
process.exit(0)
