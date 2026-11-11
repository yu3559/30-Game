// phase: 'play' | 'ability' | 'over'
// incoming: これから手番を迎える側に掛かっている制約
// 手札は3枚。使ったカードは捨て、山札が残っていれば1枚引く。
// 引いたカードは、その解決が終わるまで使えない。
// ability 中は手番を渡さない。BLIND 中なら、その手番が終わるまで数字を隠す。
// MASK 中なら、使った側の残り能力を相手の手番が終わるまで送らない。

export const LIMIT = 30
export const HAND_SIZE = 3
export const COPIES = 2

export const ABILITY_INFO = {
  boost: { label: 'BOOST', timing: 'move', kind: 'move', text: '手の代わりに +4 で進みます。' },
  back: { label: 'BACK', timing: 'move', kind: 'move', text: '手の代わりに -1 で戻ります。0未満にはなりません。' },
  same: { label: 'SAME', timing: 'move', kind: 'move', text: '相手が直前に進めた数と同じだけ進みます。' },
  lock: { label: 'LOCK', timing: 'after', kind: 'bind', text: '相手の次の手は +1 だけになります。' },
  twin: { label: 'TWIN', timing: 'after', kind: 'bind', text: '相手の次の手は、今自分が進めた数と同じになります。' },
  hush: { label: 'HUSH', timing: 'after', kind: 'bind', text: '相手は次の手で能力を使えません。' },
  blind: { label: 'BLIND', timing: 'after', kind: 'veil', text: '相手の次の1ターン、今の数字と履歴が隠されます。' },
  mask: { label: 'MASK', timing: 'after', kind: 'veil', text: '相手の次の1ターン、自分の残り能力が見えません。' },
  seal: { label: 'SEAL', timing: 'after', kind: 'hand', text: '相手の残り能力を一つ捨てさせます。相手は引きません。' },
  trade: { label: 'TRADE', timing: 'after', kind: 'hand', text: '自分の残り一つと、相手の残り一つを交換します。' },
}

export const ABILITY_KEYS = Object.keys(ABILITY_INFO)

export function opponent(seat) {
  return seat === 'p1' ? 'p2' : 'p1'
}

export function cleanName(value, fallback) {
  const text = String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .slice(0, 12)
  return text || fallback
}

export function freshDeck() {
  const types = []
  for (const type of ABILITY_KEYS) {
    for (let copy = 0; copy < COPIES; copy += 1) types.push(type)
  }
  return types
}

function shuffle(list, random) {
  const next = list.slice()
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1))
    const swap = next[i]
    next[i] = next[j]
    next[j] = swap
  }
  return next
}

function cardsFrom(types) {
  return types.map((type, index) => ({ id: `${index}-${type}`, type }))
}

export function createGame({ starter = 'p1', names, order, random = Math.random } = {}) {
  const types = order ? order.slice() : shuffle(freshDeck(), random)
  if (types.length !== freshDeck().length || types.some((type) => !ABILITY_INFO[type])) {
    throw new Error('山札の内容が不正です')
  }
  const cards = cardsFrom(types)
  const deck = cards.slice(HAND_SIZE * 2).reverse()
  return {
    current: 0,
    turn: starter,
    starter,
    names: {
      p1: cleanName(names?.p1, 'プレイヤー1'),
      p2: cleanName(names?.p2, 'プレイヤー2'),
    },
    hands: {
      p1: cards.slice(0, HAND_SIZE),
      p2: cards.slice(HAND_SIZE, HAND_SIZE * 2),
    },
    deck,
    discard: [],
    log: [],
    incoming: null,
    phase: 'play',
    winner: null,
    loser: null,
    serial: 0,
  }
}

export function createRematch(prev) {
  return createGame({
    starter: opponent(prev.starter),
    names: prev.names,
  })
}

function fail(error) {
  return { ok: false, error }
}

function constraint(state) {
  if (state.phase === 'over' || !state.incoming) return null
  if (state.incoming.target !== state.turn) return null
  return state.incoming
}

function findCard(hand, id) {
  return hand.find((card) => card.id === id) || null
}

function takeCard(hand, id) {
  const index = hand.findIndex((card) => card.id === id)
  if (index < 0) return null
  return hand.splice(index, 1)[0]
}

function opponentDelta(state, seat) {
  for (let i = state.log.length - 1; i >= 0; i -= 1) {
    if (state.log[i].player !== seat) return state.log[i].delta
  }
  return null
}

function draw(state, seat) {
  if (state.deck.length === 0) return null
  const card = state.deck.pop()
  state.hands[seat].push(card)
  return card
}

function hasAfter(hand) {
  return hand.some((card) => ABILITY_INFO[card.type].timing === 'after')
}

function finish(next, seat, { bust = false, react = false } = {}) {
  if (bust) {
    next.incoming = null
    next.phase = 'over'
    next.loser = seat
    next.winner = opponent(seat)
    return
  }
  if (react) {
    next.phase = 'ability'
    return
  }
  next.incoming = null
  next.turn = opponent(seat)
  next.phase = 'play'
}

function moveAmount(state, seat, type) {
  if (type === 'boost') return 4
  if (type === 'back') {
    if (state.current <= 0) return fail('0からは戻れません')
    return -1
  }
  const delta = opponentDelta(state, seat)
  if (delta == null) return fail('相手の手がまだありません')
  if (state.current + delta < 0) return fail('0未満にはできません')
  return delta
}

