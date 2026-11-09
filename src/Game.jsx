import { useEffect, useState } from 'react'

const ABILITIES = [
  ['lock', 'LOCK'],
  ['break', 'BOOST'],
  ['blind', 'BLIND'],
]

function Kit({ abilities }) {
  return (
    <p className="kit">
      {ABILITIES.map(([key, label]) => (
        <span key={key} className={abilities[key] ? '' : 'spent'}>{label}</span>
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
  onRematch,
  onLeave,
}) {
  const [armed, setArmed] = useState(null)
  const partner = you === 'p1' ? 'p2' : 'p1'
  const partnerHere = mode !== 'online' || Boolean(presence?.[partner])
  const canPlay = view.phase === 'play' && view.turn === you && partnerHere && !pending
  const mine = you === 'p1' || you === 'p2' ? view.abilities[you] : view.abilities[view.turn]

  useEffect(() => {
    setArmed(null)
  }, [view.serial, view.turn])

  function play(delta) {
    if (!canPlay) return
    if (view.locked && delta !== 1) return
    const ability = delta === 4 ? null : armed
    setArmed(null)
    onDelta(delta, ability)
  }

  useEffect(() => {
    function onKey(event) {
      if (event.repeat) return
      const tag = event.target?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (!canPlay) return
      if (event.key === '1') play(1)
      if (event.key === '2') play(2)
      if (event.key === '3') play(3)
      if (event.key === '4') play(4)
      if (event.key.toLowerCase() === 'l' && mine.lock) setArmed((current) => (current === 'lock' ? null : 'lock'))
      if (event.key.toLowerCase() === 'b' && mine.blind) setArmed((current) => (current === 'blind' ? null : 'blind'))
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
  else if (view.phase === 'play' && view.locked) note = '+1 だけ'

  const voted = Boolean(rematch?.[you])
  const otherVoted = Boolean(rematch?.[partner])

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
              <Kit abilities={view.abilities[seat]} />
            </article>
          ))}
        </div>

        <p className="sr-only" aria-live="polite">{status}</p>

        <p className="digit" key={view.serial} aria-hidden="true">{view.blinded ? '？' : view.current}</p>
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
            <div className="moves">
              {[1, 2, 3].map((delta) => (
                <button
                  key={delta}
                  type="button"
                  disabled={!canPlay || (view.locked && delta !== 1)}
                  onClick={() => play(delta)}
                >
                  +{delta}
                </button>
              ))}
            </div>
            <div className="abilities">
              <button
                type="button"
                className={`${armed === 'lock' ? 'on' : ''} ${mine.lock ? '' : 'spent'}`}
                disabled={!canPlay || !mine.lock}
                onClick={() => setArmed((current) => (current === 'lock' ? null : 'lock'))}
              >
                LOCK
              </button>
              <button
                type="button"
                className={mine.break ? '' : 'spent'}
                disabled={!canPlay || !mine.break || view.locked}
                onClick={() => play(4)}
              >
                BOOST
              </button>
              <button
                type="button"
                className={`${armed === 'blind' ? 'on' : ''} ${mine.blind ? '' : 'spent'}`}
                disabled={!canPlay || !mine.blind}
                onClick={() => setArmed((current) => (current === 'blind' ? null : 'blind'))}
              >
                BLIND
              </button>
            </div>
          </footer>
        )}

        <div className="board-gap below" />
      </section>
    </main>
  )
}
