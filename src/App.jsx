import { useEffect, useRef, useState } from 'react'
import { applyMove, chooseAbility, createGame, createRematch, viewFor } from '../shared/rules.js'
import { cueFrom, getMuted, play, setMuted } from './audio.js'
import { Game } from './Game.jsx'
import { Connecting, Handoff, Lobby, RulesDialog, Title } from './menu.jsx'
import { useRoom } from './online.js'

export function App() {
  const online = useRoom()
  const [panel, setPanel] = useState('home')
  const [rules, setRules] = useState(false)
  const [game, setGame] = useState(null)
  const [handoff, setHandoff] = useState(false)
  const [muted, setMutedState] = useState(getMuted)
  const gameRef = useRef(null)
  const heard = useRef(null)
  const accepting = useRef(true)

  const localView = panel === 'local' && game
    ? { view: viewFor(game, game.turn), you: game.turn, hotseat: true, hold: handoff && game.phase !== 'over' }
    : null
  const onlineView = online.mode === 'game' && online.view
    ? { view: online.view, you: online.you, hotseat: false, hold: false }
    : null
  const shown = onlineView || localView

  useEffect(() => {
    if (!shown) {
      heard.current = null
      return
    }
    if (shown.hold) return
    const cue = cueFrom(heard.current, shown.view, { you: shown.you, hotseat: shown.hotseat })
    heard.current = shown.view
    if (cue) play(cue)
  }, [shown])

  function toggleMute() {
    const next = !muted
    setMuted(next)
    setMutedState(next)
  }

  function startLocal(names) {
    const next = createGame({ starter: 'p1', names })
    gameRef.current = next
    accepting.current = true
    setGame(next)
    setHandoff(false)
    setPanel('local')
  }

  function commitMove(delta, ability) {
    if (!accepting.current) return
    const current = gameRef.current
    if (!current || current.phase !== 'play') return
    const actor = current.turn
    let result = applyMove(current, actor, delta)
    if (!result.ok) return
    if (result.state.phase === 'ability') {
      const choice = ability === 'lock' || ability === 'blind' ? ability : 'skip'
      result = chooseAbility(result.state, actor, choice)
      if (!result.ok) return
    }
    gameRef.current = result.state
    setGame(result.state)
    accepting.current = false
    if (result.state.phase !== 'over') setHandoff(true)
  }

  function rematchLocal() {
    const next = createRematch(gameRef.current)
    gameRef.current = next
    accepting.current = false
    setGame(next)
    setHandoff(true)
  }

  function leaveLocal() {
    gameRef.current = null
    setGame(null)
    setHandoff(false)
    setPanel('home')
  }

  let body
  if (online.mode === 'connecting') {
    body = <Connecting onCancel={online.leave} />
  } else if (online.mode === 'lobby') {
    body = (
      <Lobby
        code={online.code}
        names={online.names}
        onLeave={online.leave}
        onRules={() => setRules(true)}
      />
    )
  } else if (online.mode === 'game' && online.view) {
    body = (
      <Game
        view={online.view}
        you={online.you}
        mode="online"
        presence={online.presence}
        rematch={online.rematch}
        pending={online.pending}
        muted={muted}
        error={online.error}
        onToggleMute={toggleMute}
        onRules={() => setRules(true)}
        onDelta={online.move}
        onRematch={online.voteRematch}
        onLeave={online.leave}
      />
    )
  } else if (panel === 'local' && game && handoff && game.phase !== 'over') {
    const blinded = game.incoming?.type === 'blind' && game.incoming.target === game.turn
    const locked = game.incoming?.type === 'lock' && game.incoming.target === game.turn
    body = (
      <Handoff
        name={game.names[game.turn]}
        number={blinded ? null : game.current}
        locked={locked}
        onReady={() => {
          accepting.current = true
          setHandoff(false)
        }}
        onRules={() => setRules(true)}
      />
    )
  } else if (panel === 'local' && game) {
    body = (
      <Game
        view={viewFor(game, game.turn)}
        you={game.phase === 'over' ? null : game.turn}
        mode="local"
        presence={null}
        rematch={null}
        pending={false}
        muted={muted}
        error=""
        onToggleMute={toggleMute}
        onRules={() => setRules(true)}
        onDelta={commitMove}
        onRematch={rematchLocal}
        onLeave={leaveLocal}
      />
    )
  } else {
    body = (
      <Title
        error={online.error}
        canRestore={online.canRestore}
        onLocal={startLocal}
        onCreate={online.create}
        onJoin={online.join}
        onRestore={online.restore}
        onRules={() => setRules(true)}
      />
    )
  }

  return (
    <>
      {body}
      {rules && <RulesDialog onClose={() => setRules(false)} />}
    </>
  )
}
