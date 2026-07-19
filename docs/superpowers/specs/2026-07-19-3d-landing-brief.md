# 3D landing rebuild — brief (owner request 2026-07-19)

Replace the SVG scroll scene with a real-time **3D** scroll experience that
animates the ENTIRE home page, and use a **realistic car model** ("look on
the internet how a car looks" — the hand-drawn SVG car was rejected twice).

## Requirements (owner's words)
- The whole website animated — every single element on the home page takes
  part (hero/totem, station story, map section, "Where Gasify works" grid,
  footer), not one pinned section among static ones.
- 3D, not 2D. Realistic car (use a quality free model, not hand-drawn).
- Keep the existing narrative beats (they were approved): night station
  powers on → car arrives → LED prices roll red→green → savings → pull-back
  to "427,000 stations" constellation → live map → country grid.
- Scroll-scrubbed and slow (v3's 520vh pacing was accepted).

## Tech plan
- `three` + `@react-three/fiber` + `@react-three/drei` (ScrollControls or
  the proven body-scroller scrub: globals.css makes BODY the scroll
  container — capture scroll on document, drive camera/timeline from rect
  progress. See ScrollStation.js for the working listener pattern.)
- Car: CC0/free GLB (e.g. a low-poly-but-smooth stylized sedan from
  Kenney/Quaternius/Sketchfab CC0; draco-compress; keep < 1MB). Verify the
  licence and credit in docs/DATA_SOURCES.md if attribution required.
- Scene: forecourt rebuilt in 3D (canopy, pumps, emissive LED signs using
  the DSEG7 texture/canvas texture for rolling prices, brand palette
  #37D3A0/#E8A23D/#E25A5A on #07090D night). Camera dollies along the
  story; sections (map iframe/preview, country grid) appear as HTML
  overlays choreographed to camera progress (drei <Html> or plain DOM
  synced to the same progress).
- Perf/quality floor: lazy-load the 3D bundle (dynamic import, ssr:false);
  static fallback image + assembled DOM for prefers-reduced-motion, mobile
  low-power mode (cap DPR, no shadows); keep Lighthouse sane.
- Current SVG version (commit 053499d) stays live until the 3D one passes
  the same headless screenshot verification at multiple scroll depths.

## Verification
Puppeteer screenshots at ≥6 scroll depths, zero console errors, FPS sanity
(no long tasks > 100ms during scrub), reduced-motion fallback renders.
