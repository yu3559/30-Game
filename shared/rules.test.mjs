import {
  applyMove,
  chooseAbility,
  createGame,
  createRematch,
  freshDeck,
  viewFor,
} from './rules.js'

let failed = 0

function assert(cond, msg) {
  if (!cond) {
    failed += 1
    console.error('FAIL:', msg)
  }
}

function order(...front) {
  const bag = freshDeck()
  const used = []
  for (const type of front) {
    const index = bag.indexOf(type)
    if (index < 0) throw new Error(`missing ${type}`)
    used.push(bag.splice(index, 1)[0])
  }
  return [...used, ...bag]
}

function game(...front) {
  return createGame({ order: order(...front) })
}

function idOf(state, seat, type) {
  return state.hands[seat].find((card) => card.type === type).id
}

function push(state, input, ability) {
  const seat = state.turn
  let result = applyMove(state, seat, input)
  if (!result.ok) throw new Error(result.error)
  if (result.state.phase === 'ability') {
    const choice = ability?.card || 'skip'
    result = chooseAbility(result.state, seat, choice, ability || {})
    if (!result.ok) throw new Error(result.error)
  }
  return result.state
}

const dealt = order('boost', 'lock', 'blind', 'back', 'same', 'twin')
const original = createGame({ order: dealt })
const frozen = structuredClone(original)
applyMove(original, 'p1', 1)
assert(JSON.stringify(original) === JSON.stringify(frozen), 'applyMove leaves the previous state unchanged')

assert(original.hands.p1.length === 3 && original.hands.p2.length === 3, 'each player is dealt 3')
assert(original.deck.length === 14, 'the rest of the deck stays shared')
assert(original.deck.at(-1).type === dealt[6], 'the next draw is the seventh card')

assert(!applyMove(game(), 'p2', 1).ok, 'p2 cannot move first')
assert(!applyMove(game(), 'p1', 4).ok, 'a plain +4 is not a move')
assert(!applyMove(game(), 'p1', { card: 'missing' }).ok, 'an absent card is rejected')

{
  let state = game('boost', 'lock', 'blind', 'back', 'same', 'twin')
  const moved = applyMove(state, 'p1', 1)
  assert(moved.ok && moved.state.phase === 'ability', 'a normal move opens the ability window')
  assert(!applyMove(moved.state, 'p1', 1).ok, 'cannot move again during the ability window')
  const locked = chooseAbility(moved.state, 'p1', idOf(moved.state, 'p1', 'lock'))
  assert(locked.ok && locked.state.turn === 'p2', 'lock passes the turn')
  assert(locked.state.incoming?.type === 'lock', 'lock is queued')
  assert(!locked.state.hands.p1.some((card) => card.type === 'lock'), 'lock leaves the hand')
  assert(locked.state.hands.p1.filter((card) => card.type === 'boost').length === 2, 'lock draws the next card')
  assert(locked.state.deck.length === 13, 'the deck shrinks by one')
  assert(!applyMove(locked.state, 'p2', 2).ok, 'locked player cannot take +2')
  assert(!applyMove(locked.state, 'p2', { card: idOf(locked.state, 'p2', 'back') }).ok, 'locked player cannot use a card')
  const forced = applyMove(locked.state, 'p2', 1)
  assert(forced.ok && forced.state.current === 2, 'locked player can take +1')
}

{
  let state = game('boost', 'seal', 'blind', 'lock', 'same', 'twin')
  const before = state.deck.length
  const played = applyMove(state, 'p1', { card: idOf(state, 'p1', 'boost') })
  assert(played.ok && played.state.phase === 'play', 'boost does not open another ability')
  assert(played.state.current === 4 && played.state.turn === 'p2', 'boost adds 4 and ends the turn')
  assert(played.state.log[0].ability === 'boost', 'log records boost')
  assert(played.state.hands.p1.length === 3, 'boost is replaced from the deck')
  assert(played.state.deck.length === before - 1, 'boost draws one card')
  assert(played.state.discard[0].type === 'boost', 'the used card is discarded')
  const again = applyMove(played.state, 'p2', 1)
  const skipped = chooseAbility(again.state, 'p2', 'skip')
  assert(skipped.state.deck.length === played.state.deck.length, 'skip does not draw')
}

