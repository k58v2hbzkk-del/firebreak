// Local stand-in for Reactive Network, for end-to-end tests on three anvil chains.
// It plays the Lasna system contract (feeds origin logs into FirebreakReactive.react) and the
// callback proxies (delivers requested callbacks to the guards). Not used on testnet.
import { createTestClient, http, encodeAbiParameters, decodeAbiParameters, parseAbi, concat } from 'viem'
import { CHAINS, pub, wallet, artifact, loadDeployment, sleep, ADDR } from '../scripts/net.mjs'

const SYS = '0x8888888888888888888888888888888888888888'
const { base, uni, lasna } = CHAINS
const test = (c) => createTestClient({ chain: c, mode: 'anvil', transport: http() })
const rxAbi = artifact('FirebreakReactive', 'FirebreakReactive.sol').abi
const mock = parseAbi(['function count() view returns (uint256)', 'function cb(uint256) view returns ((uint256 chainId, address recipient, bytes payload, address sender))'])

export async function installSystem() {
  const code = JSON.parse((await import('node:fs')).readFileSync(new URL('../contracts/out/Firebreak.t.sol/MockSystem.json', import.meta.url))).deployedBytecode.object
  await test(lasna).setCode({ address: SYS, bytecode: code })
}

export async function runRelay() {
  const d = loadDeployment()
  const C = d.contracts
  const sources = [
    [uni, C.escrow],
    [base, C.minter],
  ]
  const from = { [uni.id]: 0n, [base.id]: 0n }
  let delivered = 0
  for (const who of [SYS, ADDR.baseProxy, ADDR.uniProxy]) {
    for (const c of who === SYS ? [lasna] : [who === ADDR.baseProxy ? base : uni]) {
      await test(c).impersonateAccount({ address: who })
      await test(c).setBalance({ address: who, value: 10n ** 20n })
    }
  }
  for (;;) {
    for (const [c, address] of sources) {
      const head = await pub(c).getBlockNumber()
      if (head < from[c.id]) continue
      const logs = await pub(c).getLogs({ address, fromBlock: from[c.id], toBlock: head })
      from[c.id] = head + 1n
      for (const l of logs) {
        const t = l.topics.map((x) => BigInt(x))
        const rec = { chainId: BigInt(c.id), contractAddress: address, topic0: t[0], topic1: t[1] ?? 0n, topic2: t[2] ?? 0n, topic3: t[3] ?? 0n, data: l.data, blockNumber: l.blockNumber, opCode: BigInt(2 + t.length), blockHash: BigInt(l.blockHash), txHash: BigInt(l.transactionHash), logIndex: BigInt(l.logIndex) }
        await wallet(lasna, SYS).writeContract({ account: SYS, address: C.reactive, abi: rxAbi, functionName: 'react', args: [rec], gas: 2_000_000n })
      }
    }
    const n = Number(await pub(lasna).readContract({ address: SYS, abi: mock, functionName: 'count' }))
    for (; delivered < n; delivered++) {
      const cb = await pub(lasna).readContract({ address: SYS, abi: mock, functionName: 'cb', args: [BigInt(delivered)] })
      const ch = Number(cb.chainId) === base.id ? base : uni
      const proxy = ch === base ? ADDR.baseProxy : ADDR.uniProxy
      const p = cb.payload
      const data = concat([p.slice(0, 10), encodeAbiParameters([{ type: 'address' }], [cb.sender]), `0x${p.slice(74)}`])
      await wallet(ch, proxy).sendTransaction({ account: proxy, to: cb.recipient, data, gas: 1_000_000n })
    }
    await sleep(300)
  }
}

if (process.argv[2] === 'install') await installSystem()
if (process.argv[2] === 'relay') await runRelay()
