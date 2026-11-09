import { useEffect, useState } from 'react'

export function RulesDialog({ onClose }) {
  useEffect(() => {
    function onKey(event) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="modal-back" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="rules-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="rules-title">ルール</h2>
        <div className="rules">
          <section>
            <h3>勝ち負け</h3>
            <p>0 から始め、交互に +1、+2、+3 のどれかで進めます。30 以上にした人が負けです。</p>
          </section>
          <section>
            <h3>能力</h3>
            <p>2人とも LOCK、BOOST、BLIND を1回ずつ持っています。1ターンに使えるのは1つまでで、使ったかどうかは相手にも分かります。</p>
            <ul>
              <li><b>LOCK</b> 数字を進めるときに一緒に使います。相手の次の手は +1 だけになります。</li>
              <li><b>BOOST</b> 自分の手を +4 にします。+1〜+3 の代わりに使います。</li>
              <li><b>BLIND</b> 数字を進めるときに一緒に使います。相手の次の1ターンだけ、今の数字が隠されます。</li>
            </ul>
          </section>
        </div>
        <button type="button" className="filled" onClick={onClose}>閉じる</button>
      </div>
    </div>
  )
}

export function Title({ error, canRestore, onLocal, onCreate, onJoin, onRestore, onRules }) {
  const [step, setStep] = useState('home')
  const [p1, setP1] = useState('プレイヤー1')
  const [p2, setP2] = useState('プレイヤー2')
  const [name, setName] = useState('')
  const [room, setRoom] = useState('')

  return (
    <main className="page">
      <section className="frame home">
        <h1 className="title-mark">30</h1>

        {step === 'home' && (
          <div className="actions">
            <button type="button" className="filled" onClick={() => setStep('local')}>ローカルで対戦</button>
            <button type="button" onClick={() => setStep('online')}>オンラインで対戦</button>
            {canRestore && (
              <button type="button" onClick={onRestore}>直前の対戦に戻る</button>
            )}
          </div>
        )}

        {step === 'local' && (
          <form
            className="setup"
            onSubmit={(event) => {
              event.preventDefault()
              onLocal({ p1, p2 })
            }}
          >
            <label>
              先手
              <input value={p1} maxLength={12} onChange={(event) => setP1(event.target.value)} />
            </label>
            <label>
              後手
              <input value={p2} maxLength={12} onChange={(event) => setP2(event.target.value)} />
            </label>
            <div className="actions">
              <button type="submit" className="filled">対戦を始める</button>
              <button type="button" onClick={() => setStep('home')}>戻る</button>
            </div>
          </form>
        )}

        {step === 'online' && (
          <form
            className="setup"
            onSubmit={(event) => {
              event.preventDefault()
              if (room.length === 4) onJoin(name, room)
              else onCreate(name)
            }}
          >
            <label>
              名前
              <input value={name} maxLength={12} placeholder="名前" onChange={(event) => setName(event.target.value)} />
            </label>
            <div className="actions">
              <button type="button" className="filled" onClick={() => onCreate(name)}>ルームを作る</button>
            </div>
            <div className="code-row">
              <input
                value={room}
                maxLength={4}
                placeholder="コード"
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                onChange={(event) => setRoom(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4))}
              />
              <button type="button" disabled={room.length !== 4} onClick={() => onJoin(name, room)}>
                参加
              </button>
            </div>
            <button type="button" className="texty" onClick={() => setStep('home')}>戻る</button>
          </form>
        )}

        {error && <p className="note">{error}</p>}
        <button type="button" className="texty" onClick={onRules}>ルール</button>
      </section>
    </main>
  )
}

export function Connecting({ onCancel }) {
  return (
    <main className="page">
      <section className="frame center-copy">
        <h1>接続しています</h1>
        <button type="button" onClick={onCancel}>キャンセル</button>
      </section>
    </main>
  )
}

export function Lobby({ code, names, onLeave, onRules }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  return (
    <main className="page">
      <section className="frame center-copy">
        <h1>相手を待っています</h1>
        <input
          className="room-code"
          readOnly
          value={code}
          aria-label="ルームコード"
          onFocus={(event) => event.target.select()}
        />
        <div className="actions">
          <button type="button" className="filled" onClick={copy}>{copied ? 'コピーしました' : 'コードをコピー'}</button>
          <button type="button" onClick={onRules}>ルール</button>
          <button type="button" onClick={onLeave}>キャンセル</button>
        </div>
        <p className="note">{names?.p1 || 'ホスト'} が待機中です</p>
      </section>
    </main>
  )
}

export function Handoff({ name, number, locked, onReady, onRules }) {
  return (
    <main className="page">
      <section className="frame center-copy">
        <h1>{name}の番</h1>
        {number == null ? (
          <p className="note">数字は隠されています</p>
        ) : (
          <p className="digit" aria-hidden="true">{number}</p>
        )}
        {locked && <p className="note">+1 だけ</p>}
        <div className="actions">
          <button type="button" className="filled" onClick={onReady}>準備できた</button>
          <button type="button" onClick={onRules}>ルール</button>
        </div>
      </section>
    </main>
  )
}
