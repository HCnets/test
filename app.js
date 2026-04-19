const TAU = Math.PI * 2

function now() {
  return performance.now()
}

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v))
}

function lerp(a, b, t) {
  return a + (b - a) * t
}

function len2(x, y) {
  return Math.sqrt(x * x + y * y)
}

function norm2(x, y) {
  const l = len2(x, y)
  if (l < 1e-6) return { x: 0, y: 0, l: 0 }
  return { x: x / l, y: y / l, l }
}

function easeOutCubic(t) {
  const x = clamp(t, 0, 1)
  return 1 - Math.pow(1 - x, 3)
}

function easeInOut(t) {
  const x = clamp(t, 0, 1)
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2
}

function rand01(seed) {
  let x = seed >>> 0
  x ^= x << 13
  x ^= x >>> 17
  x ^= x << 5
  return (x >>> 0) / 4294967296
}

export const AnimationConfig = {
  version: 1,
  actions: {
    idle: { fps: 8, loop: true, frames: 8, events: [] },
    walk: { fps: 12, loop: true, frames: 8, events: [] },
    run: { fps: 16, loop: true, frames: 8, events: [] },
    jump: { fps: 12, loop: false, frames: 8, events: [{ at: 0.15, type: 'sfx', name: 'jump' }] },
    dash: { fps: 18, loop: false, frames: 6, events: [{ at: 0.05, type: 'sfx', name: 'dash' }] },
    attack1: { fps: 14, loop: false, frames: 10, events: [{ at: 0.35, type: 'hitbox', name: 'slash' }] },
    attack2: { fps: 14, loop: false, frames: 10, events: [{ at: 0.38, type: 'hitbox', name: 'slash' }] },
    skill: { fps: 12, loop: false, frames: 12, events: [{ at: 0.25, type: 'fx', name: 'skillBurst' }] },
    hurt: { fps: 12, loop: false, frames: 6, events: [{ at: 0.05, type: 'sfx', name: 'hit' }] },
    die: { fps: 10, loop: false, frames: 12, events: [{ at: 0.1, type: 'sfx', name: 'die' }] },
  },
  machine: {
    initial: 'idle',
    states: {
      idle: {
        action: 'idle',
        transitions: [
          { to: 'walk', when: 'moveMagnitude>0.2 && !runModifier' },
          { to: 'run', when: 'moveMagnitude>0.2 && runModifier' },
          { to: 'attack1', when: 'attackPressed' },
          { to: 'skill', when: 'skillPressed' },
          { to: 'dash', when: 'dashPressed' },
        ],
      },
      walk: {
        action: 'walk',
        transitions: [
          { to: 'idle', when: 'moveMagnitude<=0.2' },
          { to: 'run', when: 'runModifier' },
          { to: 'attack1', when: 'attackPressed' },
          { to: 'skill', when: 'skillPressed' },
          { to: 'dash', when: 'dashPressed' },
        ],
      },
      run: {
        action: 'run',
        transitions: [
          { to: 'idle', when: 'moveMagnitude<=0.2' },
          { to: 'walk', when: '!runModifier' },
          { to: 'attack1', when: 'attackPressed' },
          { to: 'skill', when: 'skillPressed' },
          { to: 'dash', when: 'dashPressed' },
        ],
      },
      jump: { action: 'jump', lock: true, transitions: [{ to: 'idle', when: 'animFinished' }] },
      dash: { action: 'dash', lock: true, transitions: [{ to: 'idle', when: 'animFinished' }] },
      attack1: {
        action: 'attack1',
        lock: true,
        transitions: [
          { to: 'attack2', when: 'attackBuffered && animTime>0.55' },
          { to: 'idle', when: 'animFinished' },
        ],
      },
      attack2: { action: 'attack2', lock: true, transitions: [{ to: 'idle', when: 'animFinished' }] },
      skill: { action: 'skill', lock: true, transitions: [{ to: 'idle', when: 'animFinished' }] },
      hurt: { action: 'hurt', lock: true, transitions: [{ to: 'idle', when: 'animFinished' }] },
      die: { action: 'die', lock: true, transitions: [] },
    },
  },
}

export class StateMachine {
  constructor(cfg) {
    this.cfg = cfg
    this.state = cfg.machine.initial
    this.locked = false
    this.request = null
  }
  setState(s) {
    if (!this.cfg.machine.states[s]) return
    this.state = s
    this.locked = !!this.cfg.machine.states[s].lock
  }
  update(ctx) {
    const def = this.cfg.machine.states[this.state]
    if (!def) return
    if (this.locked && !ctx.animFinished) return
    for (let i = 0; i < def.transitions.length; i++) {
      const tr = def.transitions[i]
      if (evalCond(tr.when, ctx)) {
        this.setState(tr.to)
        return
      }
    }
  }
}

function evalCond(expr, ctx) {
  const s = String(expr)
    .replace(/\bmoveMagnitude\b/g, String(ctx.moveMagnitude || 0))
    .replace(/\brunModifier\b/g, String(!!ctx.runModifier))
    .replace(/\battackPressed\b/g, String(!!ctx.attackPressed))
    .replace(/\battackBuffered\b/g, String(!!ctx.attackBuffered))
    .replace(/\bskillPressed\b/g, String(!!ctx.skillPressed))
    .replace(/\bdashPressed\b/g, String(!!ctx.dashPressed))
    .replace(/\banimTime\b/g, String(ctx.animTime || 0))
    .replace(/\banimFinished\b/g, String(!!ctx.animFinished))
  try {
    return !!Function(`"use strict"; return (${s})`)()
  } catch {
    return false
  }
}

export class AnimationSystem {
  constructor(cfg) {
    this.cfg = cfg
    this.action = cfg.machine.states[cfg.machine.initial].action
    this.time = 0
    this.frame = 0
    this.fired = new Set()
    this.finished = false
  }
  setAction(action) {
    if (this.action === action) return
    if (!this.cfg.actions[action]) return
    this.action = action
    this.time = 0
    this.frame = 0
    this.fired.clear()
    this.finished = false
  }
  update(dt, outEvents) {
    const clip = this.cfg.actions[this.action]
    if (!clip) return
    const dur = clip.frames / clip.fps
    this.time += dt
    const t01 = dur > 0 ? this.time / dur : 1
    const p = clip.loop ? (t01 % 1) : clamp(t01, 0, 1)
    this.frame = Math.min(clip.frames - 1, Math.floor(p * clip.frames))
    this.finished = !clip.loop && t01 >= 1
    for (let i = 0; i < clip.events.length; i++) {
      const ev = clip.events[i]
      const key = `${this.action}:${ev.type}:${ev.name}:${ev.at}`
      if (this.fired.has(key)) continue
      if (p >= ev.at) {
        this.fired.add(key)
        outEvents.push(ev)
      }
    }
  }
  get animTime01() {
    const clip = this.cfg.actions[this.action]
    if (!clip) return 0
    const dur = clip.frames / clip.fps
    return dur > 0 ? clamp(this.time / dur, 0, 1) : 1
  }
}

