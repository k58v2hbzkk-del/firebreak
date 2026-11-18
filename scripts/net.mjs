// Chains, accounts and small helpers shared by the deploy scripts and the server.
import fs from 'node:fs'
import path from 'node:path'
import { createPublicClient, createWalletClient, defineChain, http, keccak256, concat, toHex, formatEther } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

export const ROOT = path.resolve(import.meta.dirname, '..')

const chain = (id, name, rpc, explorer, symbol = 'ETH') =>
  defineChain({ id, name, nativeCurrency: { name: symbol, symbol, decimals: 18 }, rpcUrls: { default: { http: [rpc] } }, blockExplorers: { default: { name: 'explorer', url: explorer } }, testnet: true })

export const CHAINS = {
  sepolia: chain(11155111, 'Sepolia', process.env.SEPOLIA_RPC ?? 'https://ethereum-sepolia-rpc.publicnode.com', 'https://sepolia.etherscan.io'),
  base: chain(84532, 'Base Sepolia', process.env.BASE_RPC ?? 'https://sepolia.base.org', 'https://sepolia.basescan.org'),
  uni: chain(1301, 'Unichain Sepolia', process.env.UNI_RPC ?? 'https://sepolia.unichain.org', 'https://sepolia.uniscan.xyz'),
  lasna: chain(5318007, 'Reactive Lasna', process.env.LASNA_RPC ?? 'https://lasna-rpc.rnk.dev/', 'https://lasna.reactscan.net', 'lREACT'),
}

export const ADDR = {
  baseProxy: '0x476F44b11F5C942c58f4c8E3d0300E5710743585', // Reactive callback proxy on Base Sepolia
  uniProxy: '0x775c9B990ADe401060B78D0e98684eEf8d2466C1', // Reactive callback proxy on Unichain Sepolia
  sepoliaFaucet: '0x9b9BB25f1A81078C544C829c5EB7822d747Cf434', // Sepolia ETH -> lREACT (1 : 100)
  baseFaucet: '0x2afaFD298b23b62760711756088F75B7409f5967', // Base Sepolia ETH -> lREACT, request(address)
  baseL1Bridge: '0xfd0Bf71F60660E2f608ed56e1659C450eB113120', // Sepolia -> Base Sepolia
  uniL1Bridge: '0xea58fcA6849d79EAd1f26608855c2D6407d54Ce2', // Sepolia -> Unichain Sepolia
}

export function keys() {
  const raw = (process.env.DEPLOYER_KEY ?? '').trim()
  if (!raw) throw new Error('DEPLOYER_KEY is not set')
  const k = raw.startsWith('0x') ? raw : `0x${raw}`
  const derive = (label) => keccak256(concat([k, toHex(label)]))
  return {
    deployer: privateKeyToAccount(k),
    relayer: privateKeyToAccount(derive('firebreak.relayer')), // plays the bridge's validator
    attacker: privateKeyToAccount(derive('firebreak.attacker')), // plays the exploiter
  }
}

const pubs = {}
export const pub = (c) => (pubs[c.id] ??= createPublicClient({ chain: c, pollingInterval: 250, transport: http(undefined, { retryCount: 4, retryDelay: 800 }) }))
export const wallet = (c, account) => createWalletClient({ chain: c, account, pollingInterval: 250, transport: http(undefined, { retryCount: 2 }) })

export function artifact(name, file = `${name}.sol`) {
  const j = JSON.parse(fs.readFileSync(path.join(ROOT, 'contracts', 'out', file, `${name}.json`), 'utf8'))
  return { abi: j.abi, bytecode: j.bytecode.object }
}

export async function deploy(c, account, name, args = [], value = 0n, file) {
  const { abi, bytecode } = artifact(name, file)
  const hash = await wallet(c, account).deployContract({ abi, bytecode, args, value })
  const r = await pub(c).waitForTransactionReceipt({ hash, timeout: 180_000 })
  if (r.status !== 'success') throw new Error(`${name} deploy failed on ${c.name}: ${hash}`)
  console.log(`  ${name.padEnd(18)} ${c.name.padEnd(16)} ${r.contractAddress}`)
  return { address: r.contractAddress, hash }
}

export async function send(c, account, address, abi, functionName, args = [], opts = {}) {
  const p = pub(c)
  const { request } = await p.simulateContract({ account, address, abi, functionName, args, ...opts })
  const hash = await wallet(c, account).writeContract(request)
  const r = await p.waitForTransactionReceipt({ hash, timeout: 180_000 })
  if (r.status !== 'success') throw new Error(`${functionName} failed on ${c.name}: ${hash}`)
  return { hash, receipt: r }
}

export async function balances(addr) {
  const out = {}
  for (const [k, c] of Object.entries(CHAINS)) out[k] = await pub(c).getBalance({ address: addr }).catch(() => -1n)
  return out
}
export const fmt = (wei) => (wei < 0n ? 'n/a' : Number(formatEther(wei)).toFixed(5))
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
export const tx = (c, h) => `${c.blockExplorers.default.url}/tx/${h}`
export const at = (c, a) => `${c.blockExplorers.default.url}/address/${a}`

export const DEPLOYMENT = path.join(ROOT, 'deployments', 'firebreak.json')
export const loadDeployment = () => JSON.parse(fs.readFileSync(DEPLOYMENT, 'utf8'))