{
  let state = game('boost', 'lock', 'blind', 'back', 'same', 'twin')
  state = push(state, { card: idOf(state, 'p1', 'boost') })
  const drawn = state.hands.p1.at(-1).id
  state = push(state, 1)
  assert(state.turn === 'p1', 'the turn comes back')
  const replay = applyMove(state, 'p1', { card: drawn })
  assert(replay.ok, 'a drawn card can be used on a later turn')
}

{
  let state = game('blind', 'lock', 'boost', 'back', 'same', 'twin')
  const moved = applyMove(state, 'p1', 2)
  const blinded = chooseAbility(moved.state, 'p1', idOf(moved.state, 'p1', 'blind'))
  state = blinded.state
  const hidden = viewFor(state, 'p2')
  const shown = viewFor(state, 'p1')
  assert(hidden.blinded && hidden.current === null && hidden.log === null, 'blind hides the number and the log')
  assert(shown.current === 2 && shown.blinded === false, 'the caster still sees the number')
  assert(hidden.hands.p1.some((card) => card.type !== 'blind'), 'the caster hand stays visible during blind')
  const raw = JSON.stringify(hidden)
  assert(!raw.includes('"current":2') && !raw.includes('"to":2'), 'a blind view does not contain the new number')
  const during = applyMove(state, 'p2', 1)
  assert(viewFor(during.state, 'p2').current === null, 'blind lasts through the ability choice')
  const revealed = viewFor(chooseAbility(during.state, 'p2', 'skip').state, 'p2')
  assert(revealed.blinded === false && revealed.current === 3, 'blind ends with the turn')
}

{
  let state = game('mask', 'lock', 'boost', 'back', 'seal', 'twin')
  state = chooseAbility(applyMove(state, 'p1', 1).state, 'p1', idOf(state, 'p1', 'mask')).state
  const hidden = viewFor(state, 'p2')
  const shown = viewFor(state, 'p1')
  assert(hidden.masked && hidden.hands.p1 === null, 'mask hides the caster hand')
  assert(shown.hands.p1.length === 3, 'the caster still sees the drawn hand')
  assert(!JSON.stringify(hidden).includes('boost'), 'a masked view does not list the hidden card')
}

{
  let state = game('hush', 'lock', 'boost', 'boost', 'back', 'twin')
  state = chooseAbility(applyMove(state, 'p1', 1).state, 'p1', idOf(state, 'p1', 'hush')).state
  const deck = state.deck.length
  const hand = state.hands.p2.length
  assert(!applyMove(state, 'p2', { card: idOf(state, 'p2', 'boost') }).ok, 'hush blocks cards')
  const moved = applyMove(state, 'p2', 2)
  assert(moved.ok && moved.state.phase === 'play' && moved.state.turn === 'p1', 'hush skips the ability window')
  assert(moved.state.deck.length === deck && moved.state.hands.p2.length === hand, 'a hushed turn does not draw')
}

{
  let state = game('twin', 'lock', 'blind', 'back', 'same', 'boost')
  state = chooseAbility(applyMove(state, 'p1', 3).state, 'p1', idOf(state, 'p1', 'twin')).state
  assert(state.incoming.delta === 3, 'twin remembers the amount')
  assert(!applyMove(state, 'p2', 1).ok, 'twin rejects a different number')
  assert(applyMove(state, 'p2', 3).ok, 'twin accepts the same number')
}

{
  let state = game('back', 'lock', 'blind', 'same', 'boost', 'twin')
  assert(!applyMove(state, 'p1', { card: idOf(state, 'p1', 'back') }).ok, 'back cannot pass below 0')
  state = push(state, 2)
  state = push(state, 1)
  const backed = applyMove(state, 'p1', { card: idOf(state, 'p1', 'back') })
  assert(backed.ok && backed.state.current === 2, 'back subtracts 1')
}

{
  let state = game('same', 'lock', 'blind', 'back', 'boost', 'twin')
  assert(!applyMove(state, 'p1', { card: idOf(state, 'p1', 'same') }).ok, 'same needs a previous move')
  state = push(state, 1)
  state = push(state, 1)
  const copied = applyMove(state, 'p1', { card: idOf(state, 'p1', 'same') })
  assert(copied.ok && copied.state.current === 3, 'same copies the opponent amount of 1')
}

