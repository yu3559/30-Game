// phase: 'play' | 'ability' | 'over'
// incoming: これから手番を迎える側に掛かっている LOCK / BLIND
// ability 中は手番を渡さない。BLIND 中なら、その手番が終わるまで数字を隠す。
// オンラインでは、手番が終わるまで相手に新しい数字を送らない（server 側）。

export const LIMIT = 30
export const ABILITY_KEYS = ['lock', 'break', 'blind']

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

function freshAbilities() {
  return { lock: true, break: true, blind: true }
}

export function createGame({ starter = 'p1', names } = {}) {
  return {
    current: 0,
    turn: starter,
    starter,
    names: {
      p1: cleanName(names?.p1, 'プレイヤー1'),
      p2: cleanName(names?.p2, 'プレイヤー2'),
    },
    abilities: {
      p1: freshAbilities(),
      p2: freshAbilities(),
    },
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

export function activeConstraint(state) {
  if (state.phase === 'over' || !state.incoming) return null
  if (state.incoming.target !== state.turn) return null
  return state.incoming.type
}

function fail(error) {
  return { ok: false, error }
}

export function applyMove(state, seat, delta) {
  if (state.phase !== 'play') return fail('今はその操作はできません')
  if (seat !== 'p1' && seat !== 'p2') return fail('不正なプレイヤーです')
  if (seat !== state.turn) return fail('相手のターンです')
  if (![1, 2, 3, 4].includes(delta)) return fail('選べない数です')

  const constraint = activeConstraint(state)
  if (constraint === 'lock' && delta !== 1) return fail('LOCK中は +1 しか選べません')
  if (delta === 4 && !state.abilities[seat].break) return fail('BREAK はもう使えません')

  const from = state.current
  const to = from + delta
  const next = structuredClone(state)
  next.serial += 1
  if (delta === 4) next.abilities[seat].break = false
  next.current = to
  next.log = [
    ...next.log,
    {
      id: next.serial,
      player: seat,
      delta,
      from,
      to,
      ability: delta === 4 ? 'break' : null,
    },
  ]

  if (to >= LIMIT) {
    next.incoming = null
    next.phase = 'over'
    next.loser = seat
    next.winner = opponent(seat)
    return { ok: true, state: next }
  }

  const canReact = delta !== 4 && (next.abilities[seat].lock || next.abilities[seat].blind)
  if (canReact) {
    next.phase = 'ability'
    return { ok: true, state: next }
  }

  next.incoming = null
  next.turn = opponent(seat)
  next.phase = 'play'
  return { ok: true, state: next }
}

export function chooseAbility(state, seat, choice) {
  if (state.phase !== 'ability') return fail('今は能力を選べません')
  if (seat !== state.turn) return fail('相手のターンです')
  if (choice !== 'lock' && choice !== 'blind' && choice !== 'skip') {
    return fail('不明な能力です')
  }
  if ((choice === 'lock' || choice === 'blind') && !state.abilities[seat][choice]) {
    return fail('その能力はもう使えません')
  }

  const next = structuredClone(state)
  next.serial += 1

  if (choice === 'lock' || choice === 'blind') {
    next.abilities[seat][choice] = false
    const log = next.log.slice()
    const last = log[log.length - 1]
    log[log.length - 1] = { ...last, ability: choice }
    next.log = log
    next.incoming = { type: choice, target: opponent(seat) }
  } else {
    next.incoming = null
  }

  next.turn = opponent(seat)
  next.phase = 'play'
  return { ok: true, state: next }
}

export function viewFor(state, seat) {
  const constraint = activeConstraint(state)
  const blinded = constraint === 'blind' && seat === state.turn
  return {
    current: blinded ? null : state.current,
    turn: state.turn,
    starter: state.starter,
    names: { ...state.names },
    abilities: {
      p1: { ...state.abilities.p1 },
      p2: { ...state.abilities.p2 },
    },
    log: blinded ? null : state.log.map((entry) => ({ ...entry })),
    incoming: state.incoming ? { ...state.incoming } : null,
    phase: state.phase,
    winner: state.winner,
    loser: state.loser,
    serial: state.serial,
    you: seat,
    blinded,
    locked: constraint === 'lock' && seat === state.turn,
  }
}
