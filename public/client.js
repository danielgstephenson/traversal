/* global Matter */

const canvas = document.getElementById('canvas')
const deathDiv = document.getElementById('deathDiv')
const levelCompleteDiv = document.getElementById('levelCompleteDiv')

// Parameters
const trailLength = 100
const linearDrag = 0.005
const timeStep = 1 / 30

// Utility Functions
const range = n => [...Array(n).keys()]
const clamp = (a, b, x) => Math.max(a, Math.min(b, x))
const runif = (a, b) => a + (b - a) * Math.random()
const rdirection = () => {
  const angle = runif(0, 2 * Math.PI)
  return { x: Math.cos(angle), y: Math.sin(angle) }
}
const magnitude = function (v) {
  return Math.sqrt(v.x * v.x + v.y * v.y)
}
const mult = (v, c) => ({ x: c * v.x, y: c * v.y })
const neg = (v) => mult(v, -1)
const add = (v, w) => ({ x: v.x + w.x, y: v.y + w.y })
const subtract = (v, w) => add(v, neg(w))
const getDist = (v, w) => magnitude(add(v, neg(w)))
const normalize = (v) => {
  const mag = magnitude(v)
  if (mag === 0) return { x: 0, y: 0 }
  else return mult(v, 1 / mag)
}
function getColorString (color, alpha = 1) {
  return `rgba(${color.red},${color.green},${color.blue},${alpha})`
}

// Disable Right Click Menu
document.oncontextmenu = () => false

// Initialize Matter.js
const Engine = Matter.Engine
const Render = Matter.Render
const Bodies = Matter.Bodies
const Composite = Matter.Composite
const Events = Matter.Events
const Body = Matter.Body
const engine = Engine.create()
engine.world.gravity.y = 0
const render = Render.create({
  element: document.body,
  canvas: canvas,
  engine: engine
})
render.options.background = 'rgb(0,0,0)'
render.options.wireframes = false
render.options.showBounds = false
render.options.showCollisions = false

const controls = [
  { key: 'w', input: 'up0' },
  { key: 's', input: 'down0' },
  { key: 'a', input: 'left0' },
  { key: 'd', input: 'right0' },
  { key: 'ArrowUp', input: 'up1' },
  { key: 'ArrowDown', input: 'down1' },
  { key: 'ArrowLeft', input: 'left1' },
  { key: 'ArrowRight', input: 'right1' },
  { key: 'Enter', input: 'select' }
]
const input = {
  up0: false,
  down0: false,
  left0: false,
  right0: false,
  up1: false,
  down1: false,
  left1: false,
  right1: false,
  select: false
}
const mouse = {
  absolute: { x: 100, y: 0 },
  position: { x: 0, y: 0 },
  angle: 0,
  buttons: 0,
  ready: false
}
const state = {
  core: {},
  guard: {},
  composites: [],
  actors: {},
  names: {},
  levelComplete: false,
  dead: false,
  paused: false,
  zoom: -1.4,
  scale: 1
}

// TO DO
/*
multiple levels
mobile hostiles
menu system
*/

function getSegmentParts (options) {
  const { x0, y0, x1, y1, thickness = 100, color = 'rgb(100,100,100)', name = 'segment' } = options
  const radius = 0.5 * thickness
  const xMid = 0.5 * (x0 + x1)
  const yMid = 0.5 * (y0 + y1)
  const dx = x1 - x0
  const dy = y1 - y0
  const length = Math.sqrt(dx * dx + dy * dy)
  const angle = Math.atan2(dy, dx)
  const rect = Bodies.rectangle(xMid, yMid, length, thickness, {
    render: { fillStyle: color },
    angle
  })
  if (options.actor) state.actors[rect.id] = options.actor
  rect.label = name
  const circleA = Bodies.circle(x0, y0, radius, {
    render: { fillStyle: color },
    restitution: 0
  })
  if (options.actor) state.actors[circleA.id] = options.actor
  circleA.label = name
  const circleB = Bodies.circle(x1, y1, radius, {
    render: { fillStyle: color },
    restitution: 0
  })
  if (options.actor) state.actors[circleB.id] = options.actor
  circleB.label = name
  return [rect, circleA, circleB]
}

function makeWall (options) {
  const { noise = 200, step = 500 } = options
  const groups = []
  const start = { x: options.x0, y: options.y0 }
  const end = { x: options.x1, y: options.y1 }
  const length = getDist(start, end)
  const steps = Math.ceil(length / step)
  const u = range(steps + 1).map(i => {
    if (i === 0 | i === steps) return { x: 0, y: 0 }
    else return mult(rdirection(), noise)
  })
  range(steps).forEach(i => {
    const r0 = i / steps
    const r1 = (i + 1) / steps
    const x0 = options.x1 * r0 + options.x0 * (1 - r0) + u[i].x
    const y0 = options.y1 * r0 + options.y0 * (1 - r0) + u[i].y
    const x1 = options.x1 * r1 + options.x0 * (1 - r1) + u[i + 1].x
    const y1 = options.y1 * r1 + options.y0 * (1 - r1) + u[i + 1].y
    const z = { x0, y0, x1, y1 }
    z.thickness = options.thickness
    z.color = 'rgb(50,50,50)'
    z.name = 'wall'
    groups.push(getSegmentParts(z))
  })
  const parts = groups.flat()
  const body = Body.create({
    parts,
    isStatic: true,
    restitution: 1
  })
  body.label = 'wall'
  state.composites.push(body)
}