export class InputSystem {
  constructor({ canvas, ui }) {
    this.canvas = canvas
    this.ui = ui
    this.isMobile = !!(window.matchMedia && window.matchMedia('(pointer:coarse)').matches)
    this.keys = new Set()
    this.attackPressed = false
    this.skillPressed = false
    this.dashPressed = false
    this.camPressed = false
    this.runModifier = false
    this.zoomDelta = 0
    this.pointer = { down: false, x: 0, y: 0, id: -1 }
    this.pad = { active: false, pid: -1, cx: 0, cy: 0, x: 0, y: 0 }
    this.tap = { lastAt: 0, count: 0 }
    this.long = { pid: -1, startAt: 0, fired: false }
    this.pinch = { active: false, d0: 0 }
    this._bind()
  }
  _bind() {
    if (!this.isMobile) {
      window.addEventListener('keydown', (e) => {
        this.keys.add(e.code)
        if (e.code === 'KeyJ') this.attackPressed = true
        if (e.code === 'KeyK') this.skillPressed = true
        if (e.code === 'Space') this.dashPressed = true
        if (e.code === 'KeyC') this.camPressed = true
        if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') this.runModifier = true
      })
      window.addEventListener('keyup', (e) => {
        this.keys.delete(e.code)
        if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') this.runModifier = false
      })
      this.canvas.addEventListener(
        'wheel',
        (e) => {
          this.zoomDelta += clamp(-e.deltaY / 600, -0.22, 0.22)
          e.preventDefault()
        },
        { passive: false }
      )
    }

    const pressBtn = (el, k) => {
      const onDown = (e) => {
        e.preventDefault()
        if (k === 'atk') this.attackPressed = true
        if (k === 'skl') this.skillPressed = true
        if (k === 'dash') this.dashPressed = true
        if (k === 'cam') this.camPressed = true
      }
      el.addEventListener('pointerdown', onDown, { passive: false })
    }
    pressBtn(this.ui.btnAtk, 'atk')
    pressBtn(this.ui.btnSkl, 'skl')
    pressBtn(this.ui.btnDash, 'dash')
    pressBtn(this.ui.btnCam, 'cam')

    const padRect = () => this.ui.pad.getBoundingClientRect()
    this.ui.pad.addEventListener('pointerdown', (e) => {
      e.preventDefault()
      const r = padRect()
      this.pad.active = true
      this.pad.pid = e.pointerId
      this.pad.cx = r.left + r.width / 2
      this.pad.cy = r.top + r.height / 2
      this.pad.x = e.clientX
      this.pad.y = e.clientY
      this.ui.pad.setPointerCapture(e.pointerId)
    }, { passive: false })
    this.ui.pad.addEventListener('pointermove', (e) => {
      if (!this.pad.active || e.pointerId !== this.pad.pid) return
      this.pad.x = e.clientX
      this.pad.y = e.clientY
    })
    const padUp = (e) => {
      if (e.pointerId !== this.pad.pid) return
      this.pad.active = false
      this.pad.pid = -1
      this.ui.stick.style.transform = 'translate3d(0px,0px,0px)'
    }
    this.ui.pad.addEventListener('pointerup', padUp)
    this.ui.pad.addEventListener('pointercancel', padUp)

    this.canvas.addEventListener('pointerdown', (e) => {
      this.pointer.down = true
      this.pointer.id = e.pointerId
      this.pointer.x = e.clientX
      this.pointer.y = e.clientY
      const t = now()
      if (!this.isMobile) {
        if (t - this.tap.lastAt < 260) this.tap.count += 1
        else this.tap.count = 1
        this.tap.lastAt = t
        if (this.tap.count >= 2) this.attackPressed = true
      }
      this.long.pid = e.pointerId
      this.long.startAt = t
      this.long.fired = false
    })
    this.canvas.addEventListener('pointermove', (e) => {
      if (this.pointer.id !== e.pointerId) return
      this.pointer.x = e.clientX
      this.pointer.y = e.clientY
    })
    const pUp = (e) => {
      if (this.pointer.id !== e.pointerId) return
      this.pointer.down = false
      this.pointer.id = -1
      this.long.pid = -1
    }
    this.canvas.addEventListener('pointerup', pUp)
    this.canvas.addEventListener('pointercancel', pUp)

    this.canvas.addEventListener('touchstart', (e) => {
      if (e.touches.length === 2) {
        const a = e.touches[0]
        const b = e.touches[1]
        this.pinch.active = true
        this.pinch.d0 = len2(a.clientX - b.clientX, a.clientY - b.clientY)
      }
    }, { passive: true })
    this.canvas.addEventListener('touchmove', (e) => {
      if (e.touches.length === 2 && this.pinch.active) {
        const a = e.touches[0]
        const b = e.touches[1]
        const d = len2(a.clientX - b.clientX, a.clientY - b.clientY)
        if (this.pinch.d0 > 1) {
          this.zoomDelta += clamp((d - this.pinch.d0) / 400, -0.12, 0.12)
        }
        this.pinch.d0 = d
      }
    }, { passive: true })
    this.canvas.addEventListener('touchend', (e) => {
      if (e.touches.length < 2) this.pinch.active = false
    }, { passive: true })
  }
  consumeFrame(dt) {
    const move = this._moveAxis()
    if (this.pad.active) {
      const max = 44
      const dx = this.pad.x - this.pad.cx
      const dy = this.pad.y - this.pad.cy
      const n = norm2(dx, dy)
      const m = clamp(n.l / max, 0, 1)
      const ox = n.x * m * max
      const oy = n.y * m * max
      this.ui.stick.style.transform = `translate3d(${ox}px,${oy}px,0px)`
      move.x = n.x * m
      move.y = n.y * m
      this.runModifier = this.runModifier || m > 0.85
    }

    if (this.long.pid !== -1 && !this.long.fired) {
      const t = now()
      if (t - this.long.startAt > 420) {
        this.long.fired = true
        this.skillPressed = true
      }
    }

    const out = {
      moveX: move.x,
      moveY: move.y,
      moveMagnitude: clamp(len2(move.x, move.y), 0, 1),
      runModifier: !!this.runModifier,
      attackPressed: !!this.attackPressed,
      skillPressed: !!this.skillPressed,
      dashPressed: !!this.dashPressed,
      camPressed: !!this.camPressed,
      zoomDelta: this.zoomDelta,
    }
    this.attackPressed = false
    this.skillPressed = false
    this.dashPressed = false
    this.camPressed = false
    this.zoomDelta = 0
    return out
  }
  _moveAxis() {
    if (this.isMobile) return { x: 0, y: 0 }
    let x = 0
    let y = 0
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) x -= 1
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) y += 1
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) y -= 1
    const n = norm2(x, y)
    return { x: n.x, y: n.y }
  }
}

