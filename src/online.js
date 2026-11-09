import { useEffect, useRef, useState } from 'react'

const KEY = 'thirty-session'

function readSession() {
  try {
    const raw = sessionStorage.getItem(KEY)
    if (!raw) return null
    const data = JSON.parse(raw)
    if (!data?.code || !data?.token) return null
    return data
  } catch {
    return null
  }
}

function socketUrl() {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${proto}//${location.host}/ws`
}

export function useRoom() {
  const life = useRef(null)
  const wsRef = useRef(null)
  const [mode, setMode] = useState(() => (readSession() ? 'connecting' : 'idle'))
  const [you, setYou] = useState(null)
  const [code, setCode] = useState('')
  const [view, setView] = useState(null)
  const [names, setNames] = useState(null)
  const [presence, setPresence] = useState({ p1: false, p2: false })
  const [rematch, setRematch] = useState({ p1: false, p2: false })
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const pendingRef = useRef(false)
  const followRef = useRef(null)
  const [canRestore, setCanRestore] = useState(() => Boolean(readSession()))

  function closeCurrent() {
    life.current = null
    const ws = wsRef.current
    wsRef.current = null
    if (!ws) return
    ws.onclose = null
    ws.onmessage = null
    ws.onerror = null
    ws.close()
  }

  function settle() {
    pendingRef.current = false
    setPending(false)
  }

  function handle(msg) {
    if (msg.type === 'hello') {
      sessionStorage.setItem(KEY, JSON.stringify({
        code: msg.code,
        token: msg.token,
        name: msg.name,
      }))
      setCanRestore(true)
      setYou(msg.you)
      setCode(msg.code)
      setError('')
      return
    }
    if (msg.type === 'lobby') {
      setMode('lobby')
      setNames(msg.names)
      setPresence(msg.presence)
      setView(null)
      settle()
      return
    }
    if (msg.type === 'state') {
      setMode('game')
      setView(msg.state)
      setPresence(msg.presence)
      setRematch(msg.rematch)
      setYou(msg.state.you)
      setError('')
      const follow = followRef.current
      const needsFollow = msg.state.phase === 'ability' && msg.state.turn === msg.state.you && follow
      followRef.current = null
      if (needsFollow) {
        pendingRef.current = true
        setPending(true)
        if (!send({ type: 'ability', choice: follow })) settle()
        return
      }
      settle()
      return
    }
    if (msg.type === 'error') {
      setError(msg.message)
      settle()
      if (msg.fatal) {
        sessionStorage.removeItem(KEY)
        setCanRestore(false)
        setMode('idle')
        setView(null)
      }
      return
    }
    if (msg.type === 'abandoned') {
      sessionStorage.removeItem(KEY)
      setCanRestore(false)
      setError('相手が退出しました')
      setMode('idle')
      setView(null)
      settle()
    }
  }

  function openSocket(payload) {
    closeCurrent()
    const token = {}
    life.current = token
    setError('')
    settle()
    setMode('connecting')
    let ws
    try {
      ws = new WebSocket(socketUrl())
    } catch {
      setMode('idle')
      setError('サーバーに接続できません')
      return
    }
    wsRef.current = ws
    ws.onopen = () => {
      if (life.current !== token) return
      ws.send(JSON.stringify(payload))
    }
    ws.onmessage = (event) => {
      if (life.current !== token) return
      try {
        handle(JSON.parse(event.data))
      } catch {
        /* ignore malformed payloads */
      }
    }
    ws.onerror = () => {
      if (life.current !== token) return
      setError('サーバーに接続できません。npm run dev が動いているか確認してください')
    }
    ws.onclose = () => {
      if (life.current !== token) return
      settle()
      setMode('idle')
      setError((prev) => prev || '接続が切れました')
    }
  }

  useEffect(() => {
    const saved = readSession()
    if (!saved) return undefined
    openSocket({ type: 'reconnect', code: saved.code, token: saved.token })
    return () => closeCurrent()
    // 起動時の復帰だけ行う
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function send(payload) {
    const ws = wsRef.current
    if (!ws || ws.readyState !== 1) {
      setError('接続が切れました')
      return false
    }
    ws.send(JSON.stringify(payload))
    return true
  }

  return {
    mode,
    you,
    code,
    view,
    names,
    presence,
    rematch,
    error,
    pending,
    canRestore,
    create(name) {
      openSocket({ type: 'create', name })
    },
    join(name, roomCode) {
      openSocket({ type: 'join', name, code: roomCode })
    },
    restore() {
      const saved = readSession()
      if (!saved) {
        setCanRestore(false)
        setError('復帰できる対戦がありません')
        return
      }
      openSocket({ type: 'reconnect', code: saved.code, token: saved.token })
    },
    move(delta, ability) {
      if (pendingRef.current) return
      followRef.current = delta === 4 ? null : (ability === 'lock' || ability === 'blind' ? ability : 'skip')
      pendingRef.current = true
      setPending(true)
      if (!send({ type: 'move', delta })) {
        followRef.current = null
        settle()
      }
    },
    ability(choice) {
      if (pendingRef.current) return
      pendingRef.current = true
      setPending(true)
      if (!send({ type: 'ability', choice })) settle()
    },
    voteRematch() {
      send({ type: 'rematch' })
    },
    leave() {
      const ws = wsRef.current
      life.current = null
      if (ws && ws.readyState === 1) {
        try { ws.send(JSON.stringify({ type: 'leave' })) } catch { /* already closing */ }
      }
      sessionStorage.removeItem(KEY)
      setCanRestore(false)
      setMode('idle')
      setView(null)
      setError('')
      settle()
      setTimeout(() => {
        if (!ws) return
        ws.onopen = null
        ws.onclose = null
        ws.onmessage = null
        ws.onerror = null
        ws.close()
        if (wsRef.current === ws) wsRef.current = null
      }, 80)
    },
  }
}
