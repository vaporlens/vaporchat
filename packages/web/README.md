# vaporchat web (debug harness)

Not a product. A browser page plus a small Bun server for debugging the vaporchat library and running
live voice tests from a desktop (`scripts/liveVoice.ts` drives it in headless Chromium). The real app
is `packages/mobile`.

The server only exists because browsers need help that phones don't: see "Platforms" in
`packages/vaporchat/README.md`.
