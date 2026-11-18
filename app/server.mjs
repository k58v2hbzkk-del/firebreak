// Firebreak live demo server: serves the site, reads the three chains, and lets visitors run the
// attacks against the real testnet deployment (one at a time, rate-limited), streaming each step.
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { formatEther } from 'viem'
import { CHAINS, pub, artifact, loadDeployment, at } from '../scripts/net.mjs'

const PORT = Number(process.env.PORT ?? 3000)
const ROOT = import.meta.dirname
const STATIC = [path.join(ROOT, 'dist'), path.join(ROOT, 'public')]
const COOLDOWN_MS = Number(process.env.COOLDOWN_MS ?? 45_000)
const PER_DAY = Number(process.env.MAX_RUNS_PER_DAY ?? 60)
const live = Boolean(process.env.DEPLOYER_KEY)

let d = null
try {
  d = loadDeployment()
} catch {
  console.log('No deployment yet: serving the site only')
}
const demoFile = path.join(ROOT, '..', 'deployments', 'demo.json')
const recorded = fs.existsSync(demoFile) ? JSON.parse(fs.readFileSync(demoFile, 'utf8')).runs : []
const runs = [...recorded].reverse() // newest first

const A = {
  rx: artifact('FirebreakReactive', 'FirebreakReactive.sol').abi,
  guarded: artifact('Guarded', 'Guarded.sol').abi,
  guard: artifact('FirebreakGuard', 'FirebreakGuard.sol').abi,
  erc20: artifact('BridgedRsETH', 'Tokens.sol').abi,
}

// ---------------------------------------------------------------- state
let stateCache = { at: 0, value: null }
async function state() {
  if (!d) return { deployed: false }
  if (Date.now() - stateCache.at < 2500 && stateCache.value) return stateCache.value
  const { base, uni, lasna } = CHAINS
  const C = d.contracts
  const r = (ch, address, abi, functionName, args = []) => pub(ch).readContract({ address, abi, functionName, args }).catch(() => null)
  const [backing, supply, armed, breaches, haltedMinter, haltedPool, haltedEscrow, vault, bridged, tripsBase, tripsUni] = await Promise.all([
    r(lasna, C.reactive, A.rx, 'backing'),
    r(lasna, C.reactive, A.rx, 'supply'),
    r(lasna, C.reactive, A.rx, 'armed'),
    r(lasna, C.reactive, A.rx, 'breaches'),
    r(base, C.minter, A.guarded, 'halted'),
    r(base, C.pool, A.guarded, 'halted'),
    r(uni, C.escrow, A.guarded, 'halted'),
    r(uni, C.rsETH, A.erc20, 'balanceOf', [C.escrow]),
    r(base, C.rsETHb, A.erc20, 'totalSupply'),
    r(base, C.guardBase, A.guard, 'trips'),
    r(uni, C.guardUni, A.guard, 'trips'),
  ])
  const n = (x) => (x == null ? null : Number(formatEther(x)))
  const value = {
    deployed: true,
    live,
    busy: Boolean(current),
    nextRunIn: Math.max(0, lastRun + COOLDOWN_MS - Date.now()),
    books: { backing: n(backing), supply: n(supply), armed, breaches: breaches == null ? null : Number(breaches) },
    chain: { vault: n(vault), bridgedSupply: n(bridged), tripsBase: tripsBase == null ? null : Number(tripsBase), tripsUni: tripsUni == null ? null : Number(tripsUni) },
    halted: { minter: haltedMinter, pool: haltedPool, escrow: haltedEscrow },
    links: {
      reactive: at(lasna, C.reactive),
      guardBase: at(base, C.guardBase),
      guardUni: at(uni, C.guardUni),
      minter: at(base, C.minter),
      pool: at(base, C.pool),
      escrow: at(uni, C.escrow),
    },
    contracts: C,
  }
  stateCache = { at: Date.now(), value }
  return value
}

// ---------------------------------------------------------------- attack runner
let current = null // { kind, events: [], listeners: Set }
let lastRun = 0
let day = ''
let today = 0

