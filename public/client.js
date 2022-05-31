/* global Matter */

const canvas = document.getElementById('canvas')
canvas.imageSmoothingEnabled = false

const range = n => [...Array(n).keys()]
const magnitude = function (v) {
  return Math.sqrt(v.x * v.x + v.y * v.y)
}
const mult = (v, c) => ({ x: c * v.x, y: c * v.y })
const neg = (v) => mult(v, -1)
const add = (v, w) => ({ x: v.x + w.x, y: v.y + w.y })
const subtract = (v, w) => add(v, neg(w))
const normalize = (v) => {
  const mag = magnitude(v)
  if (mag === 0) return v
  else return mult(v, 1 / mag)
}

// Disable Right Click Menu
document.oncontextmenu = () => false

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

const Engine = Matter.Engine
const Render = Matter.Render
const Bodies = Matter.Bodies
const Composite = Matter.Composite
const Events = Matter.Events
const Body = Matter.Body

const trailLength = 100

// TO DO
/*
seed random (needs library)
jagged walls
openable green doors
yellow goal
enemies
*/

const roles = {
  wall: {
    category: Body.nextCategory(),
    color: { red: 100, green: 100, blue: 100 }
  },
  playerCore: {
    category: Body.nextCategory(),
    color: { red: 0, green: 0, blue: 255 }
  },
  playerGuard: {
    category: Body.nextCategory(),
    color: { red: 0, green: 200, blue: 255 }
  },
  door: {
    category: Body.nextCategory(),
    color: { red: 0, green: 150, blue: 0 }
  },
  enemy: {
    category: Body.nextCategory(),
    color: { red: 255, green: 0, blue: 0 }
  },
  goal: {
    category: Body.nextCategory(),
    color: { red: 255, green: 232, blue: 0 }
  }
}

const state = {
  player: {},
  composites: [],
  actor: {},
  name: {},
  death: false,
  paused: false,
  zoom: -1,
  scale: 1
}

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

function getColorString (color, alpha = 1) {
  return `rgba(${color.red},${color.green},${color.blue},${alpha})`
}

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
  state.name[rect.id] = name
  const circleA = Bodies.circle(x0, y0, radius, {
    render: { fillStyle: color },
    restitution: 0
  })
  state.name[circleA.id] = name
  const circleB = Bodies.circle(x1, y1, radius, {
    render: { fillStyle: color },
    restitution: 0
  })
  state.name[circleB.id] = name
  return [rect, circleA, circleB]
}

function makeWall (options) {
  options.name = 'wall'
  options.color = getColorString(roles.wall.color)
  const parts = getSegmentParts(options)
  const wall = Body.create({
    parts,
    isStatic: true,
    restitution: 0
  })
  state.name[wall.id] = 'wall'
  wall.collisionFilter.category = roles.wall.category
  wall.collisionFilter.mask = roles.playerCore.category + roles.playerGuard.category
  state.composites.push(wall)
  return wall
}

function makePlayer (options) {
  const { x = 0, y = 0, angle = 0 } = options
  const player = { separation: 100, radius: 40, power: 0.01, coreTrail: [], guardTrail: [] }
  state.player = player
  const composite = Composite.create({ label: 'player' })
  player.composite = composite
  const core = Bodies.circle(x, y, player.radius)
  core.render.fillStyle = getColorString(roles.playerCore.color)
  core.frictionAir = 0.015
  core.collisionFilter.category = roles.playerCore.category
  core.collisionFilter.mask = roles.wall.category
  Composite.add(composite, core)
  state.name[core.id] = 'playerCore'
  player.core = core
  range(trailLength).forEach(i => { player.coreTrail.push({ x: core.x, y: core.y }) })
  state.actor[core.id] = player
  const cx = 0.5 * player.separation * Math.cos(angle)
  const cy = 0.5 * player.separation * Math.sin(angle)
  const guard = Bodies.circle(cx, cy, player.radius)
  guard.render.fillStyle = getColorString(roles.playerGuard.color)
  guard.frictionAir = 0.015
  guard.collisionFilter.category = roles.playerGuard.category
  guard.collisionFilter.mask = roles.wall.category
  Composite.add(composite, guard)
  state.name[guard.id] = 'playerCircle'
  player.guard = guard
  mouse.position = { x: cx, y: cy }
  range(trailLength).forEach(i => { player.guardTrail.push({ x: guard.x, y: guard.y }) })
  state.actor[guard.id] = player
  state.composites.push(composite)
}

const propel = (body, direction, power) => {
  const force = mult(normalize(direction), power)
  Body.applyForce(body, body.position, force)
}

