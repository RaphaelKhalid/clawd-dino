import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { ClawdGame } from '../types'

const BEST = 'best'
const MODES = ['auto', 'play', 'paused', 'over']
const NUMBERS = ['time', 'idleMs', 'y', 'vy', 'speed', 'score', 'dist', 'nextGap', 'best', 'seed'] as const

// The game as the band last showed it this session, so the next turn picks it up.
const saved = atom({ plugin: 'clawd-dino', key: 'game' } as const, null)

function isGame(data: unknown): data is ClawdGame {
  if (typeof data !== 'object' || data === null) return false
  const g = data as Record<string, unknown>
  return (
    MODES.includes(g.mode as string) &&
    NUMBERS.every(k => typeof g[k] === 'number' && Number.isFinite(g[k])) &&
    Array.isArray(g.obstacles) &&
    g.obstacles.length <= 64 &&
    g.obstacles.every(
      o =>
        typeof o === 'object' &&
        o !== null &&
        Number.isFinite((o as { x: unknown }).x) &&
        [0, 1, 2].includes((o as { kind: unknown }).kind as number),
    )
  )
}

export const register: Register = on => {
  // The game lives in the band above the prompt, and only while a turn runs.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.surface !== 'terminal' || !e.props.isWorking || e.props.hasSurvey) {
      return next(e)
    }

    const best = Number((await $.store.get(BEST)) ?? 0) || 0
    const resume = await read($, saved)
    const { Client } = $.ui.resolve(e)

    return (
      <Client
        key="clawd-dino"
        module="./game.tsx"
        props={{ best, resume }}
        width={e.props.bodyColumns}
        height={7}
      />
    )
  })

  // The game posts { game } as it runs: keep it for the session, and its high score for good.
  on('ui.message', async ($, e, next) => {
    const game = (e.data as { game?: unknown } | null)?.game
    if (e.element !== 'clawd-dino' || !isGame(game)) {
      return next(e)
    }

    await update($, saved, () => game)
    const best = Number((await $.store.get(BEST)) ?? 0) || 0
    if (game.best > best) await $.store.set(BEST, Math.floor(game.best))

    return {}
  })
}