export function applyMove(state, seat, input) {
  if (state.phase !== 'play') return fail('今はその操作はできません')
  if (seat !== 'p1' && seat !== 'p2') return fail('不正なプレイヤーです')
  if (seat !== state.turn) return fail('相手のターンです')

  const cardId = input && typeof input === 'object' ? input.card : null
  const plain = cardId ? null : input
  if (!cardId && ![1, 2, 3].includes(plain)) return fail('選べない数です')

  const active = constraint(state)
  if (cardId && active && (active.type === 'hush' || active.type === 'lock' || active.type === 'twin')) {
    return fail('今は能力を使えません')
  }
  if (!cardId && active?.type === 'lock' && plain !== 1) return fail('LOCK中は +1 しか選べません')
  if (!cardId && active?.type === 'twin' && plain !== active.delta) {
    return fail(`このターンは +${active.delta} だけです`)
  }

  const next = structuredClone(state)
  let delta = plain
  let ability = null
  if (cardId) {
    if (typeof cardId !== 'string') return fail('不明な能力です')
    const card = findCard(next.hands[seat], cardId)
    if (!card) return fail('その能力は持っていません')
    if (ABILITY_INFO[card.type].timing !== 'move') return fail('その能力は数字を選んだあとに使います')
    const amount = moveAmount(next, seat, card.type)
    if (amount && amount.ok === false) return amount
    delta = amount
    ability = card.type
    next.discard.push(takeCard(next.hands[seat], cardId))
  }

  const from = next.current
  const to = from + delta
  next.serial += 1
  next.current = to
  next.log = [
    ...next.log,
    {
      id: next.serial,
      player: seat,
      delta,
      from,
      to,
      ability,
    },
  ]

  const bust = to >= LIMIT
  if (ability && !bust) draw(next, seat)
  const react = !ability && !bust && active?.type !== 'hush' && hasAfter(next.hands[seat])
  finish(next, seat, { bust, react })
  return { ok: true, state: next }
}

export function chooseAbility(state, seat, choice, extra = {}) {
  if (state.phase !== 'ability') return fail('今は能力を選べません')
  if (seat !== state.turn) return fail('相手のターンです')
  if (choice === 'skip') {
    const next = structuredClone(state)
    next.serial += 1
    finish(next, seat)
    return { ok: true, state: next }
  }
  if (typeof choice !== 'string') return fail('不明な能力です')

  const held = findCard(state.hands[seat], choice)
  if (!held) return fail('その能力は持っていません')
  const info = ABILITY_INFO[held.type]
  if (!info || info.timing !== 'after') return fail('その能力は今は使えません')

  const foe = opponent(seat)
  if (held.type === 'seal' && !findCard(state.hands[foe], extra.target)) {
    return fail('捨てさせる能力を選んでください')
  }
  if (held.type === 'trade') {
    if (extra.give === choice || !findCard(state.hands[seat], extra.give)) {
      return fail('渡す能力を選んでください')
    }
    if (!findCard(state.hands[foe], extra.take)) return fail('受け取る能力を選んでください')
  }

  const next = structuredClone(state)
  next.serial += 1
  const card = takeCard(next.hands[seat], choice)
  next.discard.push(card)
  const played = next.log[next.log.length - 1].delta

  if (card.type === 'lock') next.incoming = { type: 'lock', target: foe }
  else if (card.type === 'twin') next.incoming = { type: 'twin', target: foe, delta: played }
  else if (card.type === 'hush') next.incoming = { type: 'hush', target: foe }
  else if (card.type === 'blind') next.incoming = { type: 'blind', target: foe }
  else if (card.type === 'mask') next.incoming = { type: 'mask', target: foe }
  else if (card.type === 'seal') {
    next.discard.push(takeCard(next.hands[foe], extra.target))
    next.incoming = null
  } else if (card.type === 'trade') {
    const mine = takeCard(next.hands[seat], extra.give)
    const theirs = takeCard(next.hands[foe], extra.take)
    next.hands[seat].push(theirs)
    next.hands[foe].push(mine)
    next.incoming = null
  }

  const log = next.log.slice()
  const last = log[log.length - 1]
  log[log.length - 1] = { ...last, ability: card.type }
  next.log = log
  draw(next, seat)
  next.turn = foe
  next.phase = 'play'
  return { ok: true, state: next }
}

function copyHand(cards) {
  return cards.map((card) => ({ id: card.id, type: card.type }))
}

export function viewFor(state, seat) {
  const active = constraint(state)
  const blinded = active?.type === 'blind' && seat === state.turn
  const masked = active?.type === 'mask' && seat === state.turn
  const foe = opponent(seat)
  return {
    current: blinded ? null : state.current,
    turn: state.turn,
    starter: state.starter,
    names: { ...state.names },
    hands: {
      [seat]: copyHand(state.hands[seat]),
      [foe]: masked ? null : copyHand(state.hands[foe]),
    },
    deck: state.deck.length,
    log: blinded ? null : state.log.map((entry) => ({ ...entry })),
    incoming: state.incoming ? { ...state.incoming } : null,
    phase: state.phase,
    winner: state.winner,
    loser: state.loser,
    serial: state.serial,
    you: seat,
    blinded,
    masked,
    locked: active?.type === 'lock' && seat === state.turn,
    twin: active?.type === 'twin' && seat === state.turn ? active.delta : null,
    hushed: active?.type === 'hush' && seat === state.turn,
  }
}
