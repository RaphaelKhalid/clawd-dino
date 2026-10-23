export type ClawdMode = 'auto' | 'play' | 'paused' | 'over'

export type ClawdObstacle = { x: number; kind: number }

export type ClawdGame = {
  mode: ClawdMode
  time: number
  idleMs: number
  y: number
  vy: number
  speed: number
  score: number
  dist: number
  obstacles: ClawdObstacle[]
  nextGap: number
  best: number
  seed: number
}

declare module 'claude-code' {
  interface PluginState {
    'clawd-dino': { game: ClawdGame | null }
  }
}
