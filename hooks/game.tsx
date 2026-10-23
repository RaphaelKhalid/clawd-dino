import type { ClientElements, ClientModule, Color, RenderElement } from 'claude-code'

import type { ClawdGame as Game, ClawdMode as Mode, ClawdObstacle as Obstacle } from '../types'

// Chrome's offline dino game, with Clawd. Autopilot runs it until someone
// clicks the band and presses space/up; then it's a real game. Units are
// cells, rows and seconds; one tick is TICK_MS.

type Props = { best: number; resume: Game | null }

export const TICK_MS = 32
const DT = TICK_MS / 1000
const ROWS = 7
const GROUND = ROWS - 1
const FLOOR = GROUND - 1
const CX = 3
const HIT_L = CX + 2
const HIT_R = CX + 5
const AIRTIME = 1.0
const PEAK = 3.6
const GRAVITY = (8 * PEAK) / (AIRTIME * AIRTIME)
const JUMP_V = (GRAVITY * AIRTIME) / 2
const START_SPEED = 20
const MAX_SPEED = 34
const ACCEL = 0.35
const FIRST_SPAWN_MS = 600
const IDLE_TO_AUTO_MS = 5000
const RETRY_LOCK_MS = 300
const SAVE_EVERY_MS = 100

const CLAWD = [' ▐▛███▜▌', '▝▜█████▛▘']
const LEGS = ['  ▘▘ ▝▝', '  ▝▝ ▘▘']
const CACTI = [
  { rows: ['▙█▟'], h: 1 },
  { rows: ['▙█▟', ' █ '], h: 2 },
  { rows: ['▙█▟▙█▟', ' █  █ '], h: 2 },
]

const widthOf = (o: Obstacle) => CACTI[o.kind]!.rows[0]!.length
const copy = (g: Game): Game => ({ ...g, obstacles: g.obstacles.map(o => ({ ...o })) })

function rand(g: Game): number {
  g.seed = (Math.imul(g.seed, 1664525) + 1013904223) >>> 0
  return g.seed / 4294967296
}

export function fresh(mode: Mode, best: number, seed: number): Game {
  return {
    mode,
    time: 0,
    idleMs: 0,
    y: 0,
    vy: 0,
    speed: START_SPEED,
    score: 0,
    dist: 0,
    obstacles: [],
    nextGap: 0,
    best,
    seed,
  }
}

// Where the band picks up: a real game comes back paused, so nobody dies looking away.
export function resumed(saved: Game | null, best: number, seed: number): Game {
  if (saved === null || saved.mode === 'over') return fresh('auto', Math.max(best, saved?.best ?? 0), seed)
  const g = copy(saved)
  g.best = Math.max(g.best, best)
  if (g.mode === 'play') g.mode = 'paused'

  return g
}

function jump(g: Game): void {
  if (g.y === 0) {
    g.vy = JUMP_V
    g.y = 0.001
  }
}

export function step(prev: Game, columns: number): Game {
  if (prev.mode === 'paused') return prev

  const g = copy(prev)
  g.time += TICK_MS
  g.idleMs += TICK_MS

  if (g.mode === 'over') {
    return g.idleMs > IDLE_TO_AUTO_MS ? fresh('auto', g.best, g.seed) : g
  }

  if (g.y > 0) {
    g.y += g.vy * DT - (GRAVITY * DT * DT) / 2
    g.vy -= GRAVITY * DT
    if (g.y <= 0) {
      g.y = 0
      g.vy = 0
    }
  }

  g.speed = Math.min(MAX_SPEED, g.speed + ACCEL * DT)
  const move = g.speed * DT
  g.score += move * 0.6
  g.dist += move

  for (const o of g.obstacles) o.x -= move
  g.obstacles = g.obstacles.filter(o => o.x + widthOf(o) > 0)

  const last = g.obstacles[g.obstacles.length - 1]
  const due =
    last === undefined ? g.time > FIRST_SPAWN_MS : columns - (last.x + widthOf(last)) >= g.nextGap
  if (due) {
    const kinds = g.speed < 24 ? 2 : 3
    g.obstacles.push({ x: columns, kind: Math.floor(rand(g) * kinds) })
    g.nextGap = Math.ceil(g.speed * (AIRTIME + 0.1)) + 4 + Math.floor(rand(g) * g.speed * 0.6)
  }

  // The autopilot jumps so the obstacle passes under the top of the arc.
  if (g.mode === 'auto' && g.y === 0) {
    const next = g.obstacles.find(o => Math.round(o.x) + widthOf(o) - 1 >= HIT_L)
    if (next !== undefined) {
      const gap = Math.round(next.x) - HIT_R
      const lead = (g.speed * AIRTIME) / 2 - (HIT_R - HIT_L + 1 + widthOf(next)) / 2
      if (gap >= 0 && gap <= lead) jump(g)
    }
  }

  const hit = g.obstacles.some(o => {
    const x = Math.round(o.x)
    return x <= HIT_R && x + widthOf(o) - 1 >= HIT_L && g.y < CACTI[o.kind]!.h - 0.3
  })
  if (hit) {
    if (g.mode === 'auto') return fresh('auto', g.best, g.seed)
    g.mode = 'over'
    g.idleMs = 0
    g.best = Math.max(g.best, Math.floor(g.score))
  }

  return g
}

