import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { randomBytes, randomInt } from 'node:crypto'
import { existsSync, statSync, createReadStream } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { WebSocketServer } from 'ws'
import {
  applyMove,
  chooseAbility,
  cleanName,
  createGame,
  createRematch,
  viewFor,
} from '../shared/rules.js'

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
}

const moduleDir = path.dirname(fileURLToPath(import.meta.url))
const distDir = path.join(moduleDir, '..', 'dist')

function makeCode(rooms) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    let code = ''
    for (let i = 0; i < 4; i += 1) code += ALPHABET[randomInt(ALPHABET.length)]
    if (!rooms.has(code)) return code
  }
  return null
}

function send(ws, payload) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(payload))
}

function presenceOf(room) {
  return {
    p1: Boolean(room.players.p1.connected),
    p2: Boolean(room.players.p2.connected),
  }
}

function bothConnected(room) {
  return room.players.p1.connected && room.players.p2.connected
}

function lobbyPayload(room, seat) {
  return {
    type: 'lobby',
    you: seat,
    code: room.code,
    names: {
      p1: room.players.p1.name,
      p2: room.players.p2.name,
    },
    presence: presenceOf(room),
  }
}

function emit(room) {
  for (const seat of ['p1', 'p2']) {
    const player = room.players[seat]
    if (!player.connected || !player.socket) continue
    if (room.status !== 'playing' || !room.publicState) {
      send(player.socket, lobbyPayload(room, seat))
      continue
    }
    const pending = room.privateState && room.privateState.turn === seat
    const state = pending ? room.privateState : room.publicState
    send(player.socket, {
      type: 'state',
      presence: presenceOf(room),
      rematch: room.rematch,
      state: viewFor(state, seat),
    })
  }
}

function scheduleGc(ctx, room) {
  if (room.gc) clearTimeout(room.gc)
  room.gc = setTimeout(() => {
    const current = ctx.rooms.get(room.code)
    if (!current) return
    if (!current.players.p1.connected && !current.players.p2.connected) {
      ctx.rooms.delete(room.code)
    }
  }, 10 * 60 * 1000)
  room.gc.unref?.()
}

function release(ctx, ws, { explicit }) {
  const meta = ctx.sockets.get(ws)
  if (!meta) return
  const room = ctx.rooms.get(meta.code)
  ctx.sockets.delete(ws)
  if (!room) return
  const player = room.players[meta.seat]
  if (!player || player.socket !== ws) return

  if (room.privateState && room.privateState.turn === meta.seat) {
    const skipped = chooseAbility(room.privateState, meta.seat, 'skip')
    if (skipped.ok) {
      room.publicState = skipped.state
      room.privateState = null
    }
  }

  player.socket = null
  player.connected = false

  if (explicit) {
    for (const seat of ['p1', 'p2']) {
      const other = room.players[seat]
      if (seat !== meta.seat && other.socket) {
        send(other.socket, { type: 'abandoned' })
      }
    }
    if (room.gc) clearTimeout(room.gc)
    ctx.rooms.delete(room.code)
    return
  }

  emit(room)
  scheduleGc(ctx, room)
}

function bind(ctx, ws, room, seat, token) {
  const previous = room.players[seat].socket
  room.players[seat].socket = ws
  room.players[seat].connected = true
  room.players[seat].token = token
  ctx.sockets.set(ws, { code: room.code, seat })
  if (previous && previous !== ws) {
    ctx.sockets.delete(previous)
    previous.close()
  }
  if (room.gc) {
    clearTimeout(room.gc)
    room.gc = null
  }
}

function seatByToken(room, token) {
  if (room.players.p1.token && room.players.p1.token === token) return 'p1'
  if (room.players.p2.token && room.players.p2.token === token) return 'p2'
  return null
}

export function startServer({ port = 0, host = '127.0.0.1', serveStatic = false } = {}) {
  const ctx = {
    rooms: new Map(),
    sockets: new Map(),
  }

  const server = http.createServer((req, res) => {
    const url = new URL(req.url || '/', 'http://localhost')
    if (url.pathname === '/health') {
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify({ ok: true }))
      return
    }
    if (!serveStatic || req.method !== 'GET') {
      res.writeHead(404).end()
      return
    }
    serveFile(res, url.pathname)
  })

  const wss = new WebSocketServer({ server, path: '/ws' })

  wss.on('connection', (ws) => {
    ws.on('message', (data, isBinary) => {
      if (isBinary || data.length > 4000) return
      let msg
      try {
        msg = JSON.parse(data.toString())
      } catch {
        return
      }
      if (!msg || typeof msg !== 'object') return
      handle(ctx, ws, msg)
    })

    ws.on('close', () => release(ctx, ws, { explicit: false }))
  })

  return new Promise((resolve) => {
    server.listen(port, host, () => {
      const address = server.address()
      resolve({
        port: address.port,
        close() {
          for (const room of ctx.rooms.values()) {
            if (room.gc) clearTimeout(room.gc)
          }
          for (const client of wss.clients) client.close()
          wss.close()
          return new Promise((done) => server.close(() => done()))
        },
      })
    })
  })
}

