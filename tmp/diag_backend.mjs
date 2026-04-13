import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')

function loadEnv() {
  const env = {}
  try {
    const raw = fs.readFileSync(path.join(rootDir, '.env'), 'utf8')
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      if (trimmed.startsWith('$env:')) {
        const m = trimmed.match(/^\$env:(\w+)=(?:"([^"]*)"|'([^']*)'|(.*))$/)
        if (m) env[m[1]] = m[2] ?? m[3] ?? m[4] ?? ''
      } else {
        const idx = trimmed.indexOf('=')
        if (idx !== -1) {
          env[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, '')
        }
      }
    }
  } catch {}
  return env
}

async function test() {
  const env = loadEnv()
  const port = 5009
  console.log(`Starting backend on port ${port}...`)
  
  const child = spawn(process.execPath, [path.join(rootDir, 'server', 'index.js')], {
    cwd: rootDir,
    env: { ...process.env, ...env, PORT: String(port) },
    stdio: 'pipe'
  })

  child.stdout.on('data', (d) => console.log(`[BACKEND STDOUT] ${d.toString().trim()}`))
  child.stderr.on('data', (d) => console.log(`[BACKEND STDERR] ${d.toString().trim()}`))

  const start = Date.now()
  const timeout = 30000
  
  while (Date.now() - start < timeout) {
    try {
      console.log(`Pinging http://localhost:${port}/api/health...`)
      const res = await fetch(`http://localhost:${port}/api/health`)
      console.log(`Response: ${res.status} ${res.ok}`)
      if (res.ok) {
        console.log('SUCCESS: Backend is healthy!')
        child.kill()
        process.exit(0)
      }
    } catch (err) {
      console.log(`Ping failed: ${err.message}`)
    }
    await new Promise(r => setTimeout(r, 1000))
  }

  console.log('FAILED: Backend did not become healthy in 30s.')
  child.kill()
  process.exit(1)
}

test()
