import { WebSocket } from 'ws'
import { createGame } from '../shared/rules.js'
import { startServer } from './index.mjs'

let failed = 0

function assert(cond, msg) {
  if (!cond) {
    failed += 1
    console.error('FAIL:', msg)
  }
}

function connect(port) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`)
    const messages = []
    ws.on('message', (data) => messages.push(JSON.parse(data.toString())))
    ws.on('error', reject)
    ws.on('open', () => resolve({
      ws,
      messages,
      send(payload) {
        ws.send(JSON.stringify(payload))
      },
    }))
  })
}

function waitFor(messages, pred, timeout = 2000) {
  return new Promise((resolve, reject) => {
    const start = Date.now()
    const timer = setInterval(() => {
      for (let i = messages.length - 1; i >= 0; i -= 1) {
        if (pred(messages[i])) {
          clearInterval(timer)
          resolve(messages[i])
          return
        }
      }
      if (Date.now() - start > timeout) {
        clearInterval(timer)
        reject(new Error(`timeout ${JSON.stringify(messages)}`))
      }
    }, 15)
  })
}

function cardId(view, type) {
  return view.hands[view.you].find((card) => card.type === type)?.id
}

const server = await startServer({
  port: 0,
  host: '127.0.0.1',
  create: (options) => createGame({
    ...options,
    order: [
      'blind', 'lock', 'boost',
      'lock', 'boost', 'back',
      'hush', 'twin', 'twin', 'same', 'same', 'back',
      'mask', 'mask', 'seal', 'seal', 'trade', 'trade', 'hush', 'blind',
    ],
  }),
})

try {
  const host = await connect(server.port)
  const guest = await connect(server.port)
  host.send({ type: 'create', name: '先手' })
  const hello = await waitFor(host.messages, (msg) => msg.type === 'hello')
  assert(hello.you === 'p1' && hello.code.length === 4, 'host receives a room code')

  guest.send({ type: 'join', code: hello.code, name: '後手' })
  const opening = await waitFor(guest.messages, (msg) => msg.type === 'state')
  assert(opening.state.current === 0 && opening.state.turn === 'p1', 'game starts at 0')

  const guestMark = guest.messages.length
  host.send({ type: 'move', delta: 2 })
  const hostAbility = await waitFor(host.messages, (msg) => msg.type === 'state' && msg.state.phase === 'ability')
  const guestPending = await waitFor(
    guest.messages,
    (msg) => msg.type === 'state' && guest.messages.indexOf(msg) >= guestMark,
  )
  assert(hostAbility.state.current === 2, 'actor sees the number they just made')
  assert(guestPending.state.current === 0 && guestPending.state.phase === 'play', 'opponent keeps the previous number')
  assert(!JSON.stringify(guestPending).includes('"current":2'), 'pending payload hides the new number')

  host.send({ type: 'ability', choice: cardId(hostAbility.state, 'blind') })
  const masked = await waitFor(guest.messages, (msg) => msg.type === 'state' && msg.state.blinded === true)
  const caster = await waitFor(host.messages, (msg) => msg.type === 'state' && msg.state.turn === 'p2')
  assert(masked.state.current === null && masked.state.log === null, 'blind hides the board')
  assert(caster.state.current === 2 && caster.state.blinded === false, 'caster keeps the number')
  const maskedRaw = JSON.stringify(masked)
  assert(!maskedRaw.includes('"current":2') && !maskedRaw.includes('"to":2'), 'blind payload does not leak digits')
  assert(caster.state.hands.p1.some((card) => card.type === 'hush'), 'using blind draws a replacement')
  assert(masked.state.hands.p1.some((card) => card.type === 'hush'), 'the opponent can see the drawn card')

  const hostMark = host.messages.length
  guest.send({ type: 'move', delta: 2 })
  const hiddenChoice = await waitFor(
    guest.messages,
    (msg) => msg.type === 'state' && msg.state.phase === 'ability' && msg.state.blinded === true,
  )
  assert(hiddenChoice.state.current === null, 'the blinded player cannot see the result while choosing')
  const during = await waitFor(
    host.messages,
    (msg) => msg.type === 'state' && host.messages.indexOf(msg) >= hostMark,
  )
  assert(during.state.current === 2, 'caster still sees the number from before the blind move')
  assert(!JSON.stringify(during).includes('"to":4'), 'the blinded move is withheld')

  guest.send({ type: 'ability', choice: 'skip' })
  const revealed = await waitFor(
    guest.messages,
    (msg) => msg.type === 'state' && msg.state.current === 4 && msg.state.turn === 'p1',
  )
  assert(revealed.state.blinded === false, 'the number returns after the blind turn')

  host.send({ type: 'move', delta: 1 })
  const lockWindow = await waitFor(host.messages, (msg) => msg.type === 'state' && msg.state.phase === 'ability')
  host.send({ type: 'ability', choice: cardId(lockWindow.state, 'lock') })
  await waitFor(guest.messages, (msg) => msg.type === 'state' && msg.state.locked === true && msg.state.phase === 'play')
  const errorMark = guest.messages.length
  guest.send({ type: 'move', delta: 3 })
  const illegal = await waitFor(
    guest.messages,
    (msg) => msg.type === 'error' && guest.messages.indexOf(msg) >= errorMark,
  )
  assert(/LOCK/.test(illegal.message), 'server rejects a locked +3')
  guest.send({ type: 'move', delta: 1 })
  const accepted = await waitFor(
    guest.messages,
    (msg) => msg.type === 'state' && msg.state.phase === 'ability' && msg.state.current === 6,
  )
  assert(accepted.state.locked === true, 'locked +1 is accepted')
} catch (error) {
  failed += 1
  console.error('FAIL:', error)
} finally {
  await server.close()
}

if (failed) {
  console.error(`${failed} failed`)
  process.exit(1)
}

console.log('online ok')
