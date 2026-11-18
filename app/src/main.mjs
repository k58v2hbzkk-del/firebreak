const $ = (s) => document.querySelector(s)
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
const fmt = (n) => (n == null ? '–' : Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 }))
const CH = { base: 'Base', uni: 'Unichain', lasna: 'Lasna' }
const KIND = { firebreak: 'Firebreak', blocked: 'Blocked', loss: 'Got through', attack: 'Attacker', failed: 'Reverted' }

// ---------------------------------------------------------------- live state
let busy = false
async function refresh() {
  try {
    const s = await (await fetch('/api/state')).json()
    if (!s.deployed) return
    const h = s.halted
    const set = (id, halted) => {
      const el = $(id)
      el.textContent = halted == null ? '…' : halted ? 'Halted' : 'Live'
      el.className = `st ${halted ? 'halt' : ''}`
    }
    set('#hMinter', h.minter)
    set('#hPool', h.pool)
    set('#hEscrow', h.escrow)
    const baseHalt = h.minter || h.pool
    $('#sBase').textContent = baseHalt ? 'Halted' : 'Live'
    $('#sBase').className = `pill ${baseHalt ? 'hot' : 'ok'}`
    $('#sUni').textContent = h.escrow ? 'Halted' : 'Live'
    $('#sUni').className = `pill ${h.escrow ? 'hot' : 'ok'}`
    $('#cBase').classList.toggle('tripped', Boolean(baseHalt))
    $('#cUni').classList.toggle('tripped', Boolean(h.escrow))
    $('#sArmed').textContent = s.books.armed ? 'Armed' : 'Tripped'
    $('#sArmed').className = `pill ${s.books.armed ? 'ok' : 'hot'}`
    $('#cLasna').classList.toggle('tripped', s.books.armed === false)
    const max = Math.max(s.books.backing ?? 0, s.books.supply ?? 0, 1)
    $('#bBacking').style.width = `${((s.books.backing ?? 0) / max) * 100}%`
    $('#bSupply').style.width = `${((s.books.supply ?? 0) / max) * 100}%`
    $('#bSupply').classList.toggle('over', (s.books.supply ?? 0) > (s.books.backing ?? 0))
    $('#nBacking').textContent = fmt(s.books.backing)
    $('#nSupply').textContent = fmt(s.books.supply)
    $('#vSupply').textContent = fmt(s.chain.bridgedSupply)
    $('#vVault').textContent = fmt(s.chain.vault)
    $('#tUni').textContent = s.chain.tripsUni ?? '–'
    busy = s.busy
    document.querySelectorAll('.attack').forEach((b) => (b.disabled = !s.live || s.busy))
    if (!s.live) status('Recorded runs are shown below; live attacks are off on this server.')
    else if (s.busy && !streaming) follow()
    if (!contractsDrawn) drawContracts(s)
  } catch {
    /* keep the last view */
  }
}
setInterval(refresh, 3000)
refresh()

let contractsDrawn = false
function drawContracts(s) {
  contractsDrawn = true
  const L = s.links
  const items = [
    ['FirebreakReactive', 'Reactive Lasna', L.reactive],
    ['FirebreakGuard', 'Base Sepolia', L.guardBase],
    ['FirebreakGuard', 'Unichain Sepolia', L.guardUni],
    ['Bridge minter', 'Base Sepolia', L.minter],
    ['Lending pool', 'Base Sepolia', L.pool],
    ['Bridge vault', 'Unichain Sepolia', L.escrow],
  ]
  $('#contracts').innerHTML = items.map(([n, c, u]) => `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(n)} · ${esc(c)}<span>${esc(u.split('/').pop())}</span></a>`).join('')
}