function broadcast(ev) {
  if (!current) return
  current.events.push(ev)
  for (const res of current.listeners) res.write(`data: ${JSON.stringify(ev)}\n\n`)
}

async function startAttack(kind) {
  if (!live || !d) throw new Error('The live demo is not configured on this server.')
  if (current) throw new Error('An attack is already running. Watch it below.')
  const wait = lastRun + COOLDOWN_MS - Date.now()
  if (wait > 0) throw new Error(`Firebreak is re-arming. Try again in ${Math.ceil(wait / 1000)} s.`)
  const dd = new Date().toISOString().slice(0, 10)
  if (dd !== day) (day = dd), (today = 0)
  if (today >= PER_DAY) throw new Error('Daily demo limit reached. Recorded runs are below.')
  today++
  current = { kind, events: [], listeners: new Set(), started: Date.now() }
  lastRun = Date.now()
  ;(async () => {
    const { forgedMint, forgedRelease, reset } = await import('../scripts/attack.mjs')
    broadcast({ type: 'start', kind })
    try {
      const log = (line) => broadcast({ type: 'log', line })
      const out = kind === 'forgedRelease' ? await forgedRelease({ log, tries: 6 }) : await forgedMint({ log })
      for (const s of out.timeline) broadcast({ type: 'step', step: s })
      runs.unshift(out)
      runs.splice(12)
      broadcast({ type: 'result', run: out })
      broadcast({ type: 'log', line: 'Governance cleanup: clawing back forged tokens, re-arming, resuming…' })
      await reset({ log: (line) => broadcast({ type: 'log', line }) })
      broadcast({ type: 'done' })
    } catch (e) {
      broadcast({ type: 'error', message: String(e?.shortMessage ?? e?.message ?? e).split('\n')[0] })
    } finally {
      for (const res of current.listeners) res.end()
      current = null
      lastRun = Date.now()
      stateCache.at = 0
    }
  })()
}

// ---------------------------------------------------------------- http
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.woff2': 'font/woff2' }
function serveStatic(res, pathname) {
  const rel = pathname === '/' ? 'index.html' : decodeURIComponent(pathname).replace(/^\/+/, '')
  for (const dir of STATIC) {
    const f = path.join(dir, rel)
    if (f.startsWith(dir) && fs.existsSync(f) && fs.statSync(f).isFile()) {
      res.writeHead(200, { 'content-type': TYPES[path.extname(f)] ?? 'application/octet-stream', 'cache-control': 'public, max-age=300' })
      return fs.createReadStream(f).pipe(res)
    }
  }
  res.writeHead(200, { 'content-type': TYPES['.html'] })
  fs.createReadStream(path.join(ROOT, 'public', 'index.html')).pipe(res)
}
const json = (res, code, body) => {
  res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' })
  res.end(JSON.stringify(body, (_, v) => (typeof v === 'bigint' ? v.toString() : v)))
}

http
  .createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://x')
    try {
      if (url.pathname === '/health') return void res.end('ok')
      if (url.pathname === '/api/state') return json(res, 200, await state())
      if (url.pathname === '/api/runs') return json(res, 200, { runs })
      if (url.pathname === '/api/attack' && req.method === 'POST') {
        let raw = ''
        for await (const c of req) if ((raw += c).length > 1000) throw new Error('Too large')
        const kind = JSON.parse(raw || '{}').kind === 'forgedRelease' ? 'forgedRelease' : 'forgedMint'
        await startAttack(kind)
        return json(res, 200, { ok: true, kind })
      }
      if (url.pathname === '/api/stream') {
        res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' })
        if (!current) return void res.end(`data: ${JSON.stringify({ type: 'idle' })}\n\n`)
        for (const ev of current.events) res.write(`data: ${JSON.stringify(ev)}\n\n`)
        current.listeners.add(res)
        req.on('close', () => current?.listeners.delete(res))
        return
      }
      return serveStatic(res, url.pathname)
    } catch (e) {
      return json(res, 400, { error: String(e?.message ?? e).split('\n')[0] })
    }
  })
  .listen(PORT, () => console.log(`Firebreak on :${PORT} · live attacks ${live ? 'ON' : 'OFF'}`))
