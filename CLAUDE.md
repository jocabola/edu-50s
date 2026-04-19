# edu-50s — Claude context

## Workflow
- Dev server with hot reload is always running — never run `yarn build` to verify changes
- Electron entry: `app/main.js` loads `public/index.html` (built output)

## Project
Birthday visual show. Scenes switch via keyboard `1`–`N`. Each scene is a `ThreeSketch` subclass.

## Colour palette
Always import from `src/js/gfx/palette.ts`:
- `BLACK` = `#000000`
- `WHITE` = `#ffffff`
- `RED`   = `#cc0000`

Never hardcode colours.

## Canvas
Full HD: 1920 × 1080. Orthographic camera in pixel space: `new OrthographicCamera(-960, 960, 540, -540, -1, 1)`.

## Adding a layer
1. Create `src/js/gfx/layers/LayerNN.ts` extending `ThreeSketch`
2. Register in `src/js/core/App.ts` — import + push to `this.layers`
3. Set `this.activeIndex` to the desired default during development

## Key files
- `src/js/core/App.ts` — loop, layer array, keyboard handler
- `src/js/gfx/ThreeSketch.ts` — base class (PerspectiveCamera, render)
- `src/js/gfx/palette.ts` — colours
- `src/js/gfx/layers/` — all scenes

## Dependencies
- Three.js — 3D/WebGL
- GSAP — animation tweens
- @fils/gl-dom — `ThreeDOMLayer` / `ThreeLayer` wrappers
- @fils/ani — `Timer` clock