export class CameraSystem {
  constructor() {
    this.x = 0
    this.y = 0
    this.zoom = 1.0
    this.mode = 'follow'
    this.shakeT = 0
    this.shakeA = 0
    this.shakeX = 0
    this.shakeY = 0
  }
  toggleMode() {
    this.mode = this.mode === 'follow' ? 'zoom' : this.mode === 'zoom' ? 'shake' : 'follow'
  }
  addShake(amount) {
    this.shakeT = 0.22
    this.shakeA = Math.max(this.shakeA, amount)
  }
  update(dt, target, zoomDelta) {
    const tz = clamp(this.zoom + zoomDelta, 0.65, 1.8)
    this.zoom = lerp(this.zoom, tz, 1 - Math.pow(0.0004, dt))
    if (target) {
      const k = 1 - Math.pow(0.0003, dt)
      this.x = lerp(this.x, target.x, k)
      this.y = lerp(this.y, target.y, k)
    }
    this.shakeT = Math.max(0, this.shakeT - dt)
    const s = this.shakeT > 0 ? (this.shakeT / 0.22) : 0
    const a = this.shakeA * s
    const t = now() / 1000
    this.shakeX = Math.sin(t * 51.2) * a
    this.shakeY = Math.cos(t * 47.6) * a
    if (this.shakeT <= 0) this.shakeA = 0
  }
  view() {
    return { x: this.x + this.shakeX, y: this.y + this.shakeY, zoom: this.zoom }
  }
}

export class EffectsManager {
  constructor(max = 2048) {
    this.max = max
    this.count = 0
    this.px = new Float32Array(max)
    this.py = new Float32Array(max)
    this.vx = new Float32Array(max)
    this.vy = new Float32Array(max)
    this.life = new Float32Array(max)
    this.ttl = new Float32Array(max)
    this.size = new Float32Array(max)
    this.r = new Float32Array(max)
    this.g = new Float32Array(max)
    this.b = new Float32Array(max)
    this.a = new Float32Array(max)
    this.kind = new Uint8Array(max)
    this._seed = 1234567
    this.envRate = 0.0
  }
  setEnvironmentRain(on) {
    this.envRate = on ? 90 : 0
  }
  spawn(kind, x, y, n) {
    for (let i = 0; i < n; i++) {
      if (this.count >= this.max) return
      const id = this.count++
      this._seed = (this._seed * 1664525 + 1013904223) >>> 0
      const u = rand01(this._seed)
      this._seed = (this._seed * 1664525 + 1013904223) >>> 0
      const v = rand01(this._seed)
      const ang = u * TAU
      const sp = 0.6 + v * 2.2
      this.px[id] = x
      this.py[id] = y
      if (kind === 0) {
        this.vx[id] = Math.cos(ang) * sp * 7
        this.vy[id] = Math.sin(ang) * sp * 7
        this.ttl[id] = 0.18 + v * 0.22
        this.size[id] = 10 + v * 14
        this.r[id] = 0.9
        this.g[id] = 0.55
        this.b[id] = 1.0
        this.a[id] = 0.9
      } else if (kind === 1) {
        this.vx[id] = Math.cos(ang) * sp * 10
        this.vy[id] = Math.sin(ang) * sp * 10
        this.ttl[id] = 0.12 + v * 0.16
        this.size[id] = 12 + v * 18
        this.r[id] = 0.2
        this.g[id] = 0.95
        this.b[id] = 0.9
        this.a[id] = 0.85
      } else {
        this.vx[id] = Math.cos(ang) * sp * 4
        this.vy[id] = Math.sin(ang) * sp * 4
        this.ttl[id] = 0.28 + v * 0.34
        this.size[id] = 8 + v * 10
        this.r[id] = 1.0
        this.g[id] = 1.0
        this.b[id] = 1.0
        this.a[id] = 0.7
      }
      this.kind[id] = kind
      this.life[id] = 0
    }
  }
  update(dt, view, bounds) {
    if (this.envRate > 0) {
      const add = Math.floor(this.envRate * dt)
      for (let i = 0; i < add; i++) {
        if (this.count >= this.max) break
        const id = this.count++
        this._seed = (this._seed * 1664525 + 1013904223) >>> 0
        const u = rand01(this._seed)
        this._seed = (this._seed * 1664525 + 1013904223) >>> 0
        const v = rand01(this._seed)
        const x = view.x + (u - 0.5) * bounds.w
        const y = view.y + bounds.h * 0.55 + v * 3
        this.px[id] = x
        this.py[id] = y
        this.vx[id] = -1.5 - v * 0.8
        this.vy[id] = -9.5 - v * 3
        this.ttl[id] = 0.55 + v * 0.35
        this.life[id] = 0
        this.size[id] = 6 + v * 6
        this.r[id] = 0.8
        this.g[id] = 0.9
        this.b[id] = 1.0
        this.a[id] = 0.35
        this.kind[id] = 2
      }
    }

    let w = 0
    for (let i = 0; i < this.count; i++) {
      const t = this.life[i] + dt
      if (t >= this.ttl[i]) continue
      this.life[i] = t
      this.px[i] += this.vx[i] * dt
      this.py[i] += this.vy[i] * dt
      this.vx[i] *= Math.pow(0.04, dt)
      this.vy[i] *= Math.pow(0.04, dt)
      const k = 1 - t / this.ttl[i]
      this.a[i] = clamp(this.a[i] * (0.7 + k * 0.4), 0, 1)
      if (w !== i) {
        this.px[w] = this.px[i]
        this.py[w] = this.py[i]
        this.vx[w] = this.vx[i]
        this.vy[w] = this.vy[i]
        this.life[w] = this.life[i]
        this.ttl[w] = this.ttl[i]
        this.size[w] = this.size[i]
        this.r[w] = this.r[i]
        this.g[w] = this.g[i]
        this.b[w] = this.b[i]
        this.a[w] = this.a[i]
        this.kind[w] = this.kind[i]
      }
      w++
    }
    this.count = w
  }
}

