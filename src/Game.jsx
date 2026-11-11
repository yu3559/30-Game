import { useEffect, useRef, useState } from 'react'
import { ABILITY_INFO } from '../shared/rules.js'

function signed(delta) {
  if (delta > 0) return `+${delta}`
  return String(delta)
}

function lastOpponentDelta(log, seat) {
  if (!log) return null
  for (let i = log.length - 1; i >= 0; i -= 1) {
    if (log[i].player !== seat) return log[i].delta
  }
  return null
}

function movePreview(type, current, echoed) {
  if (type === 'boost') return 4
  if (type === 'back') return -1
  if (type === 'same') return echoed
  return null
}

function Hand({ cards }) {
  if (cards == null) return <p className="hand is-hidden">非表示</p>
  if (cards.length === 0) return <p className="hand">なし</p>
  return (
    <div className="hand">
      {cards.map((card) => (
        <span key={card.id} className={`chip kind-${ABILITY_INFO[card.type].kind}`}>
          {ABILITY_INFO[card.type].label}
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
  if (view.masked) return '相手の残り能力は隠されています'
  if (view.turn !== you && view.incoming?.type === 'blind') return '相手には、数字と履歴が見えていません'
  if (view.turn !== you && view.incoming?.type === 'mask') return '相手には、あなたの残り能力が見えていません'
  if (view.turn !== you && view.incoming?.type === 'lock') return '相手は LOCK 中です。選べるのは +1 だけです'
  if (view.turn !== you && view.incoming?.type === 'twin') return `相手の次の手は +${view.incoming.delta} だけです`
  if (view.turn !== you && view.incoming?.type === 'hush') return '相手は次の手で能力を使えません'
  if (view.phase === 'play' && view.locked) return 'LOCK 中です。選べるのは +1 だけです'
  if (view.phase === 'play' && view.twin) return `このターンは +${view.twin} だけです`
  if (view.phase === 'play' && view.hushed) return 'このターンは能力を使えません'
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
  const [pick, setPick] = useState(null)
  const logRef = useRef(null)
  const choiceRef = useRef(null)
  const partner = you === 'p1' ? 'p2' : 'p1'
  const partnerHere = mode !== 'online' || Boolean(presence?.[partner])
  const canPlay = view.phase === 'play' && view.turn === you && partnerHere && !pending
  const canChoose = view.phase === 'ability' && view.turn === you && partnerHere && !pending
  const mine = you ? view.hands?.[you] : null
  const theirs = you ? view.hands?.[partner] : null
  const echoed = lastOpponentDelta(view.log, you)
  const numbersBlocked = view.locked || view.twin != null

  useEffect(() => {
    setAsk(null)
    setPick(null)
  }, [view.serial, view.phase])

  useEffect(() => {
    const el = logRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [view.serial, view.blinded])

  useEffect(() => {
    if (canChoose) choiceRef.current?.focus()
  }, [canChoose])

  function playMove(action, delta) {
    if (view.current != null && view.current + delta >= 30) {
      setAsk({ kind: 'bust', action, delta })
      return
    }
    onDelta(action)
  }

  function request(delta) {
    if (!canPlay) return
    if (view.locked && delta !== 1) return
    if (view.twin != null && delta !== view.twin) return
    playMove(delta, delta)
  }

  function requestCard(card) {
    if (!canPlay || view.hushed || numbersBlocked) return
    const info = ABILITY_INFO[card.type]
    if (info.timing !== 'move') return
    const delta = movePreview(card.type, view.current, echoed)
    if (card.type === 'back' && view.current === 0) return
    if (card.type === 'same' && delta == null && view.log) return
    if (delta == null) {
      onDelta({ card: card.id })
      return
    }
    if (view.current != null && view.current + delta < 0) return
    playMove({ card: card.id }, delta)
  }

  useEffect(() => {
    function onKey(event) {
      if (event.repeat || rulesOpen) return
      const tag = event.target?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (ask || pick) {
        if (event.key === 'Escape') {
          setAsk(null)
          setPick(null)
        }
        return
      }
      if (!canPlay) return
      if (event.key === '1') request(1)
      if (event.key === '2') request(2)
      if (event.key === '3') request(3)
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
  const moveCards = (mine || []).filter((card) => ABILITY_INFO[card.type].timing === 'move')
  const afterCards = (mine || []).filter((card) => ABILITY_INFO[card.type].timing === 'after')

  function cardLine(card) {
    const info = ABILITY_INFO[card.type]
    const delta = movePreview(card.type, view.current, echoed)
    if (card.type === 'same' && delta == null) return view.log ? 'まだ使えない' : '相手と同じ数'
    if (card.type === 'back' && view.current === 0) return '0からは不可'
    if (delta == null || view.current == null) return info.text
    const land = view.current + delta
    if (land < 0) return '0未満は不可'
    return land >= 30 ? '負け' : `${signed(delta)} → ${land}`
  }

  return (
    <main className="page">
      <section className={`frame board ${view.blinded ? 'is-blind' : ''} ${view.locked || view.twin != null ? 'is-lock' : ''}`}>
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
                <span className="player-marks">
                  {seat === you && <em>あなた</em>}
                  {view.starter === seat && <span className="badge">先手</span>}
                </span>
              </div>
              <Hand cards={view.hands[seat]} />
            </article>
          ))}
        </div>
        <p className="deck-count">山札 {view.deck}</p>

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
          {view.log?.map((entry) => {
            const info = entry.ability ? ABILITY_INFO[entry.ability] : null
            return (
              <li key={entry.id} className={`entry ${entry.player}`}>
                <span className="who">{view.names[entry.player]}</span>
                <span className="what">{signed(entry.delta)}</span>
                {info && <span className={`tag kind-${info.kind}`}>{info.label}</span>}
                <span className="landed">{entry.to}</span>
              </li>
            )
          })}
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
                  2人とも押すと、先手を交代して、山札を配り直します。
                </p>
              </>
            ) : (
              <>
                <button type="button" className="primary" onClick={onRematch}>もう一局</button>
                <p className="note">先手を交代して、山札を配り直します。</p>
              </>
            )}
            <button type="button" className="ghost" onClick={onLeave}>タイトルへ</button>
          </section>
        ) : (
          <footer className="dock">
            {ask && (
              <div className="ask">
                <p>
                  {signed(ask.delta)} すると {view.current + ask.delta} になります。30以上なので、あなたの負けです。
                </p>
                <div className="ask-actions">
                  <button type="button" className="ghost" onClick={() => setAsk(null)}>やめる</button>
                  <button type="button" className="primary" onClick={() => { const action = ask.action; setAsk(null); onDelta(action) }}>
                    進める
                  </button>
                </div>
              </div>
            )}

            {canChoose && !ask && pick?.step === 'take' && (
              <div className="choice">
                <h3>SEAL</h3>
                <p>相手のどの能力を捨てさせますか。</p>
                {(theirs || []).map((card) => (
                  <button
                    key={card.id}
                    type="button"
                    className={`choice-btn kind-${ABILITY_INFO[card.type].kind}`}
                    onClick={() => onAbility(pick.card.id, { target: card.id })}
                  >
                    <span>{ABILITY_INFO[card.type].label}</span>
                    <small>{ABILITY_INFO[card.type].text}</small>
                  </button>
                ))}
                <button type="button" className="ghost" onClick={() => setPick(null)}>戻る</button>
              </div>
            )}

            {canChoose && !ask && pick?.step === 'give' && (
              <div className="choice">
                <h3>TRADE</h3>
                <p>相手に渡す自分の能力を選んでください。</p>
                {afterCards.filter((card) => card.id !== pick.card.id).concat(moveCards).map((card) => (
                  <button
                    key={card.id}
                    type="button"
                    className={`choice-btn kind-${ABILITY_INFO[card.type].kind}`}
                    onClick={() => setPick({ card: pick.card, give: card.id, step: 'receive' })}
                  >
                    <span>{ABILITY_INFO[card.type].label}</span>
                  </button>
                ))}
                <button type="button" className="ghost" onClick={() => setPick(null)}>戻る</button>
              </div>
            )}

            {canChoose && !ask && pick?.step === 'receive' && (
              <div className="choice">
                <h3>TRADE</h3>
                <p>受け取る相手の能力を選んでください。</p>
                {(theirs || []).map((card) => (
                  <button
                    key={card.id}
                    type="button"
                    className={`choice-btn kind-${ABILITY_INFO[card.type].kind}`}
                    onClick={() => onAbility(pick.card.id, { give: pick.give, take: card.id })}
                  >
                    <span>{ABILITY_INFO[card.type].label}</span>
                  </button>
                ))}
                <button type="button" className="ghost" onClick={() => setPick({ card: pick.card, step: 'give' })}>戻る</button>
              </div>
            )}

            {canChoose && !ask && !pick && (
              <div className="choice" ref={choiceRef} tabIndex={-1}>
                <h3>{view.blinded ? '数字は隠れたままです' : `${view.current} になりました`}</h3>
                <p>このターンに能力を1つ使えます。使うと山札から1枚引きます。</p>
                {afterCards.map((card) => {
                  const info = ABILITY_INFO[card.type]
                  const blocked = (card.type === 'seal' || card.type === 'trade') && !theirs
                  const emptyGive = card.type === 'trade' && mine.length < 2
                  const emptyTake = (card.type === 'seal' || card.type === 'trade') && theirs && theirs.length === 0
                  return (
                    <button
                      key={card.id}
                      type="button"
                      className={`choice-btn kind-${info.kind}`}
                      disabled={blocked || emptyGive || emptyTake}
                      onClick={() => {
                        if (card.type === 'seal') setPick({ card, step: 'take' })
                        else if (card.type === 'trade') setPick({ card, step: 'give' })
                        else onAbility(card.id)
                      }}
                    >
                      <span>{info.label}</span>
                      <small>
                        {blocked && '相手の能力が見えないので選べません'}
                        {!blocked && emptyGive && '渡す能力が残っていません'}
                        {!blocked && !emptyGive && emptyTake && '相手に能力がありません'}
                        {!blocked && !emptyGive && !emptyTake && info.text}
                      </small>
                    </button>
                  )
                })}
                <button type="button" className="ghost" onClick={() => onAbility('skip')}>能力を使わない</button>
              </div>
            )}

            {canPlay && !ask && (
              <div className="moves">
                {[1, 2, 3].map((delta) => {
                  const bust = view.current != null && view.current + delta >= 30
                  const disabled = (view.locked && delta !== 1) || (view.twin != null && delta !== view.twin)
                  return (
                    <button
                      key={delta}
                      type="button"
                      className={bust ? 'move danger' : 'move'}
                      disabled={disabled}
                      onClick={() => request(delta)}
                    >
                      +{delta}
                      {view.current != null && <small>{bust ? '負け' : `→ ${view.current + delta}`}</small>}
                    </button>
                  )
                })}
                {!view.hushed && !numbersBlocked && moveCards.map((card) => {
                  const info = ABILITY_INFO[card.type]
                  const line = cardLine(card)
                  const disabled = line === 'まだ使えない' || line === '0からは不可' || line === '0未満は不可'
                  return (
                    <button
                      key={card.id}
                      type="button"
                      className={`move ability-move kind-${info.kind} ${line === '負け' ? 'danger' : ''}`}
                      disabled={disabled}
                      onClick={() => requestCard(card)}
                    >
                      {info.label}
                      <small>{line}</small>
                    </button>
                  )
                })}
              </div>
            )}

            {!canPlay && !canChoose && waiting && <p className="waiting">{waiting}</p>}
          </footer>
        )}
      </section>
    </main>
  )
}
