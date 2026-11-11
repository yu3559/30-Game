let ctx = null
let muted = false

try {
  muted = localStorage.getItem('thirty-mute') === '1'
} catch {
  muted = false
}

export function getMuted() {
  return muted
}

export function setMuted(next) {
  muted = next
  try {
    localStorage.setItem('thirty-mute', next ? '1' : '0')
  } catch {
    /* ignore private mode */
  }
}

export function unlockAudio() {
  const Ctx = window.AudioContext || window.webkitAudioContext
  if (!Ctx) return
  if (!ctx) ctx = new Ctx()
  if (ctx.state === 'suspended') ctx.resume()
}

function tone(freq, dur, type, gain, delay = 0, slide = 0) {
  if (!ctx || muted) return
  const start = ctx.currentTime + delay
  const osc = ctx.createOscillator()
  const amp = ctx.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, start)
  if (slide) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(48, freq + slide), start + dur)
  }
  amp.gain.setValueAtTime(gain, start)
  amp.gain.exponentialRampToValueAtTime(0.0001, start + dur)
  osc.connect(amp).connect(ctx.destination)
  osc.start(start)
  osc.stop(start + dur + 0.02)
}

export function play(cue) {
  if (muted) return
  unlockAudio()
  if (!ctx) return
  if (cue === 'move') tone(620, 0.07, 'sine', 0.03)
  else if (cue === 'pass') tone(420, 0.05, 'sine', 0.02)
  else if (cue === 'lock') {
    tone(196, 0.08, 'square', 0.018)
    tone(140, 0.1, 'square', 0.018, 0.09)
  } else if (cue === 'boost') tone(460, 0.16, 'sawtooth', 0.018, 0, -300)
  else if (cue === 'back') tone(180, 0.12, 'triangle', 0.02, 0, -40)
  else if (cue === 'blind') tone(250, 0.2, 'sine', 0.03, 0, -90)
  else if (cue === 'seal') {
    tone(330, 0.06, 'square', 0.015)
    tone(220, 0.08, 'square', 0.015, 0.07)
  } else if (cue === 'bust' || cue === 'lose') {
    tone(220, 0.2, 'sine', 0.04, 0, -140)
    tone(110, 0.28, 'triangle', 0.03, 0.08)
  } else if (cue === 'win') {
    tone(523, 0.1, 'sine', 0.03)
    tone(659, 0.1, 'sine', 0.03, 0.1)
    tone(784, 0.18, 'sine', 0.03, 0.2)
  }
}

export function cueFrom(prev, next, { you, hotseat }) {
  if (!prev || !next) return null
  if (
    prev.serial === next.serial
    && prev.phase === next.phase
    && prev.blinded === next.blinded
    && prev.locked === next.locked
    && prev.twin === next.twin
    && prev.hushed === next.hushed
    && prev.masked === next.masked
  ) return null
  if (next.phase === 'over' && prev.phase !== 'over') {
    return hotseat ? 'bust' : (next.winner === you ? 'win' : 'lose')
  }
  if (next.blinded && !prev.blinded) return 'blind'
  if (next.masked && !prev.masked) return 'blind'
  if (next.locked && !prev.locked) return 'lock'
  if (next.twin && !prev.twin) return 'lock'
  if (next.hushed && !prev.hushed) return 'lock'
  if (prev.phase === 'ability' && next.phase === 'play') {
    const type = next.incoming?.type
    if (type === 'blind' || type === 'mask') return 'blind'
    if (type === 'lock' || type === 'twin' || type === 'hush') return 'lock'
    const spent = next.log?.[next.log.length - 1]?.ability
    if (spent === 'seal' || spent === 'trade') return 'seal'
    return 'pass'
  }
  const last = next.log?.[next.log.length - 1]
  if (last?.ability === 'boost' || last?.ability === 'same') return 'boost'
  if (last?.ability === 'back') return 'back'
  if (next.phase === 'ability' && prev.phase !== 'ability') return 'move'
  if (next.serial !== prev.serial) return 'move'
  return null
}