function makeCore (options) {
  const { x = 0, y = 0 } = options
  mouse.position = { x: x, y: y }
  const actor = { trail: [], color: { red: 0, green: 220, blue: 255 } }
  const body = Bodies.circle(x, y, 40)
  body.render.fillStyle = getColorString(actor.color)
  body.frictionAir = linearDrag
  body.restitution = 0
  body.label = 'core'
  actor.body = body
  state.core = actor
  range(trailLength).forEach(i => { actor.trail.push({ x: body.x, y: body.y }) })
  state.actors[body.id] = actor
  state.composites.push(body)
}

function makeGuard (options) {
  const { x = 0, y = 0 } = options
  const actor = { trail: [], color: { red: 0, green: 255, blue: 100 } }
  const body = Bodies.circle(x, y, 28)
  body.render.fillStyle = getColorString(actor.color)
  body.frictionAir = 0
  body.restitution = 0
  body.label = 'guard'
  actor.body = body
  state.guard = actor
  range(trailLength).forEach(i => { actor.trail.push({ x: body.x, y: body.y }) })
  state.actors[body.id] = actor
  state.composites.push(body)
}

function makeHostileWall (options) {
  const actor = {}
  options.name = 'hostile'
  options.actor = actor
  options.color = 'rgb(255,0,0)'
  const parts = getSegmentParts(options)
  const body = Body.create({
    parts,
    isStatic: true,
    restitution: 1
  })
  body.label = 'hostile'
  state.composites.push(body)
  const remove = () => Composite.remove(engine.world, body)
  actor.body = body
  actor.remove = remove
  state.actors[body.id] = actor
}

function makeGoal (options) {
  const { x = 0, y = 0 } = options
  const body = Bodies.circle(x, y, 100)
  body.render.fillStyle = 'rgb(230,255,0)'
  body.label = 'goal'
  body.isStatic = true
  state.composites.push(body)
}

const propel = (body, direction, power) => {
  const force = mult(normalize(direction), power)
  Body.applyForce(body, body.position, force)
}

function propelTowards (body, target, power) {
  const direction = subtract(target, body.position)
  propel(body, direction, power)
}

Events.on(engine, 'afterUpdate', e => {
  updateMousePosition()
  updateCore()
  updateGuard()
})

function updateCore () {
  const core = state.core
  const direction = {
    x: 1 * input.right0 + 1 * input.right1 - 1 * input.left0 - 1 * input.left1,
    y: 1 * input.down0 + 1 * input.down1 - 1 * input.up0 - 1 * input.up1
  }
  propel(core.body, direction, 0.005)
  propelTowards(core.body, mouse.position, 0.005)
  core.trail.pop()
  core.trail.unshift({ x: core.body.position.x, y: core.body.position.y })
}

function updateGuard () {
  const guard = state.guard
  const guardPos = guard.body.position
  const corePos = state.core.body.position
  const tension = 0.005 * clamp(0, 5, getDist(corePos, guardPos) / 1000)
  propelTowards(guard.body, state.core.body.position, tension)
  guard.trail.pop()
  guard.trail.unshift({ x: guard.body.position.x, y: guard.body.position.y })
}

function startLevel () {
  Composite.clear(engine.world, false, true)
  loadLevel()
}

function loadLevel () {
  state.player = { radius: 40, power: 0.005, coreTrail: [], guardTrail: [] }
  state.composites = []
  state.actors = {}
  state.names = {}
  state.dead = false
  state.levelComplete = false
  state.paused = false
  deathDiv.style.opacity = 0
  levelCompleteDiv.style.opacity = 0
  Math.seedrandom(1)
  makeCore({ x: 0, y: 0 })
  makeGuard({ x: 0, y: 600 })
  makeHostileWall({ x0: 12000, y0: 1800, x1: 12000, y1: -1800, thickness: 500 })
  makeWall({ x0: -1000, y0: -1800, x1: -1000, y1: 1800, thickness: 1500, step: 500, noise: 100 })
  makeWall({ x0: -1000, y0: -1800, x1: 16000, y1: -1800, thickness: 1500, step: 500, noise: 100 })
  makeWall({ x0: -1000, y0: 1800, x1: 16000, y1: 1800, thickness: 1500, step: 500, noise: 100 })
  makeWall({ x0: 16000, y0: -1800, x1: 16000, y1: 1800, thickness: 1500, step: 500 })
  makeGoal({ x: 14000, y: 0 })
  makeGoal({ x: 14000, y: 0 })

  Composite.add(engine.world, state.composites)
}