function propelTowards (body, target, power) {
  const direction = subtract(target, body.position)
  propel(body, direction, power)
}

function updatePlayer () {
  const player = state.player
  const core = player.core
  const guard = player.guard
  setMousePosition()
  propelTowards(guard, mouse.position, player.power)
  player.coreTrail.pop()
  player.coreTrail.unshift({ x: core.position.x, y: core.position.y })
  player.guardTrail.pop()
  player.guardTrail.unshift({ x: guard.position.x, y: guard.position.y })
  const direction = {
    x: 1 * input.right0 + 1 * input.right1 - 1 * input.left0 - 1 * input.left1,
    y: 1 * input.down0 + 1 * input.down1 - 1 * input.up0 - 1 * input.up1
  }
  // console.log(direction)
  propel(core, direction, player.power)
}

function startLevel () {
  Composite.clear(engine.world, false, true)
  setup()
}

function setup () {
  state.player = {}
  state.composites = []
  state.actor = {}
  state.name = {}
  state.death = false
  state.paused = false
  makeWall({ x0: -1000, y0: -1000, x1: -500, y1: -200 })
  makeWall({ x0: 1000, y0: -1000, x1: 500, y1: -200 })
  makeWall({ x0: -1000, y0: 1000, x1: -500, y1: -200 })
  makeWall({ x0: 1000, y0: 1000, x1: 500, y1: -200 })
  makeWall({ x0: -1000, y0: 1000, x1: 1000, y1: 1000 })
  makePlayer({ x: 0, y: 0, angle: 0 })
  Composite.add(engine.world, state.composites)
}

Events.on(engine, 'afterUpdate', e => {
  setupRenderBounds()
  updatePlayer()
})

Events.on(render, 'afterRender', e => {
  render.context.lineWidth = 2 * state.player.guard.circleRadius
  render.context.lineJoin = 'round'
  render.context.lineCap = 'round'
  render.context.beginPath()
  render.context.moveTo(state.player.guardTrail[0].x, state.player.guardTrail[0].y)
  state.player.guardTrail.forEach((point, i) => {
    const ratio = 0.01 * (trailLength - i) / trailLength
    render.context.strokeStyle = getColorString(roles.playerGuard.color, ratio)
    render.context.lineTo(point.x, point.y)
    render.context.stroke()
  })
  render.context.beginPath()
  render.context.moveTo(state.player.coreTrail[0].x, state.player.coreTrail[0].y)
  state.player.coreTrail.forEach((point, i) => {
    const ratio = 0.01 * (trailLength - i) / trailLength
    render.context.strokeStyle = getColorString(roles.playerCore.color, ratio)
    render.context.lineTo(point.x, point.y)
    render.context.stroke()
  })
})

window.onkeydown = function (e) {
  controls.forEach(c => { if (e.key === c.key) input[c.input] = true })
  const select = e.key === 'Enter' || e.key === ' '
  if (select && state.death) {
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
  updateMouse(e)
}

window.onmousedown = function (e) {
  updateMouse(e)
  state.paused = true
  console.log(input)
}

window.onmouseup = function (e) {
  updateMouse(e)
  state.paused = false
}

function updateMouse (e) {
  mouse.absolute.x = (e.x - 0.5 * window.innerWidth)
  mouse.absolute.y = (e.y - 0.5 * window.innerHeight)
  mouse.angle = Math.atan2(mouse.absolute.y, mouse.absolute.x)
  mouse.buttons = e.buttons
  mouse.ready = true
  setMousePosition()
}

function setMousePosition () {
  mouse.position.x = state.player.core.position.x + state.scale * mouse.absolute.x
  mouse.position.y = state.player.core.position.y + state.scale * mouse.absolute.y
}

function setupRenderBounds () {
  state.scale = Math.exp(-state.zoom)
  render.bounds.max.x = state.player.core.position.x + state.scale * window.innerWidth / 2
  render.bounds.max.y = state.player.core.position.y + state.scale * window.innerHeight / 2
  render.bounds.min.x = state.player.core.position.x - state.scale * window.innerWidth / 2
  render.bounds.min.y = state.player.core.position.y - state.scale * window.innerHeight / 2
  Render.startViewTransform(render)
}

function setupCanvas () {
  render.options.width = window.innerWidth
  render.options.height = window.innerHeight
  render.canvas.width = window.innerWidth
  render.canvas.height = window.innerHeight
  setupRenderBounds()
}

function update () {
  if (!state.paused) Engine.update(engine, 1000 / 60)
}

setup()
Render.run(render)
window.addEventListener('resize', setupCanvas)
setupCanvas()
setInterval(update, 1000 / 60)
