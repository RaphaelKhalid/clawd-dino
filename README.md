# Clawd Dino

Chrome's offline dino game, starring Clawd, in Claude Code. While Claude is working, Clawd runs and jumps
over cacti in a strip above your prompt.

## Install

Paste this into Claude Code in your terminal:

```
/plugin install clawd-dino --marketplace RaphaelKhalid/clawd-dino
```

Answer `y` to add the marketplace, then press Enter to install it for your user.

## Play

- Clawd plays on autopilot until you click the strip. Then space or ↑ jumps and ↓ drops faster.
- Hold → or `d` to speed up, ← or `a` to slow down, mid-jump too. Faster scores faster.
- Esc gives the keys back to the prompt. (Pressed while the game isn't focused, Esc interrupts Claude as usual.)
- A game you leave mid-run comes back paused the next time Claude works. Your high score is saved.

It shows in the terminal CLI, including VS Code's integrated terminal, but not in the VS Code extension's
chat panel. It needs a recent Claude Code (`claude update`).

Unofficial fan project, not affiliated with Anthropic.