Events.on(engine, 'collisionStart', e => {
  e.pairs.forEach(pair => {
    const orderings = [
      [pair.bodyA, pair.bodyB],
      [pair.bodyB, pair.bodyA]
    ]
    orderings.forEach(bodies => {
      const labels = bodies.map(body => body.label)
      const ids = bodies.map(body => body.id)
      if (labels[0] === 'core' && labels[1] === 'guard') {
        pair.isActive = false
      }
      if (labels[0] === 'core' && labels[1] === 'door') {
        pair.isActive = false
        state.actors[ids[1]].action()
      }
      if (labels[0] === 'core' && labels[1] === 'hostile') {
        pair.isActive = false
        state.dead = true
        deathDiv.style.opacity = 1
      }
      if (labels[0] === 'core' && labels[1] === 'goal') {
        pair.isActive = false
        state.levelComplete = true
        levelCompleteDiv.style.opacity = 1
      }
      if (labels[0] === 'guard' && labels[1] === 'hostile') {
        pair.isActive = false
        if (!state.dead) state.actors[ids[1]].remove()
      }
    })
  })
})

Events.on(render, 'afterRender', e => {
  render.context.lineWidth = 2 * state.guard.body.circleRadius
  render.context.lineJoin = 'round'
  render.context.lineCap = 'round'
  render.context.beginPath()
  render.context.moveTo(state.guard.trail[0].x, state.guard.trail[0].y)
  state.guard.trail.forEach((point, i) => {
    const ratio = 0.005 * (trailLength - i) / trailLength
    render.context.strokeStyle = getColorString(state.guard.color, ratio)
    render.context.lineTo(point.x, point.y)
    render.context.stroke()
  })
  render.context.lineWidth = 2 * state.core.body.circleRadius
  render.context.beginPath()
  render.context.moveTo(state.core.trail[0].x, state.core.trail[0].y)
  state.core.trail.forEach((point, i) => {
    const ratio = 0.005 * (trailLength - i) / trailLength
    render.context.strokeStyle = getColorString(state.core.color, ratio)
    render.context.lineTo(point.x, point.y)
    render.context.stroke()
  })
})

window.onkeydown = function (e) {
  controls.forEach(c => { if (e.key === c.key) input[c.input] = true })
  const select = e.key === 'Enter' || e.key === ' '
  if (select && state.dead) {
    startLevel()
  }
  if (select && state.levelComplete) {
    startLevel()
  }
}

window.onkeyup = function (e) {
  controls.forEach(c => { if (e.key === c.key) input[c.input] = false })
}

window.onwheel = function (e) {
  state.zoom -= 0.001 * e.deltaY
}

window.onmousemove = function (e) {
  handleMouseEvent(e)
}

window.onmousedown = function (e) {
  handleMouseEvent(e)
  if (state.dead) {
    startLevel()
  }
  if (state.levelComplete) {
    startLevel()
  }
}

window.onmouseup = function (e) {
  handleMouseEvent(e)
}

function handleMouseEvent (e) {
  mouse.absolute.x = (e.x - 0.5 * window.innerWidth)
  mouse.absolute.y = (e.y - 0.5 * window.innerHeight)
  mouse.angle = Math.atan2(mouse.absolute.y, mouse.absolute.x)
  mouse.buttons = e.buttons
  mouse.ready = true
  updateMousePosition()
}

function updateMousePosition () {
  mouse.position.x = state.core.body.position.x + state.scale * mouse.absolute.x
  mouse.position.y = state.core.body.position.y + state.scale * mouse.absolute.y
}

function setupRenderBounds () {
  const pixels = 400
  render.options.width = pixels
  render.options.height = pixels
  render.canvas.width = pixels
  render.canvas.height = pixels
  render.context.imageSmoothingEnabled = true
  state.scale = Math.exp(-state.zoom)
  const minSize = Math.min(window.innerWidth, window.innerHeight)
  render.bounds.max.x = state.core.body.position.x + state.scale * minSize / 2
  render.bounds.max.y = state.core.body.position.y + state.scale * minSize / 2
  render.bounds.min.x = state.core.body.position.x - state.scale * minSize / 2
  render.bounds.min.y = state.core.body.position.y - state.scale * minSize / 2
  Render.startViewTransform(render)
}

function update () {
  if (!state.paused && !state.dead && !state.levelComplete) {
    Engine.update(engine, 1000 * timeStep)
  }
}

function draw () {
  setupRenderBounds()
  Render.world(render)
  window.requestAnimationFrame(draw)
}

loadLevel()
draw()
setInterval(update, 1000 * timeStep)