export class AudioManager {
  constructor() {
    this.ac = null
    this.master = null
    this.bgmA = null
    this.bgmB = null
    this.bgmGainA = null
    this.bgmGainB = null
    this.enabled = false
    this.combat = 0
    this.listener = { x: 0, y: 0 }
    this._sfxBudget = 0
  }
  init() {
    if (this.ac) return
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return
    this.ac = new AC()
    this.master = this.ac.createGain()
    this.master.gain.value = 0.85
    this.master.connect(this.ac.destination)
    const makeBgm = (base) => {
      const g = this.ac.createGain()
      g.gain.value = 0
      const f = this.ac.createBiquadFilter()
      f.type = 'lowpass'
      f.frequency.value = 1400
      const o1 = this.ac.createOscillator()
      o1.type = 'sawtooth'
      o1.frequency.value = base
      const o2 = this.ac.createOscillator()
      o2.type = 'triangle'
      o2.frequency.value = base * 1.498
      const o3 = this.ac.createOscillator()
      o3.type = 'sine'
      o3.frequency.value = base * 2
      const mix = this.ac.createGain()
      mix.gain.value = 0.25
      o1.connect(mix)
      o2.connect(mix)
      o3.connect(mix)
      mix.connect(f)
      f.connect(g)
      g.connect(this.master)
      o1.start()
      o2.start()
      o3.start()
      return { g, f, o1, o2, o3 }
    }
    const A = makeBgm(130.81)
    const B = makeBgm(174.61)
    this.bgmA = A
    this.bgmB = B
    this.bgmGainA = A.g
    this.bgmGainB = B.g
    this.enabled = true
  }
  resume() {
    if (!this.ac) return
    if (this.ac.state === 'suspended') this.ac.resume()
  }
  setCombatLevel(v) {
    this.combat = clamp(v, 0, 1)
  }
  setListener(x, y) {
    this.listener.x = x
    this.listener.y = y
    if (this.ac && this.ac.listener && this.ac.listener.positionX) {
      this.ac.listener.positionX.value = x
      this.ac.listener.positionY.value = y
      this.ac.listener.positionZ.value = 6
    }
  }
  update(dt) {
    if (!this.enabled || !this.ac) return
    const c = this.combat
    const a = 1 - c
    const targetA = 0.22 + a * 0.55
    const targetB = 0.04 + c * 0.65
    const k = 1 - Math.pow(0.0008, dt)
    this.bgmGainA.gain.value = lerp(this.bgmGainA.gain.value, targetA, k)
    this.bgmGainB.gain.value = lerp(this.bgmGainB.gain.value, targetB, k)
    const cut = 900 + c * 2400
    this.bgmA.f.frequency.value = lerp(this.bgmA.f.frequency.value, cut, k)
    this.bgmB.f.frequency.value = lerp(this.bgmB.f.frequency.value, 1200 + c * 2800, k)
    this._sfxBudget = Math.min(1, this._sfxBudget + dt * 3)
  }
  playSfx(name, x, y, gain = 0.6) {
    if (!this.enabled || !this.ac) return
    if (this._sfxBudget < 0.08) return
    this._sfxBudget -= 0.08
    const t0 = this.ac.currentTime
    const g = this.ac.createGain()
    g.gain.value = 0
    const p = this.ac.createPanner()
    p.panningModel = 'HRTF'
    p.distanceModel = 'inverse'
    p.refDistance = 1
    p.maxDistance = 22
    p.rolloffFactor = 1.2
    p.positionX.value = x
    p.positionY.value = y
    p.positionZ.value = 0
    const o = this.ac.createOscillator()
    const n = this.ac.createBufferSource()
    const mkNoise = () => {
      const len = Math.floor(this.ac.sampleRate * 0.16)
      const b = this.ac.createBuffer(1, len, this.ac.sampleRate)
      const d = b.getChannelData(0)
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len)
      return b
    }
    let src = null
    if (name === 'hit' || name === 'slash') {
      o.type = 'square'
      o.frequency.setValueAtTime(260, t0)
      o.frequency.exponentialRampToValueAtTime(120, t0 + 0.12)
      src = o
    } else if (name === 'skill') {
      o.type = 'sawtooth'
      o.frequency.setValueAtTime(180, t0)
      o.frequency.exponentialRampToValueAtTime(520, t0 + 0.14)
      src = o
    } else if (name === 'dash') {
      n.buffer = mkNoise()
      src = n
    } else if (name === 'jump') {
      o.type = 'triangle'
      o.frequency.setValueAtTime(220, t0)
      o.frequency.exponentialRampToValueAtTime(330, t0 + 0.08)
      src = o
    } else if (name === 'die') {
      o.type = 'sine'
      o.frequency.setValueAtTime(180, t0)
      o.frequency.exponentialRampToValueAtTime(70, t0 + 0.22)
      src = o
    } else {
      o.type = 'sine'
      o.frequency.setValueAtTime(240, t0)
      o.frequency.exponentialRampToValueAtTime(180, t0 + 0.08)
      src = o
    }
    src.connect(g)
    g.connect(p)
    p.connect(this.master)
    g.gain.setValueAtTime(0, t0)
    g.gain.linearRampToValueAtTime(gain, t0 + 0.01)
    g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.18)
    if (src.start) src.start(t0)
    if (src.stop) src.stop(t0 + 0.22)
  }
}

export class EquipmentSystem {
  constructor() {
    this.items = [
      { id: 'glove', name: '霓虹拳套', stat: { atk: 3, crit: 0.06 } },
      { id: 'boots', name: '雨夜跑鞋', stat: { spd: 0.22, dash: 0.08 } },
      { id: 'sigil', name: '镜面徽记', stat: { hp: 10, skill: 0.12 } },
      { id: 'crown', name: '逆风王冠', stat: { atk: 2, hp: 6, roar: 0.1 } },
      { id: 'letter', name: '未寄出火漆', stat: { hp: 8, heal: 0.08 } },
      { id: 'meter', name: '里程表', stat: { spd: 0.12, atk: 1 } },
    ]
    this.equipped = new Set()
  }
  toggle(id) {
    if (this.equipped.has(id)) this.equipped.delete(id)
    else this.equipped.add(id)
  }
  stats() {
    const s = { atk: 0, hp: 0, spd: 0, crit: 0, skill: 0, dash: 0, heal: 0, roar: 0 }
    for (const it of this.items) {
      if (!this.equipped.has(it.id)) continue
      for (const k in it.stat) s[k] = (s[k] || 0) + it.stat[k]
    }
    return s
  }
}

