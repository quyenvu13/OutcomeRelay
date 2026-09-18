import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'

const port = Number(process.env.PORT || 4173)
const rpc = 'https://studio.genlayer.com/api'
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' }

createServer(async (req, res) => {
  if (req.url === '/api/rpc') {
    let body = ''
    for await (const chunk of req) body += chunk
    const upstream = await fetch(rpc, { method: 'POST', headers: { 'content-type': 'application/json', 'user-agent': 'OutcomeRelay/1.1' }, body })
    res.writeHead(upstream.status, { 'content-type': upstream.headers.get('content-type') || 'application/json', 'access-control-allow-origin': '*' })
    res.end(Buffer.from(await upstream.arrayBuffer()))
    return
  }
  const raw = req.url === '/' ? '/index.html' : req.url.split('?')[0]
  const safe = normalize(raw).replace(/^(\.\.[/\\])+/, '')
  const path = join(process.cwd(), 'dist', safe)
  try {
    const data = await readFile(path)
    res.writeHead(200, { 'content-type': types[extname(path)] || 'application/octet-stream' })
    res.end(data)
  } catch {
    res.writeHead(200, { 'content-type': types['.html'] })
    res.end(await readFile(join(process.cwd(), 'dist/index.html')))
  }
}).listen(port, () => console.log(`OutcomeRelay: http://127.0.0.1:${port}`))
