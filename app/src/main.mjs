const $ = (s) => document.querySelector(s)
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
const fmt = (n) => (n == null ? '–' : Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 }))
const CH = { base: 'Base', uni: 'Unichain', lasna: 'Lasna' }
const KIND = { firebreak: 'Firebreak', blocked: 'Blocked', loss: 'Got through', attack: 'Attacker', failed: 'Reverted' }

// ---------------------------------------------------------------- tiles
const TILES = [
  ['Unichain Sepolia', 'Bridge vault', 'Holds the real rsETH. Releases need a matching burn on Base. Halted the moment one doesn’t.'],
  ['Base Sepolia', 'Bridge minter', 'Mints rsETH.b for locks on Unichain. A mint with no lock behind it trips Firebreak.'],
  ['Base Sepolia', 'Lending pool', 'Where forged tokens become real money. New bridged collateral settles for 2 blocks; Firebreak decides inside that window.'],
  ['Both chains', 'Guards', 'Accept calls only from Reactive’s callback proxy carrying our contract. One callback halts every target on the chain.'],
  ['Reactive Lasna', 'Reactive ledger', 'One set of books for both halves of the bridge: locks, mints, burns and releases, checked on every event.'],
  ['Humans', 'Governance', 'A machine can pull the brake. Only governance can release it. Repaying and debt-free withdrawals keep working.'],
]
let tile = 0
function showTile(i) {
  tile = i
  document.querySelectorAll('.tile[data-i]').forEach((b) => b.classList.toggle('on', Number(b.dataset.i) === i))
  ;[$('#fKicker').textContent, $('#fTitle').textContent, $('#fText').textContent] = TILES[i]
}
const cycle = setInterval(() => showTile((tile + 1) % TILES.length), 3500)
document.querySelectorAll('.tile[data-i]').forEach((b) => (b.onclick = () => (showTile(Number(b.dataset.i)), clearInterval(cycle))))
showTile(0)

// ---------------------------------------------------------------- live state
let busy = false
let contractsDrawn = false
async function refresh() {
  try {
    const s = await (await fetch('/api/state')).json()
    if (!s.deployed) return
    const h = s.halted
    const kv = (id, halted) => {
      $(id).textContent = halted == null ? '…' : halted ? 'Halted' : 'Live'
      $(id).className = halted ? 'halt' : ''
    }
    kv('#hMinter', h.minter)
    kv('#hPool', h.pool)
    kv('#hEscrow', h.escrow)
    const badge = (id, hot, a, b) => (($(id).textContent = hot ? a : b), ($(id).className = `badge ${hot ? 'hot' : 'ok'}`))
    const baseHalt = h.minter || h.pool
    badge('#sBase', baseHalt, 'Halted', 'Live')
    badge('#sUni', h.escrow, 'Halted', 'Live')
    badge('#sArmed', s.books.armed === false, 'Tripped', 'Armed')
    $('#cBase').classList.toggle('tripped', Boolean(baseHalt))
    $('#cUni').classList.toggle('tripped', Boolean(h.escrow))
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
    if (!s.live) status('Live attacks are off on this server; recorded runs are below.')
    else if (s.busy && !streaming) follow()
    if (!contractsDrawn) drawContracts(s.links)
  } catch {
    /* keep the last view */
  }
}
setInterval(refresh, 3000)
refresh()