export function press(prev: Game, key: 'jump' | 'down'): Game {
  if (prev.mode === 'over' && prev.idleMs <= RETRY_LOCK_MS) return prev
  const g =
    prev.mode === 'play' || prev.mode === 'paused' ? copy(prev) : fresh('play', prev.best, prev.seed)
  g.mode = 'play'
  g.idleMs = 0
  if (key === 'jump') jump(g)
  else if (g.y > 0) g.vy = Math.min(g.vy, -JUMP_V / 2)

  return g
}

const pad = (n: number) => String(Math.floor(n)).padStart(5, '0')

function draw(g: Game, columns: number, { Box, Text }: ClientElements): RenderElement {
  const chars = Array.from({ length: ROWS }, () => Array<string>(columns).fill(' '))
  const colors = Array.from({ length: ROWS }, () => Array<Color | null>(columns).fill(null))
  const put = (row: number, col: number, text: string, color: Color | null) => {
    if (row < 0 || row >= ROWS) return
    for (let i = 0; i < text.length; i++) {
      const c = col + i
      if (c < 0 || c >= columns || text[i] === ' ') continue
      chars[row]![c] = text[i]!
      colors[row]![c] = color
    }
  }

  for (let c = 0; c < columns; c++) {
    const world = Math.floor(g.dist) + c
    const bump = Math.imul(world, 2654435761) >>> 0
    put(GROUND, c, bump % 13 === 0 ? '╌' : '─', 'subtle')
  }

  for (const o of g.obstacles) {
    const rows = CACTI[o.kind]!.rows
    rows.forEach((text, i) => put(FLOOR - (rows.length - 1 - i), Math.round(o.x), text, 'success'))
  }

  const body: Color = g.mode === 'over' ? 'error' : 'claude'
  const feet = FLOOR - Math.floor(g.y)
  const still = g.y > 0 || g.mode === 'over' || g.mode === 'paused'
  const legs = still ? LEGS[0]! : LEGS[Math.floor(g.time / 110) & 1]!
  put(feet - 2, CX, CLAWD[0]!, body)
  put(feet - 1, CX, CLAWD[1]!, body)
  put(feet, CX, legs, body)

  const scoreText = `HI ${pad(g.best)}  ${pad(g.score)}`
  put(0, columns - scoreText.length - 1, scoreText, 'subtle')

  const hint = {
    auto: 'autopilot · click here, then space/↑ to play',
    play: 'space/↑ jump · esc back to prompt',
    paused: 'click here, then space/↑ to carry on',
    over: '',
  }[g.mode]
  const room = columns - scoreText.length - CX - 14
  if (hint !== '' && room > 8) {
    put(0, CX + 11, hint.length > room ? hint.slice(0, room - 1) + '…' : hint, 'subtle')
  }

  const banner =
    g.mode === 'over'
      ? { title: 'G A M E   O V E R', sub: g.idleMs > RETRY_LOCK_MS ? 'space to retry' : '' }
      : g.mode === 'paused'
        ? { title: 'P A U S E D', sub: 'space to carry on' }
        : null
  if (banner !== null) {
    put(1, Math.floor((columns - banner.title.length) / 2), banner.title, 'claude')
    put(2, Math.floor((columns - banner.sub.length) / 2), banner.sub, 'subtle')
  }

  const lines = chars.map((row, r) => {
    const spans: (string | RenderElement)[] = []
    let start = 0
    for (let c = 1; c <= columns; c++) {
      if (c < columns && colors[r]![c] === colors[r]![start]) continue
      const text = row.slice(start, c).join('')
      const color = colors[r]![start]
      spans.push(color === null || color === undefined ? text : <Text color={color}>{text}</Text>)
      start = c
    }

    return <Text wrap="truncate">{spans}</Text>
  })

  return <Box flexDirection="column">{lines}</Box>
}

const ClawdDino: ClientModule<Props, Game> = (props, surface) => {
  const columns = Math.max(24, surface.columns || 60)
  let g = surface.state

  if (g === undefined) {
    g = resumed(props.resume, props.best, (Date.now() ^ 0x9e3779b9) >>> 0)
    let savedAt = -Infinity

    const save = (next: Game) => {
      savedAt = next.time
      surface.post({ game: next })
    }
    const act = (key: 'jump' | 'down') => {
      const cur = surface.state
      if (cur === undefined) return
      const next = press(cur, key)
      if (next !== cur) {
        save(next)
        surface.setState(next)
      }
    }

    surface.every(TICK_MS, () => {
      const cur = surface.state
      if (cur === undefined) return
      const next = step(cur, Math.max(24, surface.columns || 60))
      if (next === cur) return
      if (next.mode !== cur.mode || next.time < savedAt || next.time - savedAt >= SAVE_EVERY_MS) save(next)
      surface.setState(next)
    })
    surface.onKey(k => {
      if (k.key === ' ' || k.key === 'space' || k.key === 'up' || k.key === 'w' || k.key === 'return') act('jump')
      else if (k.key === 'down' || k.key === 's') act('down')
    })
    surface.onPointer(p => {
      if (p.type === 'down') act('jump')
    })
    surface.setState(g)
  }

  if (props.best > g.best) g.best = props.best

  return draw(g, columns, surface.elements)
}

export default ClawdDino
