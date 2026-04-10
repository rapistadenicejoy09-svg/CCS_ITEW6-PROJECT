import fs from 'node:fs'
import { spawn } from 'node:child_process'
import net from 'node:net'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '..')

function loadEnvFile() {
  try {
    const envPath = path.join(rootDir, '.env')
    if (!fs.existsSync(envPath)) return

    const raw = fs.readFileSync(envPath, 'utf8')
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = String(line || '').trim()
      if (!trimmed || trimmed.startsWith('#')) continue

      let key, value
      if (trimmed.startsWith('$env:')) {
        const m = trimmed.match(/^\$env:(\w+)=(?:"([^"]*)"|'([^']*)'|(.*))$/)
        if (!m) continue
        key = m[1]
        value = m[2] ?? m[3] ?? m[4] ?? ''
      } else {
        const idx = trimmed.indexOf('=')
        if (idx === -1) continue
        key = trimmed.slice(0, idx).trim()
        value = trimmed.slice(idx + 1).trim()
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1)
        }
      }
      if (key) {
        process.env[key] = value
      }
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('Could not load .env file:', err)
  }
}

loadEnvFile()

const DEFAULT_PORT = Number(process.env.PORT || 5000)
const MAX_PORT_PROBES = 20
const PER_PORT_STARTUP_TIMEOUT_MS = 30000

let serverProcess = null
let viteProcess = null

function spawnProcess(command, args, options) {
  const child = spawn(command, args, {
    cwd: rootDir,
    stdio: 'inherit',
    env: process.env,
    ...options,
  })
  child.on('exit', (code) => {
    // If one process exits unexpectedly, stop the other so the dev environment doesn't hang.
    if (code !== 0) {
      if (serverProcess && serverProcess.pid && serverProcess.pid !== child.pid) serverProcess.kill()
      if (viteProcess && viteProcess.pid && viteProcess.pid !== child.pid) viteProcess.kill()
    }
  })
  return child
}

async function fetchWithTimeout(url, { timeoutMs = 750, ...options } = {}) {
  const controller = new AbortController()
  const t = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } finally {
    clearTimeout(t)
  }
}

function healthUrlForPort(port) {
  return `http://localhost:${port}/api/health`
}

async function isHealthyBackend(port) {
  try {
    const res = await fetchWithTimeout(healthUrlForPort(port), { method: 'GET' })
    return Boolean(res?.ok)
  } catch {
    return false
  }
}

async function isPortFree(port, timeoutMs = 250) {
  // If we can connect, something is already listening.
  // If we get ECONNREFUSED (or timeout), assume it's free enough to try.
  return await new Promise((resolve) => {
    const socket = new net.Socket()
    const done = (free) => {
      try {
        socket.destroy()
      } catch {
        // ignore
      }
      resolve(free)
    }

    const t = setTimeout(() => done(true), timeoutMs)
    socket.once('connect', () => {
      clearTimeout(t)
      done(false)
    })
    socket.once('error', () => {
      clearTimeout(t)
      done(true)
    })
    socket.connect(port, '127.0.0.1')
  })
}

async function pickFreePort(startPort) {
  for (let i = 0; i < MAX_PORT_PROBES; i++) {
    const port = startPort + i
    if (await isPortFree(port)) return port
  }
  return startPort
}

async function waitForBackendReady(child, port, timeoutMs) {
  const start = Date.now()
  let exited = null
  const onExit = (code) => {
    exited = code ?? 0
  }
  child.once('exit', onExit)
  // eslint-disable-next-line no-console
  console.log(`Waiting for backend to become healthy at ${healthUrlForPort(port)}...`)
  while (Date.now() - start < timeoutMs) {
    if (exited !== null) {
      child.removeListener('exit', onExit)
      throw new Error(`Backend exited before becoming healthy (port ${port}, exit code ${exited}).`)
    }
    try {
      const res = await fetchWithTimeout(healthUrlForPort(port), { method: 'GET', timeoutMs: 750 })
      if (res.ok) return
    } catch {
      // ignore until backend is up
    }
    await new Promise((r) => setTimeout(r, 250))
  }
  child.removeListener('exit', onExit)
  throw new Error(`Backend did not start. Expected ${healthUrlForPort(port)} to respond.`)
}

const serverEntry = path.join(rootDir, 'server', 'index.js')
const viteBin = path.join(
  rootDir,
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'vite.cmd' : 'vite'
)

async function main() {
  // Always start a fresh backend on a free port. This avoids accidentally reusing
  // a stale process on :5000 that "looks healthy" to Node but is blocked by browser CORS.
  const port = await pickFreePort(DEFAULT_PORT)

  const child = spawnProcess(process.execPath, [serverEntry], {
    env: { ...process.env, PORT: String(port) },
  })
  serverProcess = child

  await waitForBackendReady(child, port, PER_PORT_STARTUP_TIMEOUT_MS)

  viteProcess = spawnProcess(
    viteBin,
    [],
    process.platform === 'win32'
      ? { shell: true, env: { ...process.env, VITE_API_BASE: `http://localhost:${port}` } }
      : { env: { ...process.env, VITE_API_BASE: `http://localhost:${port}` } }
  )
}

function shutdown() {
  if (viteProcess && !viteProcess.killed) viteProcess.kill()
  if (serverProcess && !serverProcess.killed) serverProcess.kill()
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
process.on('exit', shutdown)

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err)
  shutdown()
  process.exit(1)
})