// ---------------------------------------------------------------- the run
let t0 = 0
let ticking = null
let streaming = false
function status(msg, err = false) {
  $('#status').textContent = msg
  $('#status').className = `status${err ? ' err' : ''}`
}
function startClock() {
  t0 = performance.now()
  clearInterval(ticking)
  ticking = setInterval(() => ($('#clock').textContent = ((performance.now() - t0) / 1000).toFixed(1)), 50)
}
function stopClock(ms) {
  clearInterval(ticking)
  if (ms != null) $('#clock').textContent = (ms / 1000).toFixed(1)
}
const row = (s) =>
  `<li class="${s.kind === 'firebreak' ? 'fb' : ''}"><span class="ms">${(s.ms / 1000).toFixed(2)} s</span><span class="ch">${CH[s.chain] ?? ''}</span><span class="what2">${esc(s.label)}</span><a class="k ${s.kind}" href="${esc(s.url)}" target="_blank" rel="noopener">${KIND[s.kind] ?? ''} ↗</a></li>`

function follow() {
  streaming = true
  const es = new EventSource('/api/stream')
  const lines = []
  es.onmessage = (m) => {
    const ev = JSON.parse(m.data)
    if (ev.type === 'idle') return es.close(), (streaming = false)
    if (ev.type === 'start') {
      startClock()
      $('#timeline').innerHTML = '<li class="empty">Attacker transaction sent. Watching Base, Unichain and Lasna…</li>'
      status(ev.kind === 'forgedRelease' ? 'Draining the Unichain vault with forged releases…' : 'Minting unbacked rsETH.b on Base…')
    }
    if (ev.type === 'log') lines.push(ev.line), status(ev.line.replace(/^\s*\d+ ms\s+/, '').replace(/0x[0-9a-f]{64}/, '').trim())
    if (ev.type === 'result') {
      const tl = ev.run.timeline
      $('#timeline').innerHTML = tl.map(row).join('')
      const fb = tl.filter((s) => s.kind === 'firebreak')
      const halt = fb.length ? Math.max(...fb.map((s) => s.ms)) : null
      stopClock(halt)
      const lost = tl.filter((s) => s.kind === 'loss').length
      const blocked = tl.filter((s) => s.kind === 'blocked').length
      status(`Firebreak halted both chains ${halt ? `${(halt / 1000).toFixed(1)} s` : ''} after the first attacker transaction. ${blocked} attacker step${blocked === 1 ? '' : 's'} blocked${lost ? `, ${lost} got through before the halt` : ''}.`)
      loadRuns()
    }
    if (ev.type === 'error') status(ev.message, true), stopClock()
    if (ev.type === 'done') status($('#status').textContent + ' Re-armed for the next attacker.')
  }
  es.onerror = () => (es.close(), (streaming = false))
}

document.querySelectorAll('.attack').forEach((b) => {
  b.onclick = async () => {
    if (busy) return
    document.querySelectorAll('.attack').forEach((x) => (x.disabled = true))
    status('Sending the attacker transaction…')
    const r = await fetch('/api/attack', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind: b.dataset.kind }) })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) {
      status(j.error ?? 'Could not start the attack.', true)
      document.querySelectorAll('.attack').forEach((x) => (x.disabled = false))
      return
    }
    follow()
  }
})

// ---------------------------------------------------------------- recorded runs
async function loadRuns() {
  const { runs } = await (await fetch('/api/runs')).json()
  if (!runs.length) return ($('#runs').innerHTML = '<p class="muted">No runs recorded yet.</p>')
  const halts = runs.map((r) => Math.max(...r.timeline.filter((s) => s.kind === 'firebreak').map((s) => s.ms), 0)).filter((x) => x > 0)
  if (halts.length) $('#statLatency').textContent = `~${(halts.sort((a, b) => a - b)[Math.floor(halts.length / 2)] / 1000).toFixed(1)} s`
  $('#runs').innerHTML = runs
    .slice(0, 4)
    .map(
      (r) => `<article class="runcard"><h3>${r.kind === 'forgedRelease' ? 'Forged vault releases · Unichain' : 'Forged mint · Base'}</h3><div class="meta">${new Date(r.at).toLocaleString()}${r.drained ? ` · drained before halt: ${r.drained} rsETH of ${r.attempted} attempted` : ''}</div><ol class="timeline">${r.timeline.map(row).join('')}</ol></article>`,
    )
    .join('')
}
loadRuns()
