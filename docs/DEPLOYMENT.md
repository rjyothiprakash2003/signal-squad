# Deployment

The production process is a single Node server. It serves the built client from `dist/client` and accepts Socket.IO on the same port. Rooms stay in that process. Run one instance. A second instance has an empty room map, so two players can be split across servers and will not see each other.

## Build

From `game/`:

```bash
npm ci
npm run build
npm start
```

`npm start` is `NODE_ENV=production node dist/server/index.js`. It listens on `PORT` (default 8787) and `HOST` (default `0.0.0.0`).

Check it:

```bash
curl -s http://127.0.0.1:8787/api/health
```

Expect `ok: true`. Open `/` in a browser, create a room, and join from a second browser pointed at the same origin.

## Environment

```bash
NODE_ENV=production
TRUST_PROXY=1
PORT=8787
```

Set `TRUST_PROXY=1` only when the platform overwrites `X-Forwarded-For`. Leave it at `0` if the Node process is exposed directly. The rest of the variables are documented in `.env.example`. None of them are secrets.

HTTPS has to be terminated by the platform. The content security policy allows connections to the same origin, which is correct when the page and the socket share that HTTPS origin.

## Docker

```bash
docker build -t signal-squad .
docker run --rm -p 8787:8787 -e TRUST_PROXY=1 signal-squad
```

The image is multi-stage. The runtime stage installs production dependencies only and copies `dist/`. `NODE_ENV=production` is set in the image.

## Render

`render.yaml` describes a Node web service:

- Build: `npm ci && npm run build`
- Start: `npm start`
- Health check: `/api/health`
- `TRUST_PROXY=1`

What you do:

1. Push this project to a Git host Render can read.
2. Create a Blueprint from `render.yaml`, or create a Web Service with the commands above and root directory `game` if the repository root is the parent folder.
3. Confirm the service is a single instance.
4. Open the Render URL, create a room, and join from a second device.

## Fly.io

`fly.toml` expects an app named `signal-squad-decode`. Change `app` if that name is taken. `min_machines_running = 1` keeps a single machine up so a demo is not asleep. A machine restart still clears rooms.

What you do:

1. Install the Fly CLI and sign in: `fly auth login`.
2. From `game/`: `fly launch --no-deploy` if you want Fly to confirm the app name, or `fly apps create signal-squad-decode`.
3. `fly deploy`.
4. `fly status` and open the `https://…fly.dev` hostname.
5. Create a room on that hostname and join from another device.

## Other hosts

Any host that can run `npm run build` and `npm start` on Node 20+ works, including a small VPS:

```bash
npm ci
npm run build
NODE_ENV=production TRUST_PROXY=1 PORT=8787 node dist/server/index.js
```

Put Caddy, nginx, or the platform proxy in front for HTTPS, and proxy WebSocket upgrades for `/socket.io/`.

`Procfile` contains `web: npm start` for hosts that use that convention.

## What was not deployed from this workspace

No Fly token, Render token, Railway token, Vercel token, or tunnel client was available here. A public URL was not created, and none should be invented. After you deploy, put the real URL in your submission and play a full round from two devices before calling it verified.

## Production checks

- `/` loads without a login.
- Create room, join from a second device, start, chat, solve, and see one shared score.
- Refresh one player and confirm the fragment returns.
- View source and the JS bundle and confirm they do not contain campaign answers. Searching the built client for a known answer such as `2424` is a useful spot check; the string can theoretically appear by chance, so also confirm `server/puzzles.ts` is not copied into `dist/client`.
- `/api/health` stays up after a bad request.
- Restart the process and confirm rooms are gone. That is the documented memory limit, and it should be obvious to anyone operating the demo.
