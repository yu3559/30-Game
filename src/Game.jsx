import { useEffect, useRef, useState } from 'react'

const SEALS = [
  ['lock', 'LOCK', '相手を +1 に固定'],
  ['break', 'BREAK', '+4 で進める'],
  ['blind', 'BLIND', '数字と履歴を隠す'],
]

function Icon({ name }) {
  if (name === 'lock') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="5" y="11" width="14" height="9" rx="2" />
        <path d="M8 11V8a4 4 0 0 1 8 0v3" />
      </svg>
    )
  }
  if (name === 'break') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M13 3 6 13h6l-1 8 8-12h-6l0-6z" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 12s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6z" />
      <path d="M4 19 20 5" />
    </svg>
  )
}

function Seals({ kit }) {
  return (
    <div className="seals">
      {SEALS.map(([key, label, detail]) => (
        <span
          key={key}
          className={kit[key] ? `seal ${key}` : `seal ${key} spent`}
          title={`${label} ${kit[key] ? '未使用' : '使用済み'}。${detail}`}
        >
          <Icon name={key} />
        </span>
      ))}
    </div>
  )
}

function Track({ value }) {
  if (value == null) {
    return (
      <div className="track is-hidden" aria-hidden="true">
        <span>0</span>
        <span>30</span>
      </div>
    )
  }
  const pct = Math.max(0, Math.min(100, (value / 30) * 100))
  return (
    <div className={value >= 27 ? 'track hot' : 'track'} aria-hidden="true">
      <div className="fill" style={{ width: `${pct}%` }} />
      <span>0</span>
      <span>30</span>
    </div>
  )
}

function hintText(view, you) {
  if (view.phase === 'over') return '30以上に到達しました'
  if (view.blinded) return '数字と履歴が隠されています。記憶を頼りに選んでください'
  if (view.turn !== you && view.incoming?.type === 'blind') return '相手には、数字と履歴が見えていません'
  if (view.turn !== you && view.incoming?.type === 'lock') return '相手は LOCK 中です。選べるのは +1 だけです'
  if (view.phase === 'play' && view.locked) return 'LOCK 中です。選べるのは +1 だけです'
  if (view.current >= 29) return 'どの手でも 30 以上になります'
  if (view.current >= 27) return '次の一手で 30 に届くかもしれません'
  return '30以上にした人が負け'
}

