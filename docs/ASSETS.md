# Assets

Decorative art lives in `public/assets/`. The game stays playable when an image fails: the header logo is inline SVG, and photographs use an `onError` fallback or a CSS placeholder.

## Files

| Path | Role |
| --- | --- |
| `public/assets/logo.svg` | Favicon and vector mark |
| `public/assets/logo-mark.jpg` | Raster mark used where a photograph fits |
| `public/assets/mission-control.jpg` | Landing hero |
| `public/assets/mission-control.svg` | Hero fallback if the JPEG fails |
| `public/assets/mission-illustrations/success.jpg` | Won result |
| `public/assets/mission-illustrations/failure.jpg` | Lost result |
| `public/assets/signal-icons/wave.svg` | Signal glyph |
| `public/assets/signal-icons/lock.svg` | Private fragment |
| `public/assets/signal-icons/chat.svg` | Squad chat |

Vite copies `public/` into `dist/client/` on build. The production server serves that directory.

## Licenses

- `logo.svg`, `mission-control.svg`, and the three signal icons were drawn for this project. You may use them as part of Signal Squad.
- `logo-mark.jpg`, `mission-control.jpg`, `success.jpg`, and `failure.jpg` were generated for this project. They contain no embedded text, trademarks, or characters from other works.
- Outfit and IBM Plex Mono are shipped through the `@fontsource/outfit` and `@fontsource/ibm-plex-mono` packages. Both typefaces are under the SIL Open Font License 1.1. The license texts ship inside those packages.

No stock photographs and no third-party illustrations are used.

## Screenshots

`docs/screenshots/` holds captures from the Playwright run: landing, lobby, both mission views, results, and a phone-width landing. They are documentation, not runtime assets. Regenerate them with:

```bash
npm run test:e2e
```

The end-to-end test writes those files while it plays a real round.
