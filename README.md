# edu-50s

Interactive visual show for a 50th birthday — Electron + Three.js WebGL scenes switchable via keyboard.

## Running

```bash
yarn dev          # hot-reload dev server (browser)
yarn electron:dev # package + launch in Electron
```

## Architecture

Scenes live in `src/js/gfx/layers/`. Each one extends `ThreeSketch` and implements `update(time: number)`.

They are registered in `src/js/core/App.ts` and switched at runtime with keyboard keys `1`–`N`.

```
src/js/
  core/App.ts           — main loop, layer registry, keyboard switching
  gfx/
    ThreeSketch.ts      — base layer (PerspectiveCamera + render setup)
    palette.ts          — shared colour constants (BLACK, WHITE, RED)
    layers/
      Layer01.ts        — colour flash scene (b/w + red, BPM-driven stripes)
      Layer02.ts        — ...
```

## Adding a scene

1. Create `src/js/gfx/layers/LayerNN.ts` extending `ThreeSketch`
2. Import and push it into `this.layers` in `App.ts`
3. Press the corresponding number key to activate

## Visual style

- Palette: black, white, red (`#cc0000`) — see `src/js/gfx/palette.ts`
- Canvas: full HD 1920 × 1080
- Always import colours from `palette.ts`, never hardcode

## Stack

- [Electron](https://www.electronjs.org/)
- [Three.js](https://threejs.org/)
- [@fils/gl-dom](https://github.com/fil-studio/fils) — WebGL/DOM layer system
- [GSAP](https://gsap.com/) — animation
- [11ty](https://www.11ty.dev/) + ESBuild + SASS — dev/build pipeline

### License

Copyright 2026, Fil Studio — Apache License 2.0