export class CharacterController {
  constructor(cfg) {
    this.cfg = cfg
    this.anim = new AnimationSystem(cfg)
    this.sm = new StateMachine(cfg)
    this.events = []
    this.x = 0
    this.y = 0
    this.vx = 0
    this.vy = 0
    this.face = 1
    this.hpMax = 100
    this.hp = 100
    this.alive = true
    this.attackBuffer = false
    this.cool = { dash: 0, skill: 0 }
    this.inv = 0
    this.base = { atk: 8, spd: 3.2 }
    this.eq = null
    this.combatHeat = 0
  }
  setEquipment(eq) {
    this.eq = eq
  }
  takeHit(dmg) {
    if (!this.alive) return
    if (this.inv > 0) return
    this.hp = Math.max(0, this.hp - dmg)
    this.inv = 0.35
    if (this.hp <= 0) {
      this.alive = false
      this.sm.setState('die')
      this.anim.setAction('die')
    } else {
      this.sm.setState('hurt')
      this.anim.setAction('hurt')
    }
  }
  update(dt, input, hooks) {
    this.events.length = 0
    if (this.inv > 0) this.inv = Math.max(0, this.inv - dt)
    this.cool.dash = Math.max(0, this.cool.dash - dt)
    this.cool.skill = Math.max(0, this.cool.skill - dt)
    this.combatHeat = Math.max(0, this.combatHeat - dt * 0.8)
    const eqs = this.eq ? this.eq.stats() : { atk: 0, hp: 0, spd: 0, crit: 0, skill: 0, dash: 0 }
    this.hpMax = 100 + (eqs.hp || 0)
    this.hp = Math.min(this.hp, this.hpMax)
    if (!this.alive) {
      this.anim.update(dt, this.events)
      return
    }

    const move = norm2(input.moveX, input.moveY)
    const run = input.runModifier
    const sp = this.base.spd * (1 + (eqs.spd || 0)) * (run ? 1.25 : 1)
    const wantsAttack = input.attackPressed
    const wantsSkill = input.skillPressed && this.cool.skill <= 0
    const wantsDash = input.dashPressed && this.cool.dash <= 0

    const ctx = {
      moveMagnitude: input.moveMagnitude,
      runModifier: run,
      attackPressed: wantsAttack,
      attackBuffered: this.attackBuffer,
      skillPressed: wantsSkill,
      dashPressed: wantsDash,
      animTime: this.anim.animTime01,
      animFinished: this.anim.finished,
    }
    this.sm.update(ctx)
    const st = this.cfg.machine.states[this.sm.state]
    const act = st ? st.action : 'idle'
    this.anim.setAction(act)

    if (wantsAttack && (act === 'attack1' || act === 'attack2' || act === 'skill' || act === 'dash')) this.attackBuffer = true
    if (act === 'idle' || act === 'walk' || act === 'run') this.attackBuffer = false

    if (act === 'dash' && this.cool.dash <= 0) this.cool.dash = 0.55 - (eqs.dash || 0)
    if (act === 'skill' && this.cool.skill <= 0) this.cool.skill = 1.6 - (eqs.skill || 0)

    const lock = !!(st && st.lock)
    const canMove = !lock || act === 'dash'
    if (canMove) {
      this.vx = lerp(this.vx, move.x * sp, 1 - Math.pow(0.0003, dt))
      this.vy = lerp(this.vy, move.y * sp, 1 - Math.pow(0.0003, dt))
      this.x += this.vx * dt
      this.y += this.vy * dt
    } else {
      this.vx *= Math.pow(0.0005, dt)
      this.vy *= Math.pow(0.0005, dt)
    }
    if (Math.abs(this.vx) > 0.08) this.face = this.vx > 0 ? 1 : -1

    this.anim.update(dt, this.events)
    for (const ev of this.events) {
      if (ev.type === 'hitbox') {
        this.combatHeat = Math.min(1, this.combatHeat + 0.25)
        if (hooks && hooks.onHitbox) hooks.onHitbox({ x: this.x + this.face * 0.85, y: this.y, w: 1.2, h: 0.9, kind: ev.name })
        if (hooks && hooks.onSfx) hooks.onSfx('slash', this.x + this.face * 0.6, this.y)
      } else if (ev.type === 'fx') {
        this.combatHeat = Math.min(1, this.combatHeat + 0.4)
        if (hooks && hooks.onFx) hooks.onFx(ev.name, this.x + this.face * 0.4, this.y)
        if (hooks && hooks.onSfx) hooks.onSfx('skill', this.x, this.y)
      } else if (ev.type === 'sfx') {
        if (hooks && hooks.onSfx) hooks.onSfx(ev.name, this.x, this.y)
      }
    }
  }
}

export class DummyEnemy {
  constructor() {
    this.x = 2.6
    this.y = 0
    this.hpMax = 70
    this.hp = 70
    this.inv = 0
    this.hitAt = 0
  }
  update(dt, player) {
    this.inv = Math.max(0, this.inv - dt)
    const t = now() / 1000
    this.x = 2.8 + Math.sin(t * 0.6) * 1.2
    this.y = Math.cos(t * 0.5) * 0.6
    if (this.hp <= 0) {
      this.hp = this.hpMax
      this.inv = 0.4
    }
    if (player && player.alive) {
      const d = len2(player.x - this.x, player.y - this.y)
      if (d < 1.0 && this.inv <= 0) {
        player.takeHit(6)
        this.inv = 0.6
        this.hitAt = now()
      }
    }
  }
  take(dmg) {
    if (this.inv > 0) return false
    this.hp = Math.max(0, this.hp - dmg)
    this.inv = 0.15
    this.hitAt = now()
    return true
  }
}

function createSpriteAtlas(cfg) {
  const actions = Object.keys(cfg.actions)
  const rows = actions.length
  const maxFrames = Math.max(...actions.map((k) => cfg.actions[k].frames))
  const cell = 96
  const c = document.createElement('canvas')
  c.width = maxFrames * cell
  c.height = rows * cell
  const g = c.getContext('2d')
  g.clearRect(0, 0, c.width, c.height)
  g.translate(0.5, 0.5)
  const drawFrame = (action, fi, x, y) => {
    const t = fi / Math.max(1, cfg.actions[action].frames - 1)
    const base = action === 'skill' ? 0.2 : action.startsWith('attack') ? 0.14 : action === 'dash' ? 0.26 : 0.1
    const swing = Math.sin(t * TAU) * (action === 'run' ? 1.4 : action === 'walk' ? 1.0 : action === 'idle' ? 0.35 : 0.8)
    const bob = Math.sin(t * TAU) * (action === 'run' ? 6 : action === 'walk' ? 4 : action === 'idle' ? 2 : 3)
    const cx = x + cell / 2
    const cy = y + cell / 2 + bob
    g.save()
    g.translate(cx, cy)
    const glow = g.createRadialGradient(0, 8, 4, 0, 8, 42)
    glow.addColorStop(0, 'rgba(34,211,238,0.20)')
    glow.addColorStop(1, 'rgba(34,211,238,0)')
    g.fillStyle = glow
    g.beginPath()
    g.arc(0, 10, 42, 0, TAU)
    g.fill()
    const body = action === 'hurt' ? 'rgba(255,77,109,0.85)' : action === 'die' ? 'rgba(255,255,255,0.40)' : 'rgba(255,255,255,0.88)'
    const neon = action === 'skill' ? 'rgba(34,211,238,0.95)' : action.startsWith('attack') ? 'rgba(139,92,246,0.95)' : 'rgba(34,211,238,0.75)'
    const headR = 10
    g.fillStyle = body
    g.beginPath()
    g.arc(0, -18, headR, 0, TAU)
    g.fill()
    g.lineWidth = 6
    g.lineCap = 'round'
    g.strokeStyle = body
    g.beginPath()
    g.moveTo(0, -8)
    g.lineTo(0, 16)
    g.stroke()
    const armA = base + swing * 0.45
    const armB = -base - swing * 0.35
    const legA = -base - swing * 0.55
    const legB = base + swing * 0.55
    const drawLimb = (a, len, ox, oy) => {
      g.beginPath()
      g.moveTo(ox, oy)
      g.lineTo(ox + Math.cos(a) * len, oy + Math.sin(a) * len)
      g.stroke()
    }
    const armLen = 18
    const legLen = 20
    drawLimb(Math.PI / 2 + armA, armLen, 0, -4)
    drawLimb(Math.PI / 2 + armB, armLen, 0, -4)
    drawLimb(Math.PI / 2 + legA, legLen, 0, 16)
    drawLimb(Math.PI / 2 + legB, legLen, 0, 16)
    g.lineWidth = 4
    g.strokeStyle = neon
    if (action.startsWith('attack')) {
      const s = 18 + swing * 10
      g.beginPath()
      g.arc(0, 0, 18, -0.2 + swing * 0.18, 1.2 + swing * 0.18)
      g.stroke()
      g.beginPath()
      g.moveTo(10, -2)
      g.lineTo(10 + s, -2 + s * 0.15)
      g.stroke()
    }
    if (action === 'skill') {
      const r = 10 + t * 22
      g.beginPath()
      g.arc(0, 8, r, 0, TAU)
      g.stroke()
    }
    if (action === 'dash') {
      g.globalAlpha = 0.5
      g.beginPath()
      g.moveTo(-18, 18)
      g.lineTo(18, 18)
      g.stroke()
      g.globalAlpha = 1
    }
    g.restore()
  }
  for (let r = 0; r < rows; r++) {
    const a = actions[r]
    for (let f = 0; f < cfg.actions[a].frames; f++) {
      drawFrame(a, f, f * cell, r * cell)
    }
  }
  const index = {}
  for (let r = 0; r < rows; r++) index[actions[r]] = r
  return { canvas: c, cell, rows, cols: maxFrames, index }
}