export function Game({
  view,
  you,
  mode,
  presence,
  rematch,
  pending,
  roomCode,
  muted,
  rulesOpen,
  error,
  onToggleMute,
  onDelta,
  onAbility,
  onRematch,
  onLeave,
  onRules,
}) {
  const [ask, setAsk] = useState(null)
  const logRef = useRef(null)
  const choiceRef = useRef(null)
  const partner = you === 'p1' ? 'p2' : 'p1'
  const partnerHere = mode !== 'online' || Boolean(presence?.[partner])
  const canPlay = view.phase === 'play' && view.turn === you && partnerHere && !pending
  const canChoose = view.phase === 'ability' && view.turn === you && partnerHere && !pending
  const kit = view.abilities[view.turn]

  useEffect(() => {
    setAsk(null)
  }, [view.serial, view.phase])

  useEffect(() => {
    const el = logRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [view.serial, view.blinded])

  useEffect(() => {
    if (canChoose) choiceRef.current?.focus()
  }, [canChoose])

  function request(delta) {
    if (!canPlay) return
    if (view.locked && delta !== 1) return
    if (delta === 4 && !kit.break) return
    if (delta === 4) {
      setAsk({ kind: 'break', delta })
      return
    }
    if (view.current != null && view.current + delta >= 30) {
      setAsk({ kind: 'bust', delta })
      return
    }
    onDelta(delta)
  }

  useEffect(() => {
    function onKey(event) {
      if (event.repeat || rulesOpen) return
      const tag = event.target?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (ask) {
        if (event.key === 'Escape') setAsk(null)
        return
      }
      if (canChoose) {
        if (event.key.toLowerCase() === 'l' && kit.lock) onAbility('lock')
        if (event.key.toLowerCase() === 'b' && kit.blind) onAbility('blind')
        return
      }
      if (!canPlay) return
      if (event.key === '1') request(1)
      if (event.key === '2') request(2)
      if (event.key === '3') request(3)
      if (event.key === '4') request(4)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const digitTone = view.blinded ? 'secret' : view.current >= 30 ? 'over' : view.current >= 27 ? 'hot' : ''
  const status = view.blinded
    ? `${view.names[view.turn]}の番。数字は隠されています。`
    : `${view.names[view.turn]}の番。現在は ${view.current}。`

  let waiting = null
  if (!partnerHere && view.phase !== 'over') waiting = '相手の接続を待っています'
  else if (pending && view.turn === you) waiting = '送信しています'
  else if (view.phase === 'play' && view.turn !== you) waiting = '相手の番です'

  const voted = Boolean(rematch?.[you])
  const otherVoted = Boolean(rematch?.[partner])

  return (
    <main className="page">
      <section className={`frame board ${view.blinded ? 'is-blind' : ''} ${view.locked ? 'is-lock' : ''}`}>
        <header className="topbar">
          <div>
            <p className="brand">30を言ったら負け</p>
            {mode === 'online' && roomCode && <p className="room-label">ルーム {roomCode}</p>}
          </div>
          <div className="top-actions">
            <button type="button" onClick={onRules}>ルール</button>
            <button type="button" onClick={onToggleMute}>{muted ? '音オフ' : '音オン'}</button>
            <button type="button" onClick={onLeave}>退出</button>
          </div>
        </header>

        <div className="players">
          {['p1', 'p2'].map((seat) => (
            <article key={seat} className={`player ${seat} ${view.turn === seat && view.phase !== 'over' ? 'active' : ''}`}>
              <div className="player-top">
                <strong>{view.names[seat]}</strong>
                {seat === you && <em>あなた</em>}
              </div>
              <Seals kit={view.abilities[seat]} />
              {view.starter === seat && <span className="badge">先手</span>}
            </article>
          ))}
        </div>

        <p className="sr-only" aria-live="polite">{status}</p>

        <section className="stage">
          <div className={`digit ${digitTone}`} key={view.serial} aria-hidden="true">
            {view.blinded ? '？' : view.current}
          </div>
          <p className="hint">{hintText(view, you)}</p>
          <Track value={view.blinded ? null : view.current} />
        </section>

        <ol className="log" ref={logRef}>
          {view.log == null && <li className="mask">履歴は隠されています</li>}
          {view.log && view.log.length === 0 && <li className="empty">まだ手は進んでいません</li>}
          {view.log?.map((entry) => (
            <li key={entry.id} className={`entry ${entry.player}`}>
              <span className="who">{view.names[entry.player]}</span>
              <span className="what">+{entry.delta}</span>
              {entry.ability && <span className={`tag ${entry.ability}`}>{entry.ability.toUpperCase()}</span>}
              <span className="landed">{entry.to}</span>
            </li>
          ))}
        </ol>

        {error && <p className="banner warn">{error}</p>}

        {view.phase === 'over' ? (
          <section className="result">
            <p className="eyebrow">決着</p>
            <h2>{view.names[view.loser]}の負け</h2>
            <p>{view.names[view.winner]}の勝ち</p>
            <p className="note">{view.current} に到達しました</p>
            {mode === 'online' ? (
              <>
                <button type="button" className="primary" disabled={voted} onClick={onRematch}>
                  {voted ? '同意済み' : 'もう一局'}
                </button>
                <p className="note">
                  {voted && !otherVoted && '相手の同意を待っています。'}
                  {!voted && otherVoted && '相手が再戦を待っています。'}
                  2人とも押すと、先手を交代して再開します。
                </p>
              </>
            ) : (
              <>
                <button type="button" className="primary" onClick={onRematch}>もう一局</button>
                <p className="note">先手を交代して再開します。</p>
              </>
            )}
            <button type="button" className="ghost" onClick={onLeave}>タイトルへ</button>
          </section>
        ) : (
          <footer className="dock">
            {ask && (
              <div className="ask">
                <p>
                  {ask.kind === 'break' && view.current == null && 'BREAK を使い、+4 します。この対戦ではもう使えません。'}
                  {ask.kind === 'break' && view.current != null && view.current + 4 >= 30
                    && `BREAK で ${view.current} から ${view.current + 4} になります。30以上なので、あなたの負けです。`}
                  {ask.kind === 'break' && view.current != null && view.current + 4 < 30
                    && `BREAK で ${view.current} から ${view.current + 4} へ進みます。この対戦ではもう使えません。`}
                  {ask.kind === 'bust' && view.current != null
                    && `+${ask.delta} すると ${view.current + ask.delta} になります。30以上なので、あなたの負けです。`}
                </p>
                <div className="ask-actions">
                  <button type="button" className="ghost" onClick={() => setAsk(null)}>やめる</button>
                  <button type="button" className="primary" onClick={() => { const delta = ask.delta; setAsk(null); onDelta(delta) }}>
                    進める
                  </button>
                </div>
              </div>
            )}

            {canChoose && !ask && (
              <div className="choice" ref={choiceRef} tabIndex={-1}>
                <h3>{view.blinded ? '数字は隠れたままです' : `${view.current} になりました`}</h3>
                <p>このターンに能力を1つ使えます。</p>
                {kit.lock && (
                  <button type="button" className="choice-btn lock" onClick={() => onAbility('lock')}>
                    <span>LOCK</span>
                    <small>相手の次の手を +1 だけにする</small>
                  </button>
                )}
                {kit.blind && (
                  <button type="button" className="choice-btn blind" onClick={() => onAbility('blind')}>
                    <span>BLIND</span>
                    <small>相手の次の手で、数字と履歴を隠す</small>
                  </button>
                )}
                <button type="button" className="ghost" onClick={() => onAbility('skip')}>能力を使わない</button>
              </div>
            )}

            {canPlay && !ask && (
              <div className="moves">
                {[1, 2, 3].map((delta) => {
                  const bust = view.current != null && view.current + delta >= 30
                  return (
                    <button
                      key={delta}
                      type="button"
                      className={bust ? 'move danger' : 'move'}
                      disabled={view.locked && delta !== 1}
                      onClick={() => request(delta)}
                    >
                      +{delta}
                      {view.current != null && <small>{bust ? '負け' : `→ ${view.current + delta}`}</small>}
                    </button>
                  )
                })}
                <button
                  type="button"
                  className="move break-btn"
                  disabled={!kit.break || view.locked}
                  onClick={() => request(4)}
                >
                  BREAK
                  <small>
                    {!kit.break && '使用済み'}
                    {kit.break && view.locked && '+4 は不可'}
                    {kit.break && !view.locked && view.current == null && '+4'}
                    {kit.break && !view.locked && view.current != null && (view.current + 4 >= 30 ? '負け' : `+4 → ${view.current + 4}`)}
                  </small>
                </button>
              </div>
            )}

            {!canPlay && !canChoose && waiting && <p className="waiting">{waiting}</p>}
          </footer>
        )}
      </section>
    </main>
  )
}