{
  let state = game('seal', 'lock', 'blind', 'boost', 'back', 'twin')
  const moved = applyMove(state, 'p1', 1)
  assert(!chooseAbility(moved.state, 'p1', idOf(moved.state, 'p1', 'seal'), {}).ok, 'seal needs a target')
  const sealed = chooseAbility(moved.state, 'p1', idOf(moved.state, 'p1', 'seal'), {
    target: idOf(moved.state, 'p2', 'boost'),
  })
  assert(sealed.ok, 'seal removes the chosen card')
  assert(!sealed.state.hands.p2.some((card) => card.type === 'boost'), 'the target leaves the opponent hand')
  assert(sealed.state.hands.p2.length === 2, 'the opponent does not draw after being sealed')
  assert(sealed.state.hands.p1.length === 3, 'the player who sealed draws')
  assert(sealed.state.discard.some((card) => card.type === 'boost'), 'the sealed card is discarded')
}

{
  let state = game('trade', 'lock', 'blind', 'boost', 'back', 'twin')
  const moved = applyMove(state, 'p1', 1)
  const traded = chooseAbility(moved.state, 'p1', idOf(moved.state, 'p1', 'trade'), {
    give: idOf(moved.state, 'p1', 'lock'),
    take: idOf(moved.state, 'p2', 'boost'),
  })
  assert(traded.ok, 'trade exchanges one card each')
  assert(traded.state.hands.p1.some((card) => card.type === 'boost'), 'p1 receives the chosen card')
  assert(traded.state.hands.p2.some((card) => card.type === 'lock'), 'p2 receives the offered card')
  assert(!traded.state.hands.p1.some((card) => card.type === 'trade'), 'trade itself is discarded')
  assert(traded.state.hands.p1.length === 3 && traded.state.hands.p2.length === 3, 'only the player who traded draws')
}

{
  let state = createGame({
    order: ['lock', 'blind', 'mask', 'back', 'same', 'twin', ...Array(14).fill('hush')],
  })
  while (state.deck.length > 0 && state.phase === 'play') {
    if (state.turn === 'p1') {
      const card = state.hands.p1.find((item) => item.type === 'lock' || item.type === 'blind' || item.type === 'mask' || item.type === 'hush')
      state = push(state, 1, { card: card.id })
    } else state = push(state, 1)
  }
  assert(state.deck.length === 0 && state.phase === 'play', 'the deck can be emptied by use')
  if (state.turn !== 'p1') state = push(state, 1)
  const hand = state.hands.p1.length
  const card = state.hands.p1.find((item) => item.type === 'hush' || item.type === 'lock' || item.type === 'blind' || item.type === 'mask')
  state = push(state, 1, { card: card.id })
  assert(state.hands.p1.length === hand - 1, 'an empty deck does not replace the spent card')
}

{
  let state = game('lock', 'blind', 'boost', 'back', 'same', 'twin')
  while (state.current < 29 && state.phase === 'play') {
    state = push(state, 1)
  }
  const bust = applyMove(state, state.turn, 1)
  assert(bust.state.phase === 'over' && bust.state.loser === state.turn, 'reaching 30 loses')
  assert(bust.state.hands[state.turn].length === 3, 'a plain bust spends no card')
}

{
  let state = game('boost', 'lock', 'blind', 'back', 'same', 'twin')
  while (state.current < 27) state = push(state, state.turn === 'p1' ? 3 : 1)
  if (state.turn !== 'p1') state = push(state, 1)
  const bust = applyMove(state, 'p1', { card: idOf(state, 'p1', 'boost') })
  assert(bust.state.phase === 'over' && bust.state.current >= 30, 'boost can lose')
  assert(bust.state.discard[0]?.type === 'boost', 'a losing boost is still discarded')
  assert(!bust.state.hands.p1.some((card) => card.id === idOf(state, 'p1', 'boost')), 'the losing card is gone')
}

{
  const next = createRematch(createGame({ starter: 'p1', names: { p1: '甲', p2: '乙' } }))
  assert(next.starter === 'p2' && next.turn === 'p2' && next.current === 0, 'rematch swaps the starter')
  assert(next.names.p1 === '甲' && next.hands.p1.length === 3 && next.deck.length === 14, 'rematch deals a new deck')
}

if (failed) {
  console.error(`${failed} failed`)
  process.exit(1)
}

console.log('rules ok')