export class WebGLRenderer {
  constructor(canvas, cfg) {
    this.canvas = canvas
    this.cfg = cfg
    this.gl = canvas.getContext('webgl', { alpha: false, antialias: true, preserveDrawingBuffer: false })
    this.ok = !!this.gl
    this.dpr = 1
    this.w = 1
    this.h = 1
    this.atlas = null
    this.tex = null
    this.progSprite = null
    this.progPoints = null
    this.progGrid = null
    this.buffQuad = null
    this.buffPoints = null
    this.drawCalls = 0
    if (this.ok) this._init()
  }
  _init() {
    const gl = this.gl
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)
    gl.disable(gl.DEPTH_TEST)
    this.atlas = createSpriteAtlas(this.cfg)
    this.tex = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, this.tex)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.atlas.canvas)

    this.progSprite = makeProgram(gl, V_SPRITE, F_SPRITE)
    this.progPoints = makeProgram(gl, V_POINTS, F_POINTS)
    this.progGrid = makeProgram(gl, V_GRID, F_GRID)

    this.buffQuad = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffQuad)
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([
        -0.5, -0.5, 0, 0,
        0.5, -0.5, 1, 0,
        -0.5, 0.5, 0, 1,
        -0.5, 0.5, 0, 1,
        0.5, -0.5, 1, 0,
        0.5, 0.5, 1, 1,
      ]),
      gl.STATIC_DRAW
    )

    this.buffPoints = gl.createBuffer()
  }
  resize() {
    const isMobile = !!(window.matchMedia && window.matchMedia('(pointer:coarse)').matches)
    const dprMax = isMobile ? 2 : 3
    const dpr = Math.max(1, Math.min(dprMax, window.devicePixelRatio || 1))
    const w = Math.floor(this.canvas.clientWidth)
    const h = Math.floor(this.canvas.clientHeight)
    const cw = Math.floor(w * dpr)
    const ch = Math.floor(h * dpr)
    if (this.canvas.width !== cw || this.canvas.height !== ch) {
      this.canvas.width = cw
      this.canvas.height = ch
    }
    this.dpr = dpr
    this.w = w
    this.h = h
    if (this.ok) this.gl.viewport(0, 0, cw, ch)
  }
  begin(view) {
    if (!this.ok) return
    const gl = this.gl
    this.drawCalls = 0
    gl.clearColor(0.03, 0.04, 0.07, 1)
    gl.clear(gl.COLOR_BUFFER_BIT)
    this._drawGrid(view)
  }
  _drawGrid(view) {
    const gl = this.gl
    gl.useProgram(this.progGrid)
    const uView = gl.getUniformLocation(this.progGrid, 'uView')
    const uRes = gl.getUniformLocation(this.progGrid, 'uRes')
    gl.uniform3f(uView, view.x, view.y, view.zoom)
    gl.uniform2f(uRes, this.w, this.h)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffQuad)
    const aPos = gl.getAttribLocation(this.progGrid, 'aPos')
    gl.enableVertexAttribArray(aPos)
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 16, 0)
    gl.drawArrays(gl.TRIANGLES, 0, 6)
    this.drawCalls += 1
  }
  drawSprite({ x, y, w, h, action, frame, face, tint, alpha, z }) {
    if (!this.ok) return
    const gl = this.gl
    gl.useProgram(this.progSprite)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.tex)
    gl.uniform1i(gl.getUniformLocation(this.progSprite, 'uTex'), 0)
    const uPos = gl.getUniformLocation(this.progSprite, 'uPos')
    const uSize = gl.getUniformLocation(this.progSprite, 'uSize')
    const uView = gl.getUniformLocation(this.progSprite, 'uView')
    const uRes = gl.getUniformLocation(this.progSprite, 'uRes')
    const uUV = gl.getUniformLocation(this.progSprite, 'uUV')
    const uTint = gl.getUniformLocation(this.progSprite, 'uTint')
    gl.uniform3f(uView, z.view.x, z.view.y, z.view.zoom)
    gl.uniform2f(uRes, this.w, this.h)
    gl.uniform2f(uPos, x, y)
    gl.uniform2f(uSize, w * (face < 0 ? -1 : 1), h)
    const row = this.atlas.index[action] ?? 0
    const cols = this.atlas.cols
    const rows = this.atlas.rows
    const u0 = frame / cols
    const v0 = row / rows
    const u1 = (frame + 1) / cols
    const v1 = (row + 1) / rows
    gl.uniform4f(uUV, u0, v0, u1, v1)
    const tr = tint ? tint[0] : 1
    const tg = tint ? tint[1] : 1
    const tb = tint ? tint[2] : 1
    gl.uniform4f(uTint, tr, tg, tb, alpha)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffQuad)
    const aPos = gl.getAttribLocation(this.progSprite, 'aPos')
    const aUv = gl.getAttribLocation(this.progSprite, 'aUv')
    gl.enableVertexAttribArray(aPos)
    gl.enableVertexAttribArray(aUv)
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 16, 0)
    gl.vertexAttribPointer(aUv, 2, gl.FLOAT, false, 16, 8)
    gl.drawArrays(gl.TRIANGLES, 0, 6)
    this.drawCalls += 1
  }
  drawParticles(fx, z) {
    if (!this.ok) return
    const gl = this.gl
    const n = fx.count
    if (!n) return
    const stride = 7
    const buf = new Float32Array(n * stride)
    for (let i = 0; i < n; i++) {
      const o = i * stride
      buf[o + 0] = fx.px[i]
      buf[o + 1] = fx.py[i]
      buf[o + 2] = fx.size[i]
      buf[o + 3] = fx.r[i]
      buf[o + 4] = fx.g[i]
      buf[o + 5] = fx.b[i]
      buf[o + 6] = fx.a[i]
    }
    gl.useProgram(this.progPoints)
    gl.uniform3f(gl.getUniformLocation(this.progPoints, 'uView'), z.view.x, z.view.y, z.view.zoom)
    gl.uniform2f(gl.getUniformLocation(this.progPoints, 'uRes'), this.w, this.h)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffPoints)
    gl.bufferData(gl.ARRAY_BUFFER, buf, gl.DYNAMIC_DRAW)
    const aPos = gl.getAttribLocation(this.progPoints, 'aPos')
    const aSize = gl.getAttribLocation(this.progPoints, 'aSize')
    const aCol = gl.getAttribLocation(this.progPoints, 'aCol')
    gl.enableVertexAttribArray(aPos)
    gl.enableVertexAttribArray(aSize)
    gl.enableVertexAttribArray(aCol)
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, stride * 4, 0)
    gl.vertexAttribPointer(aSize, 1, gl.FLOAT, false, stride * 4, 8)
    gl.vertexAttribPointer(aCol, 4, gl.FLOAT, false, stride * 4, 12)
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE)
    gl.drawArrays(gl.POINTS, 0, n)
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)
    this.drawCalls += 1
  }
}