function drawContracts(L) {
  contractsDrawn = true
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

// ---------------------------------------------------------------- process line
function status(msg, err = false) {
  $('#status').textContent = msg
  $('#status').className = `status center${err ? ' err' : ''}`
}
function card(s, total) {
  const pct = total ? Math.min(1, s.ms / total) : 0
  $('#dcard').style.left = `calc(${pct * 100}% - ${pct * 280}px)`
  $('#dcard').classList.toggle('fb', s.kind === 'firebreak')
  $('#dcTime').textContent = `${(s.ms / 1000).toFixed(2)} s · ${CH[s.chain] ?? ''}`
  $('#dcTitle').textContent = s.label
  $('#dcText').textContent = s.kind === 'firebreak' ? 'Firebreak answered.' : s.kind === 'blocked' ? 'Reverted: the target was already halted.' : s.kind === 'loss' ? 'Went through before the halt.' : s.kind === 'failed' ? 'Reverted for another reason.' : 'The attacker moves.'
}
let playing = null
function drawProcess(tl) {
  const total = Math.max(...tl.map((s) => s.ms), 1)
  $('#dots').innerHTML = tl.map((s) => `<i class="${s.kind === 'firebreak' ? 'fb' : s.kind === 'blocked' ? 'blocked' : ''}" style="left:${(s.ms / total) * 100}%"></i>`).join('')
  $('#progress').style.width = '100%'
  let i = 0
  clearTimeout(playing)
  const step = () => {
    if (i >= tl.length) return
    card(tl[i], total)
    i++
    playing = setTimeout(step, 1100)
  }
  step()
}
const row = (s) =>
  `<li><span class="ms">${(s.ms / 1000).toFixed(2)} s</span><span class="ch">${CH[s.chain] ?? ''}</span><span>${esc(s.label)}</span><a class="k ${s.kind}" href="${esc(s.url)}" target="_blank" rel="noopener">${KIND[s.kind] ?? ''} ↗</a></li>`

// ---------------------------------------------------------------- the run
let streaming = false
let t0 = 0
let tick = null
function follow() {
  streaming = true
  const es = new EventSource('/api/stream')
  es.onmessage = (m) => {
    const ev = JSON.parse(m.data)
    if (ev.type === 'idle') return es.close(), (streaming = false)
    if (ev.type === 'start') {
      t0 = performance.now()
      clearTimeout(playing)
      $('#timeline').innerHTML = ''
      $('#dots').innerHTML = ''
      $('#progress').style.width = '0'
      $('#dcard').style.left = '0px'
      clearInterval(tick)
      tick = setInterval(() => {
        const el = (performance.now() - t0) / 1000
        $('#progress').style.width = `${Math.min(95, el * 9)}%`
        $('#dcTime').textContent = `${el.toFixed(2)} s`
      }, 60)
      $('#dcard').classList.remove('fb')
      $('#dcTitle').textContent = ev.kind === 'forgedRelease' ? 'Forged releases hit the Unichain vault' : 'An unbacked mint lands on Base'
      $('#dcText').textContent = 'Watching Base, Unichain and Reactive Lasna…'
    }
    if (ev.type === 'log') status(ev.line.replace(/^\s*\d+ ms\s+/, '').replace(/0x[0-9a-f]{64}/, '').trim())
    if (ev.type === 'result') {
      clearInterval(tick)
      const tl = ev.run.timeline
      drawProcess(tl)
      $('#timeline').innerHTML = tl.map(row).join('')
      const fb = tl.filter((s) => s.kind === 'firebreak')
      const halt = fb.length ? Math.max(...fb.map((s) => s.ms)) : null
      const lost = tl.filter((s) => s.kind === 'loss').length
      const blocked = tl.filter((s) => s.kind === 'blocked').length
      status(`Both chains halted ${halt ? `${(halt / 1000).toFixed(1)} s` : ''} after the attacker's first transaction. ${blocked} attacker step${blocked === 1 ? '' : 's'} blocked${lost ? `, ${lost} got through first` : ''}.`)
      loadRuns(false)
    }
    if (ev.type === 'error') (clearInterval(tick), status(ev.message, true))
    if (ev.type === 'done') status(`${$('#status').textContent} Re-armed for the next attacker.`)
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
async function loadRuns(showLatest = true) {
  const { runs } = await (await fetch('/api/runs')).json()
  if (!runs.length) return ($('#runs').innerHTML = '<p class="muted">No runs recorded yet.</p>')
  const halts = runs.map((r) => Math.max(0, ...r.timeline.filter((s) => s.kind === 'firebreak').map((s) => s.ms))).filter((x) => x > 0).sort((a, b) => a - b)
  if (halts.length) $('#statLatency').textContent = `~${(halts[Math.floor(halts.length / 2)] / 1000).toFixed(1)} s`
  if (showLatest && !streaming && runs[0]) {
    drawProcess(runs[0].timeline)
    $('#timeline').innerHTML = runs[0].timeline.map(row).join('')
  }
  $('#runs').innerHTML = runs
    .slice(0, 4)
    .map((r) => `<article class="runcard"><h3>${r.kind === 'forgedRelease' ? 'Forged vault releases · Unichain' : 'Forged mint · Base'}</h3><div class="meta">${new Date(r.at).toLocaleString()}${r.drained ? ` · drained before the halt: ${r.drained} of ${r.attempted} rsETH` : ''}</div><ol class="steps">${r.timeline.map(row).join('')}</ol></article>`)
    .join('')
}
loadRuns()
