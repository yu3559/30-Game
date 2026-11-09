import {
  applyMove,
  chooseAbility,
  createGame,
  createRematch,
  viewFor,
} from './rules.js'

let failed = 0

function assert(cond, msg) {
  if (!cond) {
    failed += 1
    console.error('FAIL:', msg)
  }
}

function push(state, delta, ability = 'skip') {
  const seat = state.turn
  let result = applyMove(state, seat, delta)
  if (!result.ok) throw new Error(result.error)
  if (result.state.phase === 'ability') {
    result = chooseAbility(result.state, seat, ability)
    if (!result.ok) throw new Error(result.error)
  }
  return result.state
}

const original = createGame()
const frozen = structuredClone(original)
applyMove(original, 'p1', 1)
assert(JSON.stringify(original) === JSON.stringify(frozen), 'applyMove mutates the previous state')

assert(!applyMove(createGame(), 'p2', 1).ok, 'p2 cannot move first')
assert(!applyMove(createGame(), 'p1', 5).ok, 'delta 5 is illegal')

{
  let state = createGame()
  const moved = applyMove(state, 'p1', 1)
  assert(moved.ok && moved.state.phase === 'ability', 'a normal move opens the ability window')
  assert(moved.state.current === 1, 'move lands on 1')
  assert(!applyMove(moved.state, 'p1', 1).ok, 'cannot move again during the ability window')
  const locked = chooseAbility(moved.state, 'p1', 'lock')
  assert(locked.state.turn === 'p2', 'lock passes the turn')
  assert(locked.state.incoming?.type === 'lock', 'lock is queued for the opponent')
  assert(locked.state.abilities.p1.lock === false, 'lock is spent')
  assert(!applyMove(locked.state, 'p2', 2).ok, 'locked player cannot take +2')
  assert(!applyMove(locked.state, 'p2', 4).ok, 'locked player cannot break')
  const forced = applyMove(locked.state, 'p2', 1)
  assert(forced.ok && forced.state.current === 2, 'locked player can take +1')
}

{
  const broken = applyMove(createGame(), 'p1', 4)
  assert(broken.ok && broken.state.phase === 'play', 'break does not open another ability')
  assert(broken.state.current === 4, 'break adds 4')
  assert(broken.state.turn === 'p2', 'break ends the turn')
  assert(broken.state.abilities.p1.break === false, 'break is spent')
  assert(broken.state.log[0].ability === 'break', 'log records break')
}

{
  let state = createGame()
  const moved = applyMove(state, 'p1', 2)
  const blinded = chooseAbility(moved.state, 'p1', 'blind')
  state = blinded.state
  const hidden = viewFor(state, 'p2')
  const shown = viewFor(state, 'p1')
  assert(hidden.blinded === true && hidden.current === null && hidden.log === null, 'target is masked')
  assert(shown.current === 2 && shown.blinded === false, 'caster still sees the number')
  assert(hidden.abilities.p1.blind === false, 'spent blind stays public')
  const raw = JSON.stringify(hidden)
  assert(!raw.includes('"current":2') && !raw.includes('"to":2'), 'masked view has no digits from the position')

  const during = applyMove(state, 'p2', 1)
  assert(during.state.phase === 'ability' && during.state.current === 3, 'blinded turn can still move')
  const stillHidden = viewFor(during.state, 'p2')
  assert(stillHidden.current === null && stillHidden.blinded === true, 'mask lasts through the ability choice')
  const revealed = viewFor(chooseAbility(during.state, 'p2', 'skip').state, 'p2')
  assert(revealed.blinded === false && revealed.current === 3, 'mask lifts when the turn ends')
}

{
  let state = push(createGame(), 1)
  state = push(state, 1)
  while (state.current < 29 && state.phase === 'play') {
    if (state.turn === 'p2') state = push(state, 1)
    else state = push(state, (1 - (state.current % 4) + 4) % 4)
  }
  assert(state.current === 29 && state.turn === 'p2', 'classic line leaves 29 for p2')
  const bust = applyMove(state, 'p2', 1)
  assert(bust.state.phase === 'over' && bust.state.current === 30, '30 loses')
  assert(bust.state.loser === 'p2' && bust.state.winner === 'p1', 'the player who reaches 30 loses')
  assert(bust.state.abilities.p2.lock === true, 'a bust does not spend lock or blind')
  const broke = applyMove(state, 'p2', 4)
  assert(broke.state.current === 33 && broke.state.phase === 'over', 'break can bust')
  assert(broke.state.abilities.p2.break === false, 'a breaking move spends break even if it busts')
}

{
  let state = createGame()
  state = push(state, 1, 'lock')
  assert(!chooseAbility(state, 'p2', 'lock').ok, 'cannot choose an ability outside the window')
  const again = applyMove(state, 'p2', 1)
  state = chooseAbility(again.state, 'p2', 'skip').state
  const window = applyMove(state, 'p1', 1)
  assert(!chooseAbility(window.state, 'p1', 'lock').ok, 'spent lock cannot be used again')
}

{
  const next = createRematch(createGame({ starter: 'p1' }))
  assert(next.starter === 'p2' && next.turn === 'p2' && next.current === 0, 'rematch swaps the starter')
}

{
  const state = chooseAbility(applyMove(createGame(), 'p1', 3).state, 'p1', 'skip').state
  assert(state.current === 3 && state.turn === 'p2' && state.abilities.p1.lock, 'skip spends nothing')
}

if (failed) {
  console.error(`${failed} failed`)
  process.exit(1)
}

console.log('rules ok')
