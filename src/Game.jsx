import { useEffect, useState } from 'react'
import { ABILITY_INFO } from '../shared/rules.js'

function lastOpponentDelta(log, seat) {
  if (!log) return null
  for (let i = log.length - 1; i >= 0; i -= 1) {
    if (log[i].player !== seat) return log[i].delta
  }
  return null
}

function Hand({ cards }) {
  if (cards == null) return <p className="kit">非表示</p>
  if (cards.length === 0) return <p className="kit">なし</p>
  return (
    <p className="kit">
      {cards.map((card) => (
        <span key={card.id}>{ABILITY_INFO[card.type].label}</span>
      ))}
    </p>
  )
}

export function Game({
  view,
  you,
  mode,
  presence,
  rematch,
  pending,
  muted,
  error,
  onToggleMute,
  onRules,
  onDelta,
  onAbility,
  onRematch,
  onLeave,
}) {
  const [armed, setArmed] = useState(null)
  const [give, setGive] = useState(null)
  const [take, setTake] = useState(null)
  const partner = you === 'p1' ? 'p2' : 'p1'
  const partnerHere = mode !== 'online' || Boolean(presence?.[partner])
  const canPlay = view.phase === 'play' && view.turn === you && partnerHere && !pending
  const canResolve = view.phase === 'ability' && view.turn === you && partnerHere && !pending
  const mine = you ? view.hands?.[you] : null
  const theirs = you ? view.hands?.[partner] : null
  const echoed = lastOpponentDelta(view.log, you)
  const heldBack = view.hushed || view.locked || view.twin != null

  useEffect(() => {
    setArmed(null)
    setGive(null)
    setTake(null)
  }, [view.serial, view.turn])

  function playNumber(delta) {
    if (!canPlay) return
    if (view.locked && delta !== 1) return
    if (view.twin != null && delta !== view.twin) return
    if (armed?.type === 'seal' && !take) return
    if (armed?.type === 'trade' && (!give || !take)) return
    onDelta({
      delta,
      card: armed?.id,
      target: take?.id,
      give: give?.id,
      take: take?.id,
    })
  }

  function playCard(card) {
    if (!canPlay || heldBack) return
    onDelta({ card: card.id })
  }

  useEffect(() => {
    function onKey(event) {
      if (event.repeat) return
      const tag = event.target?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (!canPlay) return
      if (event.key === '1') playNumber(1)
      if (event.key === '2') playNumber(2)
      if (event.key === '3') playNumber(3)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const status = view.blinded
    ? `${view.names[view.turn]}の番。数字は隠されています。`
    : `${view.names[view.turn]}の番。現在は ${view.current}。`

  let note = ''
  if (!partnerHere && view.phase !== 'over') note = '相手の接続を待っています'
  else if (pending && view.turn === you) note = '送信しています'
  else if (view.phase === 'play' && view.turn !== you) note = '相手の番です'
  else if (view.blinded) note = '数字は隠されています'
  else if (view.masked) note = '相手の能力は隠されています'
  else if (view.phase === 'play' && view.locked) note = '+1 だけ'
  else if (view.phase === 'play' && view.twin != null) note = `+${view.twin} だけ`
  else if (view.phase === 'play' && view.hushed) note = '能力は使えません'

  const voted = Boolean(rematch?.[you])
  const otherVoted = Boolean(rematch?.[partner])
  const needsTarget = armed?.type === 'seal' || armed?.type === 'trade'
  const numbersLocked = needsTarget && (armed.type === 'seal' ? !take : !give || !take)

  return (
    <main className="page">
      <section className="frame board">
        <header className="topbar">
          <p className="brand">30</p>
          <div className="top-actions">
            <button type="button" onClick={onRules}>ルール</button>
            <button type="button" onClick={onToggleMute}>{muted ? '音オフ' : '音オン'}</button>
            <button type="button" onClick={onLeave}>退出</button>
          </div>
        </header>

        <div className="players">
          {['p1', 'p2'].map((seat) => (
            <article key={seat} className={`player ${view.turn === seat && view.phase !== 'over' ? 'active' : ''}`}>
              <div className="player-top">
                <strong>{view.names[seat]}</strong>
                {seat === you && <em>あなた</em>}
              </div>
              <Hand cards={view.hands?.[seat]} />
            </article>
          ))}
        </div>

        <p className="sr-only" aria-live="polite">{status}</p>
        <p className="digit" key={view.serial} aria-hidden="true">{view.blinded ? '？' : view.current}</p>
        <p className="note">山札 {view.deck}</p>
        {note && <p className="note">{note}</p>}
        {error && <p className="note">{error}</p>}

        <div className="board-gap above" />

        {view.phase === 'over' ? (
          <section className="result">
            <h2>{view.names[view.loser]}の負け</h2>
            <p>{view.names[view.winner]}の勝ち</p>
            {mode === 'online' ? (
              <>
                <button type="button" className="filled" disabled={voted} onClick={onRematch}>
                  {voted ? '同意済み' : 'もう一局'}
                </button>
                {voted && !otherVoted && <p className="note">相手の同意を待っています</p>}
                {!voted && otherVoted && <p className="note">相手が再戦を待っています</p>}
              </>
            ) : (
              <button type="button" className="filled" onClick={onRematch}>もう一局</button>
            )}
            <button type="button" onClick={onLeave}>タイトルへ</button>
          </section>
        ) : (
          <footer className="dock">
            {canResolve && (
              <button type="button" onClick={() => onAbility('skip')}>能力を使わない</button>
            )}
            {canPlay && (
              <>
                <div className="moves">
                  {[1, 2, 3].map((delta) => (
                    <button
                      key={delta}
                      type="button"
                      disabled={(view.locked && delta !== 1) || (view.twin != null && delta !== view.twin) || numbersLocked}
                      onClick={() => playNumber(delta)}
                    >
                      +{delta}
                    </button>
                  ))}
                </div>
                {!heldBack && (
                  <div className="abilities">
                    {(mine || []).map((card) => {
                      const info = ABILITY_INFO[card.type]
                      const hiddenTarget = (card.type === 'seal' || card.type === 'trade') && !theirs
                      const noCopy = card.type === 'same' && view.log && echoed == null
                      const noBack = card.type === 'back' && view.current === 0
                      if (info.timing === 'move') {
                        return (
                          <button
                            key={card.id}
                            type="button"
                            disabled={hiddenTarget || noCopy || noBack}
                            onClick={() => playCard(card)}
                          >
                            {info.label}
                          </button>
                        )
                      }
                      return (
                        <button
                          key={card.id}
                          type="button"
                          className={armed?.id === card.id ? 'on' : ''}
                          disabled={hiddenTarget}
                          onClick={() => {
                            setGive(null)
                            setTake(null)
                            setArmed((current) => (current?.id === card.id ? null : card))
                          }}
                        >
                          {info.label}
                        </button>
                      )
                    })}
                  </div>
                )}
                {armed?.type === 'seal' && (
                  <div className="abilities">
                    {(theirs || []).map((card) => (
                      <button
                        key={card.id}
                        type="button"
                        className={take?.id === card.id ? 'on' : ''}
                        onClick={() => setTake(card)}
                      >
                        {ABILITY_INFO[card.type].label}
                      </button>
                    ))}
                  </div>
                )}
                {armed?.type === 'trade' && (
                  <>
                    <div className="abilities">
                      {(mine || []).filter((card) => card.id !== armed.id).map((card) => (
                        <button
                          key={card.id}
                          type="button"
                          className={give?.id === card.id ? 'on' : ''}
                          onClick={() => setGive(card)}
                        >
                          渡す {ABILITY_INFO[card.type].label}
                        </button>
                      ))}
                    </div>
                    <div className="abilities">
                      {(theirs || []).map((card) => (
                        <button
                          key={card.id}
                          type="button"
                          className={take?.id === card.id ? 'on' : ''}
                          onClick={() => setTake(card)}
                        >
                          受け取る {ABILITY_INFO[card.type].label}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </>
            )}
          </footer>
        )}

        <div className="board-gap below" />
      </section>
    </main>
  )
}
