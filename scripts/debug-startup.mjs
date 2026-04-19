import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')

function loadEnvFile() {
  const env = {}
  try {
    const envPath = path.join(rootDir, '.env')
    if (!fs.existsSync(envPath)) return env
    const raw = fs.readFileSync(envPath, 'utf8')
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      if (trimmed.startsWith('$env:')) {
        const m = trimmed.match(/^\$env:(\w+)=(?:"([^"]*)"|'([^']*)'|(.*))$/)
        if (m) env[m[1]] = m[2] ?? m[3] ?? m[4] ?? ''
      } else {
        const idx = trimmed.indexOf('=')
        if (idx !== -1) {
          let k = trimmed.slice(0, idx).trim()
          let v = trimmed.slice(idx + 1).trim()
          if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
          env[k] = v
        }
      }
    }
  } catch (err) { console.error(err) }
  return env
}

async function debugStart() {
  const env = loadEnvFile()
  console.log('--- Environment Check ---')
  console.log('MONGODB_URI set:', Boolean(env.MONGODB_URI))
  console.log('--- Starting Server ---')
  
  const serverPath = path.join(rootDir, 'server', 'index.js')
  const child = spawn(process.execPath, [serverPath], {
    cwd: rootDir,
    env: { ...process.env, ...env, PORT: '5005' },
    stdio: 'pipe'
  })
  
  child.stdout.on('data', (d) => console.log(`[STDOUT] ${d}`))
  child.stderr.on('data', (d) => console.error(`[STDERR] ${d}`))
  
  const timeout = setTimeout(() => {
    console.error('Server timed out after 10s without listening message.')
    child.kill()
    process.exit(1)
  }, 10000)
  
  child.on('exit', (code) => {
    console.log(`Server exited with code ${code}`)
    process.exit(code || 0)
  })
}

debugStart()
