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
        <p className="eyebrow">ルール</p>
        <h2 id="rules-title">30を言ったら負け</h2>
        <div className="rules">
          <section>
            <h3>勝ち負け</h3>
            <p>0 から始め、交互に +1、+2、+3 のどれかで進めます。30 以上にした人が負けです。</p>
          </section>
          <section>
            <h3>能力</h3>
            <p>2人とも LOCK、BREAK、BLIND を1回ずつ持っています。1ターンに使えるのは1つまでで、使ったかどうかは相手にも分かります。</p>
            <ul>
              <li><b>LOCK</b>数字を進めた直後に発動します。相手の次の手は +1 だけになります。</li>
              <li><b>BREAK</b>自分の手を +4 にできます。+1〜+3 の代わりに使います。</li>
              <li><b>BLIND</b>数字を進めた直後に発動します。相手の次の1ターンだけ、今の数字と履歴が隠されます。</li>
            </ul>
          </section>
          <section>
            <h3>定石</h3>
            <p>能力を使わないとき、1、5、9、13、17、21、25、29 を相手の番にすると有利です。LOCK と BREAK で、この並びは崩れます。</p>
          </section>
          <section>
            <h3>対戦</h3>
            <p>ローカルは1台の端末を交代で使います。BLIND のあいだは、渡す画面にも数字を出しません。</p>
            <p>オンラインは4文字のルームコードでつなぎます。BLIND 中の数字は、相手の端末にも送りません。再戦するたびに先手を交代します。</p>
          </section>
        </div>
        <button type="button" className="primary" onClick={onClose}>閉じる</button>
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
        <p className="eyebrow">2人対戦</p>
        <h1 className="title-mark">
          <span className="num">30</span>
          <span className="rest">を言ったら負け</span>
        </h1>
        <p className="lede">必勝手順は、能力ひとつで崩れる。</p>

        {step === 'home' && (
          <>
            <ul className="ability-cards">
              <li>
                <b>LOCK</b>
                <span>相手の次の手を +1 に固定</span>
              </li>
              <li>
                <b>BREAK</b>
                <span>自分の手番に +4 できる</span>
              </li>
              <li>
                <b>BLIND</b>
                <span>相手から数字と履歴を隠す</span>
              </li>
            </ul>
            <div className="actions">
              <button type="button" className="primary" onClick={() => setStep('local')}>ローカルで対戦</button>
              <button type="button" className="ghost" onClick={() => setStep('online')}>オンラインで対戦</button>
              {canRestore && (
                <button type="button" className="ghost" onClick={onRestore}>直前の対戦に戻る</button>
              )}
              <button type="button" className="texty" onClick={onRules}>ルールを見る</button>
            </div>
          </>
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
              <button type="submit" className="primary">対戦を始める</button>
              <button type="button" className="ghost" onClick={() => setStep('home')}>戻る</button>
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
              あなたの名前
              <input value={name} maxLength={12} placeholder="名前" onChange={(event) => setName(event.target.value)} />
            </label>
            <p className="note">ルームを作った人が、最初の先手です。再戦で交代します。</p>
            <div className="actions">
              <button type="button" className="primary" onClick={() => onCreate(name)}>ルームを作る</button>
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
              <button type="button" className="ghost" disabled={room.length !== 4} onClick={() => onJoin(name, room)}>
                参加
              </button>
            </div>
            <button type="button" className="texty" onClick={() => setStep('home')}>戻る</button>
          </form>
        )}

        {error && <p className="banner warn">{error}</p>}
      </section>
    </main>
  )
}

export function Connecting({ onCancel }) {
  return (
    <main className="page">
      <section className="frame center-copy">
        <p className="eyebrow">オンライン</p>
        <h1>接続しています</h1>
        <button type="button" className="ghost" onClick={onCancel}>キャンセル</button>
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
        <p className="eyebrow">オンライン</p>
        <h1>相手を待っています</h1>
        <p className="lede">同じページを開いた相手に、コードを伝えてください。</p>
        <input
          className="room-code"
          readOnly
          value={code}
          aria-label="ルームコード"
          onFocus={(event) => event.target.select()}
        />
        <div className="actions">
          <button type="button" className="primary" onClick={copy}>{copied ? 'コピーしました' : 'コードをコピー'}</button>
          <button type="button" className="ghost" onClick={onRules}>ルール</button>
          <button type="button" className="texty" onClick={onLeave}>キャンセル</button>
        </div>
        <p className="note">{names?.p1 || 'ホスト'} が待機中です。別の端末なら、このPCに表示されているURLを開いてください。</p>
      </section>
    </main>
  )
}

export function Handoff({ name, number, locked, onReady, onRules }) {
  return (
    <main className="page">
      <section className="frame center-copy handoff">
        <p className="eyebrow">交代</p>
        <h1>{name}の番</h1>
        {number == null ? (
          <p className="blind-note">数字と履歴は隠されています。記憶を頼りに選んでください。</p>
        ) : (
          <p className="handoff-number" aria-hidden="true">{number}</p>
        )}
        {locked && <p className="note">このターンは +1 だけ選べます。</p>}
        <p className="lede">端末を渡してから、押してください。</p>
        <div className="actions">
          <button type="button" className="primary" onClick={onReady}>準備できた</button>
          <button type="button" className="texty" onClick={onRules}>ルール</button>
        </div>
      </section>
    </main>
  )
}