function handle(ctx, ws, msg) {
  if (msg.type === 'create') {
    if (ctx.rooms.size > 500) {
      send(ws, { type: 'error', message: 'ルームがいっぱいです', fatal: true })
      return
    }
    const code = makeCode(ctx.rooms)
    if (!code) {
      send(ws, { type: 'error', message: 'ルームを作れませんでした', fatal: true })
      return
    }
    const token = randomBytes(18).toString('base64url')
    const room = {
      code,
      status: 'lobby',
      publicState: null,
      privateState: null,
      rematch: { p1: false, p2: false },
      gc: null,
      players: {
        p1: {
          token,
          name: cleanName(msg.name, 'プレイヤー1'),
          socket: null,
          connected: false,
        },
        p2: {
          token: null,
          name: 'プレイヤー2',
          socket: null,
          connected: false,
        },
      },
    }
    ctx.rooms.set(code, room)
    release(ctx, ws, { explicit: false })
    bind(ctx, ws, room, 'p1', token)
    send(ws, { type: 'hello', you: 'p1', code, token, name: room.players.p1.name })
    emit(room)
    return
  }

  if (msg.type === 'join') {
    const code = String(msg.code || '').trim().toUpperCase()
    const room = ctx.rooms.get(code)
    if (!room) {
      send(ws, { type: 'error', message: 'ルームが見つかりません', fatal: true })
      return
    }
    if (room.players.p2.token) {
      send(ws, { type: 'error', message: 'このルームは満席です', fatal: true })
      return
    }
    const token = randomBytes(18).toString('base64url')
    room.players.p2.name = cleanName(msg.name, 'プレイヤー2')
    release(ctx, ws, { explicit: false })
    bind(ctx, ws, room, 'p2', token)
    room.publicState = createGame({
      starter: 'p1',
      names: { p1: room.players.p1.name, p2: room.players.p2.name },
    })
    room.privateState = null
    room.rematch = { p1: false, p2: false }
    room.status = 'playing'
    send(ws, { type: 'hello', you: 'p2', code, token, name: room.players.p2.name })
    emit(room)
    return
  }

  if (msg.type === 'reconnect') {
    const code = String(msg.code || '').trim().toUpperCase()
    const room = ctx.rooms.get(code)
    const seat = room ? seatByToken(room, msg.token) : null
    if (!room || !seat) {
      send(ws, { type: 'error', message: '復帰できる対戦がありません', fatal: true })
      return
    }
    const token = room.players[seat].token
    release(ctx, ws, { explicit: false })
    bind(ctx, ws, room, seat, token)
    send(ws, {
      type: 'hello',
      you: seat,
      code,
      token,
      name: room.players[seat].name,
    })
    emit(room)
    return
  }

  const meta = ctx.sockets.get(ws)
  if (!meta) return
  const room = ctx.rooms.get(meta.code)
  if (!room) return

  if (msg.type === 'leave') {
    release(ctx, ws, { explicit: true })
    return
  }

  if (msg.type === 'move') {
    if (room.status !== 'playing' || !room.publicState) {
      send(ws, { type: 'error', message: 'まだ始まっていません' })
      return
    }
    if (!bothConnected(room)) {
      send(ws, { type: 'error', message: '相手の接続を待っています' })
      return
    }
    if (room.privateState) {
      send(ws, { type: 'error', message: '先に能力を選んでください' })
      return
    }
    const result = applyMove(room.publicState, meta.seat, msg.delta)
    if (!result.ok) {
      send(ws, { type: 'error', message: result.error })
      return
    }
    room.rematch = { p1: false, p2: false }
    if (result.state.phase === 'ability') room.privateState = result.state
    else room.publicState = result.state
    emit(room)
    return
  }

  if (msg.type === 'ability') {
    if (!room.privateState || room.privateState.turn !== meta.seat) {
      send(ws, { type: 'error', message: '今は能力を選べません' })
      return
    }
    const result = chooseAbility(room.privateState, meta.seat, msg.choice)
    if (!result.ok) {
      send(ws, { type: 'error', message: result.error })
      return
    }
    room.publicState = result.state
    room.privateState = null
    emit(room)
    return
  }

  if (msg.type === 'rematch') {
    if (room.publicState?.phase !== 'over' || room.privateState) return
    room.rematch[meta.seat] = true
    if (room.rematch.p1 && room.rematch.p2) {
      room.publicState = createRematch(room.publicState)
      room.privateState = null
      room.rematch = { p1: false, p2: false }
    }
    emit(room)
  }
}

function serveFile(res, pathname) {
  let requested = pathname === '/' ? '/index.html' : pathname
  try {
    requested = decodeURIComponent(requested)
  } catch {
    res.writeHead(400).end()
    return
  }
  const file = path.normalize(path.join(distDir, requested))
  if (!file.startsWith(distDir)) {
    res.writeHead(403).end()
    return
  }
  const target = existsSync(file) && statSync(file).isFile()
    ? file
    : path.join(distDir, 'index.html')
  if (!existsSync(target)) {
    res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' })
    res.end('dist がありません。npm run build を先に実行してください。')
    return
  }
  const ext = path.extname(target)
  res.writeHead(200, { 'content-type': MIME[ext] || 'application/octet-stream' })
  createReadStream(target).pipe(res)
}

function lanAddresses() {
  const found = []
  for (const list of Object.values(os.networkInterfaces())) {
    for (const net of list || []) {
      const v4 = net.family === 'IPv4' || net.family === 4
      if (v4 && !net.internal) found.push(net.address)
    }
  }
  return found
}

const isMain = process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href

if (isMain) {
  const serveStatic = process.argv.includes('--static')
  const port = Number(process.env.PORT) || 8787
  startServer({ port, host: '0.0.0.0', serveStatic }).then(() => {
    console.log(`WebSocket ポート ${port}`)
    if (serveStatic) {
      console.log(`このPC: http://localhost:${port}`)
      for (const address of lanAddresses()) {
        console.log(`同じWi-Fi: http://${address}:${port}`)
      }
    } else {
      console.log('開発中の画面は Vite の URL（ポート 5173）で開いてください')
    }
  })
}
