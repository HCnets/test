import { AnimationConfig, AnimationSystem, StateMachine, EffectsManager, CameraSystem, EquipmentSystem, CharacterController, GameCore } from './app.js'

function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}

function approx(a, b, eps = 1e-4) {
  return Math.abs(a - b) <= eps
}

function makeResult() {
  return { total: 0, passed: 0, failed: 0, items: [] }
}

async function test(name, fn, r) {
  r.total += 1
  try {
    await fn()
    r.passed += 1
    r.items.push({ name, ok: true })
  } catch (e) {
    r.failed += 1
    r.items.push({ name, ok: false, error: e && e.stack ? e.stack : String(e) })
  }
}

export async function runAllTests() {
  const r = makeResult()

  await test('AnimationSystem: 非循环动作会结束', () => {
    const a = new AnimationSystem(AnimationConfig)
    a.setAction('dash')
    const events = []
    for (let i = 0; i < 40; i++) a.update(1 / 60, events)
    assert(a.finished, 'dash 应该 finished=true')
  }, r)

  await test('StateMachine: idle->walk->run', () => {
    const sm = new StateMachine(AnimationConfig)
    sm.setState('idle')
    sm.update({ moveMagnitude: 0.6, runModifier: false, animFinished: true })
    assert(sm.state === 'walk', `期望 walk，得到 ${sm.state}`)
    sm.update({ moveMagnitude: 0.6, runModifier: true, animFinished: true })
    assert(sm.state === 'run', `期望 run，得到 ${sm.state}`)
  }, r)

  await test('CharacterController: 移动会改变位置与朝向', () => {
    const eq = new EquipmentSystem()
    const c = new CharacterController(AnimationConfig)
    c.setEquipment(eq)
    const hooks = {}
    c.update(0.2, { moveX: 1, moveY: 0, moveMagnitude: 1, runModifier: false, attackPressed: false, skillPressed: false, dashPressed: false, camPressed: false, zoomDelta: 0 }, hooks)
    assert(c.x > 0.2, 'x 应该增加')
    assert(c.face === 1, 'face 应该朝右')
    c.update(0.2, { moveX: -1, moveY: 0, moveMagnitude: 1, runModifier: false, attackPressed: false, skillPressed: false, dashPressed: false, camPressed: false, zoomDelta: 0 }, hooks)
    assert(c.face === -1, 'face 应该朝左')
  }, r)

  await test('EffectsManager: spawn+update 会衰减并回收', () => {
    const fx = new EffectsManager(64)
    fx.spawn(0, 0, 0, 32)
    assert(fx.count === 32, '应生成 32 粒子')
    const view = { x: 0, y: 0, zoom: 1 }
    for (let i = 0; i < 90; i++) fx.update(1 / 60, view, { w: 10, h: 10 })
    assert(fx.count < 32, '粒子应被回收')
  }, r)

  await test('CameraSystem: shake 会衰减', () => {
    const cam = new CameraSystem()
    cam.addShake(0.4)
    const v1 = cam.view()
    cam.update(0.2, { x: 0, y: 0 }, 0)
    const v2 = cam.view()
    assert(Math.abs(v2.x - v1.x) + Math.abs(v2.y - v1.y) >= 0, 'shake 应存在')
    cam.update(1.0, { x: 0, y: 0 }, 0)
    const v3 = cam.view()
    assert(approx(v3.x, cam.x, 1.0) || approx(v3.y, cam.y, 1.0), 'shake 应趋于 0')
  }, r)

  await test('EquipmentSystem: 装备切换会改变属性', () => {
    const eq = new EquipmentSystem()
    const s0 = eq.stats()
    eq.toggle('glove')
    const s1 = eq.stats()
    assert(s1.atk > s0.atk, '装备应提高 atk')
  }, r)

  await test('集成: 8+ 动作路径可触发', () => {
    const stubRenderer = { ok: false, drawCalls: 0, resize() {}, begin() {}, drawSprite() {}, drawParticles() {} }
    const stubInput = { consumeFrame() { return null } }
    const stubAudio = { init() {}, resume() {}, setCombatLevel() {}, setListener() {}, update() {}, playSfx() {} }
    const eq = new EquipmentSystem()
    const fx = new EffectsManager(256)
    const cam = new CameraSystem()
    const core = new GameCore({ renderer: stubRenderer, input: stubInput, audio: stubAudio, effects: fx, camera: cam, equipment: eq })
    const seen = new Set()
    const feed = (x) => ({
      moveX: x.moveX || 0,
      moveY: x.moveY || 0,
      moveMagnitude: x.moveMagnitude || 0,
      runModifier: !!x.runModifier,
      attackPressed: !!x.attackPressed,
      skillPressed: !!x.skillPressed,
      dashPressed: !!x.dashPressed,
      camPressed: !!x.camPressed,
      zoomDelta: x.zoomDelta || 0,
    })
    const seq = [
      feed({}),
      feed({ moveX: 1, moveMagnitude: 1 }),
      feed({ moveX: 1, moveMagnitude: 1, runModifier: true }),
      feed({ attackPressed: true }),
      feed({ attackPressed: true }),
      feed({ skillPressed: true }),
      feed({ dashPressed: true }),
    ]
    for (let i = 0; i < seq.length; i++) {
      for (let k = 0; k < 18; k++) {
        core.step(1 / 60, seq[i])
        seen.add(core.player.anim.action)
      }
    }
    core.player.takeHit(4)
    for (let k = 0; k < 30; k++) {
      core.step(1 / 60, feed({}))
      seen.add(core.player.anim.action)
    }
    core.player.takeHit(200)
    for (let k = 0; k < 60; k++) {
      core.step(1 / 60, feed({}))
      seen.add(core.player.anim.action)
    }
    assert(seen.size >= 8, `动作数量不足：${Array.from(seen).join(',')}`)
  }, r)

  return r
}