const V_SPRITE = `
attribute vec2 aPos;
attribute vec2 aUv;
uniform vec2 uPos;
uniform vec2 uSize;
uniform vec3 uView;
uniform vec2 uRes;
uniform vec4 uUV;
varying vec2 vUv;
void main(){
  vec2 p = aPos * uSize + uPos;
  vec2 v = (p - uView.xy) * uView.z;
  vec2 ndc = vec2(v.x/(uRes.x*0.5), v.y/(uRes.y*0.5));
  gl_Position = vec4(ndc,0.0,1.0);
  vec2 uv = mix(uUV.xy, uUV.zw, aUv);
  vUv = uv;
}
`

const F_SPRITE = `
precision mediump float;
uniform sampler2D uTex;
uniform vec4 uTint;
varying vec2 vUv;
void main(){
  vec4 c = texture2D(uTex, vUv);
  gl_FragColor = vec4(c.rgb*uTint.rgb, c.a*uTint.a);
}
`

const V_POINTS = `
attribute vec2 aPos;
attribute float aSize;
attribute vec4 aCol;
uniform vec3 uView;
uniform vec2 uRes;
varying vec4 vCol;
void main(){
  vec2 v = (aPos - uView.xy) * uView.z;
  vec2 ndc = vec2(v.x/(uRes.x*0.5), v.y/(uRes.y*0.5));
  gl_Position = vec4(ndc,0.0,1.0);
  gl_PointSize = aSize * uView.z;
  vCol = aCol;
}
`

const F_POINTS = `
precision mediump float;
varying vec4 vCol;
void main(){
  vec2 p = gl_PointCoord*2.0-1.0;
  float d = dot(p,p);
  float a = smoothstep(1.0,0.0,d);
  gl_FragColor = vec4(vCol.rgb, vCol.a*a);
}
`

const V_GRID = `
attribute vec2 aPos;
uniform vec3 uView;
uniform vec2 uRes;
varying vec2 vW;
void main(){
  vec2 p = aPos;
  vec2 world = vec2(uView.x, uView.y) + vec2(p.x*uRes.x*0.5/uView.z, p.y*uRes.y*0.5/uView.z);
  vW = world;
  gl_Position = vec4(p,0.0,1.0);
}
`

const F_GRID = `
precision mediump float;
varying vec2 vW;
float grid(float x){
  float f = abs(fract(x)-0.5);
  return smoothstep(0.48,0.50,f);
}
void main(){
  float gx = grid(vW.x*0.25);
  float gy = grid(vW.y*0.25);
  float g = max(gx,gy);
  vec3 base = vec3(0.03,0.04,0.07);
  vec3 line = vec3(0.16,0.18,0.28);
  vec3 c = mix(base,line,g*0.65);
  gl_FragColor = vec4(c,1.0);
}
`

function makeProgram(gl, vs, fs) {
  const v = gl.createShader(gl.VERTEX_SHADER)
  gl.shaderSource(v, vs)
  gl.compileShader(v)
  const f = gl.createShader(gl.FRAGMENT_SHADER)
  gl.shaderSource(f, fs)
  gl.compileShader(f)
  const p = gl.createProgram()
  gl.attachShader(p, v)
  gl.attachShader(p, f)
  gl.linkProgram(p)
  return p
}

export class GameCore {
  constructor({ renderer, input, audio, effects, camera, equipment }) {
    this.renderer = renderer
    this.input = input
    this.audio = audio
    this.effects = effects
    this.camera = camera
    this.equipment = equipment
    this.player = new CharacterController(AnimationConfig)
    this.player.setEquipment(equipment)
    this.enemy = new DummyEnemy()
    this.world = { bounds: { w: 18, h: 10 } }
    this._last = now()
    this._acc = 0
    this._fixed = 1 / 90
    this._perf = { fps: 0, dtAvg: 0, frames: 0, last: now(), dc: 0, p: 0 }
    this.cut = new CutsceneSystem()
    this.tut = new TutorialSystem()
    this.unlockedAudio = false
    this._combatIntensity = 0
  }
  unlockAudio() {
    if (this.unlockedAudio) return
    this.unlockedAudio = true
    this.audio.init()
    this.audio.resume()
  }
  step(dt, frameInput) {
    const hooks = {
      onHitbox: (hb) => {
        const dx = this.enemy.x - hb.x
        const dy = this.enemy.y - hb.y
        if (Math.abs(dx) < hb.w && Math.abs(dy) < hb.h) {
          const eq = this.equipment.stats()
          const crit = Math.random() < (eq.crit || 0)
          const dmg = Math.round((this.player.base.atk + (eq.atk || 0)) * (crit ? 1.6 : 1))
          const ok = this.enemy.take(dmg)
          if (ok) {
            this.effects.spawn(0, this.enemy.x, this.enemy.y + 0.2, 18)
            this.camera.addShake(0.22)
            this.audio.playSfx('hit', this.enemy.x, this.enemy.y, 0.65)
            this._combatIntensity = Math.min(1, this._combatIntensity + 0.35)
          }
        }
      },
      onFx: (name, x, y) => {
        if (name === 'skillBurst') {
          this.effects.spawn(1, x, y, 46)
          this.camera.addShake(0.32)
          this._combatIntensity = Math.min(1, this._combatIntensity + 0.6)
        }
      },
      onSfx: (name, x, y) => {
        this.audio.playSfx(name, x, y, name === 'dash' ? 0.5 : 0.55)
      },
    }

    if (frameInput.camPressed) {
      this.camera.toggleMode()
      this.effects.spawn(2, this.player.x, this.player.y + 0.5, 10)
    }

    this.player.update(dt, frameInput, hooks)
    this.enemy.update(dt, this.player)
    const view = this.camera.view()
    this.effects.update(dt, view, this.world.bounds)
    this._combatIntensity = Math.max(0, this._combatIntensity - dt * 0.7)
    this.audio.setCombatLevel(Math.max(this._combatIntensity, this.player.combatHeat * 0.9))
    this.audio.setListener(view.x, view.y)
    this.audio.update(dt)
    this.camera.update(dt, this.player, frameInput.zoomDelta)
    this.cut.update(dt)
    this.tut.update(dt, { input: frameInput, player: this.player, enemy: this.enemy, camera: this.camera })
  }
  render() {
    if (!this.renderer || !this.renderer.ok) return
    this.renderer.resize()
    const view = this.camera.view()
    const z = { view }
    this.renderer.begin(view)
    const hitFlash = now() - this.enemy.hitAt < 120
    const tintE = hitFlash ? [1, 0.4, 0.55] : [1, 1, 1]
    const tintP = this.player.inv > 0 ? [1, 0.65, 0.75] : [1, 1, 1]
    this.renderer.drawSprite({ x: this.enemy.x, y: this.enemy.y, w: 1.25, h: 1.25, action: 'idle', frame: 0, face: -1, tint: tintE, alpha: 0.9, z })
    this.renderer.drawSprite({ x: this.player.x, y: this.player.y, w: 1.4, h: 1.4, action: this.player.anim.action, frame: this.player.anim.frame, face: this.player.face, tint: tintP, alpha: this.player.alive ? 1 : 0.7, z })
    this.renderer.drawParticles(this.effects, z)
    this._perf.dc = this.renderer.drawCalls
    this._perf.p = this.effects.count
  }
  updatePerf(dt) {
    this._perf.frames += 1
    const t = now()
    const span = t - this._perf.last
    if (span >= 1000) {
      this._perf.fps = Math.round((this._perf.frames * 1000) / span)
      this._perf.frames = 0
      this._perf.last = t
    }
    this._perf.dtAvg = lerp(this._perf.dtAvg || dt, dt, 0.06)
    return this._perf
  }
}

