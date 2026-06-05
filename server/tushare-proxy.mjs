import { createServer } from 'node:http'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

const DEFAULT_PORT = 8787
const DEFAULT_UPSTREAM = 'https://api.tushare.pro'
const RATE_LIMIT_WINDOW_MS = 60_000
const RATE_LIMIT_MAX = 60
const CACHE_TTL_MS = 5 * 60_000

function loadEnvFile(fileName) {
  const fullPath = resolve(process.cwd(), fileName)
  if (!existsSync(fullPath)) return
  const raw = readFileSync(fullPath, 'utf-8')
  for (const line of raw.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const idx = trimmed.indexOf('=')
    if (idx < 0) continue
    const key = trimmed.slice(0, idx).trim()
    const value = trimmed.slice(idx + 1).trim().replace(/^"|"$/g, '')
    if (!process.env[key]) process.env[key] = value
  }
}

loadEnvFile('.env')
loadEnvFile('.env.local')

const PORT = Number(process.env.TUSHARE_PROXY_PORT || DEFAULT_PORT)
const UPSTREAM_URL = process.env.TUSHARE_UPSTREAM_URL || DEFAULT_UPSTREAM
const SERVER_TOKEN = process.env.TUSHARE_TOKEN || ''

const ipBuckets = new Map()
const responseCache = new Map()

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  })
  res.end(JSON.stringify(payload))
}

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for']
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim()
  }
  return req.socket.remoteAddress || 'unknown'
}

function allowRequest(ip) {
  const now = Date.now()
  const bucket = ipBuckets.get(ip) || { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS }
  if (now > bucket.resetAt) {
    bucket.count = 0
    bucket.resetAt = now + RATE_LIMIT_WINDOW_MS
  }
  bucket.count += 1
  ipBuckets.set(ip, bucket)
  return bucket.count <= RATE_LIMIT_MAX
}

async function readJsonBody(req) {
  const chunks = []
  for await (const chunk of req) {
    chunks.push(chunk)
  }
  const raw = Buffer.concat(chunks).toString('utf-8')
  if (!raw) return {}
  return JSON.parse(raw)
}

function makeCacheKey(body) {
  return JSON.stringify({
    api_name: body.api_name,
    params: body.params || {},
    fields: body.fields || '',
    hasToken: Boolean(body.token || SERVER_TOKEN),
  })
}

async function callUpstream(body, retries = 2) {
  let lastError = null
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const token = body.token || SERVER_TOKEN
      if (!token) {
        return { status: 400, json: { code: -1, msg: '代理未配置 TUSHARE_TOKEN，且请求未携带 token' } }
      }

      const response = await fetch(UPSTREAM_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_name: body.api_name,
          token,
          params: body.params || {},
          fields: body.fields || '',
        }),
      })

      const text = await response.text()
      let json
      try {
        json = JSON.parse(text)
      } catch {
        json = { code: -1, msg: `上游返回非 JSON: ${text.slice(0, 200)}` }
      }

      if (response.status >= 500 || response.status === 429) {
        if (attempt < retries) {
          await new Promise((resolveWait) => setTimeout(resolveWait, 300 * (attempt + 1)))
          continue
        }
      }

      return { status: response.status, json }
    } catch (error) {
      lastError = error
      if (attempt < retries) {
        await new Promise((resolveWait) => setTimeout(resolveWait, 300 * (attempt + 1)))
        continue
      }
    }
  }

  return {
    status: 502,
    json: {
      code: -1,
      msg: `代理请求失败: ${lastError instanceof Error ? lastError.message : '未知错误'}`,
    },
  }
}

const server = createServer(async (req, res) => {
  if (req.method === 'GET' && (req.url === '/health' || req.url === '/api/tushare/health')) {
    sendJson(res, 200, {
      ok: true,
      hasServerToken: Boolean(SERVER_TOKEN),
    })
    return
  }

  if (req.method === 'POST' && req.url === '/api/tushare/proxy') {
    const ip = getClientIp(req)
    if (!allowRequest(ip)) {
      sendJson(res, 429, { code: -1, msg: '请求过于频繁，请稍后重试' })
      return
    }

    let body
    try {
      body = await readJsonBody(req)
    } catch {
      sendJson(res, 400, { code: -1, msg: '请求体不是合法 JSON' })
      return
    }

    if (!body.api_name) {
      sendJson(res, 400, { code: -1, msg: '缺少 api_name' })
      return
    }

    const key = makeCacheKey(body)
    const now = Date.now()
    const cached = responseCache.get(key)
    if (cached && cached.expiresAt > now) {
      sendJson(res, 200, cached.value)
      return
    }

    const upstream = await callUpstream(body)
    const statusCode = upstream.status >= 200 && upstream.status < 300 ? 200 : upstream.status

    if (statusCode === 200 && upstream.json && upstream.json.code === 0) {
      responseCache.set(key, { expiresAt: now + CACHE_TTL_MS, value: upstream.json })
    }

    sendJson(res, statusCode, upstream.json)
    return
  }

  sendJson(res, 404, { code: -1, msg: 'Not Found' })
})

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[tushare-proxy] listening on http://localhost:${PORT}`)
  // eslint-disable-next-line no-console
  console.log(`[tushare-proxy] upstream: ${UPSTREAM_URL}`)
})