export class CutsceneSystem {
  constructor() {
    this.phase = 'intro'
    this.t = 0
    this.done = false
  }
  update(dt) {
    if (this.done) return
    this.t += dt
    if (this.phase === 'intro' && this.t > 2.2) {
      this.phase = 'title'
      this.t = 0
    } else if (this.phase === 'title' && this.t > 2.0) {
      this.done = true
    }
  }
  ui() {
    if (this.done) return null
    if (this.phase === 'intro') return { title: '23:59', text: '镜面亮起，抽屉在呼吸。\n你听见自己在键盘声里下雨。' }
    return { title: '开局提示', text: '双击屏幕=攻击\n长按屏幕=技能\n滑动滚轮/双指=缩放\n点C切换相机模式' }
  }
}

export class TutorialSystem {
  constructor() {
    this.step = 0
    this.t = 0
    this.done = false
  }
  update(dt, ctx) {
    if (this.done) return
    this.t += dt
    if (this.step === 0) {
      if (ctx.input.moveMagnitude > 0.2) {
        this.step = 1
        this.t = 0
      }
    } else if (this.step === 1) {
      if (ctx.input.attackPressed || ctx.player.anim.action.startsWith('attack')) {
        this.step = 2
        this.t = 0
      }
    } else if (this.step === 2) {
      if (ctx.input.skillPressed || ctx.player.anim.action === 'skill') {
        this.step = 3
        this.t = 0
      }
    } else if (this.step === 3) {
      if (this.t > 3) this.done = true
    }
  }
  hint() {
    if (this.done) return ''
    if (this.step === 0) return '新手引导：先移动（摇杆/WASD）'
    if (this.step === 1) return '新手引导：攻击（J 或双击屏幕）'
    if (this.step === 2) return '新手引导：技能（K 或长按屏幕）'
    return '新手引导：现在试试点C切换相机模式'
  }
}

export class UIController {
  constructor(ui, core) {
    this.ui = ui
    this.core = core
    this.tweens = new Map()
    this.lastHp = core.player.hp
    this.audioHint = true
    this._setupEquip()
    this._setupStartUnlock()
  }
  _setupEquip() {
    const root = this.ui.equip
    root.innerHTML = ''
    for (const it of this.core.equipment.items) {
      const el = document.createElement('div')
      el.className = 'slot'
      el.dataset.id = it.id
      el.innerHTML = `<div class="k">装备</div><div class="v">${it.name}</div>`
      el.addEventListener('click', () => {
        this.core.equipment.toggle(it.id)
        this._pulse(el)
      })
      root.appendChild(el)
    }
  }
  _setupStartUnlock() {
    const unlock = () => {
      this.core.unlockAudio()
      this.audioHint = false
      this.ui.hintText.textContent = ''
      window.removeEventListener('pointerdown', unlock)
    }
    window.addEventListener('pointerdown', unlock)
  }
  _pulse(el) {
    el.style.transform = 'scale(1.02)'
    setTimeout(() => {
      el.style.transform = ''
    }, 120)
  }
  update(dt, perf) {
    const p = this.core.player
    this.ui.perf.textContent = `FPS ${perf.fps || '—'} · DC ${perf.dc || 0} · P ${perf.p || 0}`
    const hp01 = p.hpMax > 0 ? clamp(p.hp / p.hpMax, 0, 1) : 0
    this.ui.hpText.textContent = `${Math.round(p.hp)}/${p.hpMax}`
    const t = this._tween('hp', hp01, dt)
    this.ui.hpFill.style.transform = `scaleX(${t})`
    const chips = [
      ['动作', p.anim.action],
      ['相机', this.core.camera.mode],
      ['技能CD', p.cool.skill.toFixed(1)],
      ['冲刺CD', p.cool.dash.toFixed(1)],
    ]
    this.ui.chips.innerHTML = chips.map(([k, v]) => `<div class="chip"><strong>${k}</strong> ${v}</div>`).join('')
    for (const node of Array.from(this.ui.equip.children)) {
      const id = node.dataset.id
      node.classList.toggle('on', this.core.equipment.equipped.has(id))
    }

    const cut = this.core.cut.ui()
    if (cut) {
      this.ui.overlay.classList.add('on')
      this.ui.overlayTitle.textContent = cut.title
      this.ui.overlayText.textContent = cut.text
    } else {
      this.ui.overlay.classList.remove('on')
      this.ui.overlayTitle.textContent = ''
      this.ui.overlayText.textContent = ''
    }

    const hint = this.core.tut.hint()
    if (this.audioHint) this.ui.hintText.textContent = '点击屏幕任意处开始（解锁音频）'
    else this.ui.hintText.textContent = hint
  }
  _tween(key, target, dt) {
    const cur = this.tweens.get(key) ?? target
    const k = 1 - Math.pow(0.0006, dt)
    const v = lerp(cur, target, k)
    this.tweens.set(key, v)
    return v
  }
}

export function startApp({ canvas, ui }) {
  const equipment = new EquipmentSystem()
  const renderer = new WebGLRenderer(canvas, AnimationConfig)
  const input = new InputSystem({ canvas, ui })
  const isMobile = !!(window.matchMedia && window.matchMedia('(pointer:coarse)').matches)
  const effects = new EffectsManager(isMobile ? 1600 : 2200)
  effects.setEnvironmentRain(true)
  const camera = new CameraSystem()
  const audio = new AudioManager()
  const core = new GameCore({ renderer, input, audio, effects, camera, equipment })
  const uiCtl = new UIController(ui, core)

  if (!renderer.ok) {
    ui.hintText.textContent = 'WebGL 初始化失败：请换用支持 WebGL 的浏览器'
  }

  let last = now()
  const loop = () => {
    const t = now()
    const dt = clamp((t - last) / 1000, 0, 0.05)
    last = t
    const frameInput = input.consumeFrame(dt)
    core.step(dt, frameInput)
    core.render()
    const perf = core.updatePerf(dt)
    uiCtl.update(dt, perf)
    requestAnimationFrame(loop)
  }
  requestAnimationFrame(loop)

  window.__game = {
    core,
    AnimationConfig,
    StateMachine,
    AnimationSystem,
    InputSystem,
    EffectsManager,
    AudioManager,
    CameraSystem,
    CharacterController,
    EquipmentSystem,
    WebGLRenderer,
    GameCore,
  }

  return core
}

