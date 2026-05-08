# SKILL.md — Installing Airpoint SDK

> This file is written for AI coding agents (Claude Code, Cursor, Copilot, Codex, etc.) integrating `@airpoint/sdk` into a user's web app.
> Humans: this is a deterministic install script the agent will follow. The full reference docs are in [README.md](./README.md).

## When to use this skill

Trigger this skill when the user asks to:

- "Add Airpoint", "add hand tracking", "add touchless control", "add gesture control" to a web app.
- "Install @airpoint/sdk", "set up Airpoint".
- Add a hand-controlled cursor or gesture-triggered actions to an existing page.

If the user is asking _what_ Airpoint is (not how to install), point them at the README instead.

## Preconditions to check first

Run these checks silently. Only mention them to the user if something fails.

1. **Web project?** There must be a `package.json`. If not, stop and ask the user where the web app is.
2. **Browser app?** Confirm the project runs in the browser (Vite, Next.js, Remix, Astro, SvelteKit, webpack, etc.). If it's a Node-only project, stop and explain Airpoint is browser-only.
3. **Package manager?** Detect from lockfile: `pnpm-lock.yaml` → pnpm, `yarn.lock` → yarn, `bun.lockb` → bun, otherwise npm.
4. **Framework?** Detect from `package.json` deps: `next` → Next.js, `vite` → Vite, `@sveltejs/kit` → SvelteKit, `astro` → Astro, `@remix-run/*` → Remix. This determines the env-var prefix and the static-assets folder.
5. **Static assets folder.** Default by framework:
   - Next.js, Vite, Remix, Astro: `public/`
   - SvelteKit: `static/`
   - Other / unknown: ask.

## Interview the user

Ask these questions **one at a time**, in order. Stop if the user says no to Q1. Skip later questions when an earlier answer makes them irrelevant.

1. **Install Airpoint hand tracking in this app?** _(yes / no)_
2. **Do you have an AirMouse license key?** _(yes, paste it / no, I want to build my own gestures from raw landmarks / no, get me a key)_
   - **Yes** — unlocks the AirMouse ML model. Ask **"Paste the key"** (stored in `.env*`, never committed).
   - **No, raw landmarks** — the SDK will emit `raw_landmarks` events; the user writes their own gesture detection. Skip Q4–Q5.
   - **No, get me a key** — point them at [airpoint.app](https://airpoint.app) and stop. They can re-run this skill once they have one.
3. **Show a cursor that follows the user's index finger?** _(yes / no)_
   - If yes: **Cursor style?** _(arrow / dot / ring)_ — default `arrow`.
4. **Click gesture?** _(thumb–index pinch / thumb–middle pinch / none)_ — default thumb–middle pinch.
5. **Scroll gesture?** _(thumb–ring pinch / none)_ — default thumb–ring pinch. Recommended; gives users a natural way to scroll the page with their hand.
6. **Where should the integration live?** _(suggest a path based on framework, e.g. `src/airpoint.ts` for Vite, `app/airpoint.ts` for Next.js App Router)_

After Q6, summarize the choices in 3–5 bullets and ask **"Proceed?"** before writing any files.

## Apply the changes

Do these steps in order. Report each one as you go.

### 1. Install the package

```bash
<pm> add @airpoint/sdk           # pnpm / yarn / bun
# or:
npm install @airpoint/sdk
```

### 2. Copy runtime assets

```bash
npx airpoint-sdk-copy-assets --out <static-dir> --base airpoint
```

Where `<static-dir>` is `public` (Vite/Next/Remix/Astro) or `static` (SvelteKit).

Add this command as a `postinstall` script in `package.json` so CI and fresh clones don't forget:

```json
{
  "scripts": {
    "postinstall": "airpoint-sdk-copy-assets --out public --base airpoint"
  }
}
```

Add the generated directory to `.gitignore`:

```gitignore
/public/airpoint
```

(Use `/static/airpoint` for SvelteKit.)

### 3. (If user provided a license key) Configure env

Append to the appropriate env file. **Never commit it.** Verify the file is in `.gitignore`.

| Framework | File         | Variable                                                                    |
| --------- | ------------ | --------------------------------------------------------------------------- |
| Vite      | `.env.local` | `VITE_AIRPOINT_API_KEY=…`                                                   |
| Next.js   | `.env.local` | `NEXT_PUBLIC_AIRPOINT_API_KEY=…`                                            |
| SvelteKit | `.env.local` | `PUBLIC_AIRPOINT_API_KEY=…`                                                 |
| Astro     | `.env`       | `PUBLIC_AIRPOINT_API_KEY=…`                                                 |
| Remix     | `.env`       | `AIRPOINT_API_KEY=…` (read server-side or via Remix's public env mechanism) |
| Other     | `.env.local` | match the framework's public-var prefix                                     |

Also add a matching entry (with empty value) to `.env.example`.

### 4. Write the integration file

Create the file the user agreed on in Q6. Template:

```ts
// src/airpoint.ts (Vite example — adjust import.meta.env reads per framework)
import {
  createAirpointPlugin,
  createAirpointCursorOverlay,
  createAirpointDomAdapter,
} from "@airpoint/sdk";

const apiKey = import.meta.env.VITE_AIRPOINT_API_KEY;

export async function startAirpoint(video: HTMLVideoElement) {
  /* CURSOR_BLOCK */
  const cursor = createAirpointCursorOverlay({
    style: "arrow", // ← Q3 cursor style
    clickAnimation: "pulse",
  });
  /* /CURSOR_BLOCK */

  const plugin = createAirpointPlugin({
    apiKey, // omit if Q2 = "raw landmarks"
    video,
    adapter: createAirpointDomAdapter(),
    manifest: {
      runtime: { assets: { basePath: "/airpoint" } },
      tracking: {
        config: {
          enableMLClassifier: Boolean(apiKey), // true when key is present
          gestureModel: "airmouse-4.3-onnx",
        },
      },
      intents: {
        // ← Q4: click gesture
        thumb_middle_pinch: { tap: "primary-select" },
      },
    },
  });

  /* CURSOR_HANDLER */
  plugin.on("move", (e) => {
    cursor.move(e.x, e.y, {
      space: "normalized",
      clicking: e.clicking,
      hand: e.hand,
    });
  });
  plugin.on("hand_lost", () => cursor.hide());
  /* /CURSOR_HANDLER */

  /* SCROLL_HANDLER */
  // ← Q5: thumb–ring pinch + hand motion = page scroll
  plugin.on("scroll", (e) => {
    window.scrollBy({ left: e.deltaX ?? 0, top: e.deltaY ?? 0 });
  });
  /* /SCROLL_HANDLER */

  await plugin.startCamera(video);
  await plugin.start();
  return plugin;
}
```

**Code generation rules:**

- If Q3 = no cursor: drop the `CURSOR_BLOCK` and `CURSOR_HANDLER` regions, drop the `createAirpointCursorOverlay` import.
- If Q4 = "none": omit the `intents` entry for it. Never leave commented-out placeholders in the final file — delete the lines.
- If Q5 = "none": drop the `SCROLL_HANDLER` region entirely.
- If Q2 = "raw landmarks" (no key): omit `apiKey`, set `enableMLClassifier: false`, set `runtime.emitRawLandmarks: true`, remove the `gestureModel` line, drop the `intents` map and the `SCROLL_HANDLER` region (built-in gestures and scroll events need the ML model), and add a `plugin.on("raw_landmarks", (e) => { /* TODO: your gesture logic */ })` handler. Skip step 3 (env config) and skip Q4–Q5.
- Map gesture choices to manifest keys: thumb–index → `thumb_index_pinch`, thumb–middle → `thumb_middle_pinch`, thumb–ring → `thumb_ring_pinch`.
- Adjust the env read for the framework: Vite uses `import.meta.env.VITE_*`, Next.js uses `process.env.NEXT_PUBLIC_*`, SvelteKit uses `import { PUBLIC_AIRPOINT_API_KEY } from "$env/static/public"`, Astro uses `import.meta.env.PUBLIC_*`.
- For Next.js, the file must run client-side: add `"use client"` at the top and call `startAirpoint` from a `useEffect`.

### 5. Wire it into a page

Add a minimal usage example to whichever entry/page makes sense (or, if unclear, ask). Example for a vanilla Vite page:

```ts
import { startAirpoint } from "./airpoint";

const video = document.createElement("video");
video.autoplay = true;
video.playsInline = true;
video.muted = true;
document.body.appendChild(video);

startAirpoint(video);
```

For React/Next/Svelte/etc., wrap in the framework's lifecycle (`useEffect`, `onMount`, …) and only run on the client.

### 6. Verify

- Run the dev server (`<pm> dev` / `npm run dev`).
- Open the page over `http://localhost:*` (camera API requires HTTPS or localhost).
- Grant camera permission when prompted.
- Confirm: hand visible → cursor follows; selected gesture → click fires.

If `plugin.start()` throws an asset-missing error: re-run step 2's copy-assets command and ensure the dev server serves the static folder.

## Things to NOT do

- Don't commit the API key. Always use env files.
- Don't run `airpoint-sdk-copy-assets` into `node_modules/` or `src/`. It must go to the framework's public/static folder.
- Don't enable `enableMLClassifier: true` without an `apiKey` — it will fail to start.
- Don't put the plugin creation in SSR-rendered code (Next.js Server Components, SvelteKit `+page.server.ts`, Remix loaders). Browser-only APIs.
- Don't try to "improve" the gesture pipeline by injecting your own recognizer into the manifest pipeline — for custom gestures, use `emitRawLandmarks` and act on `raw_landmarks` events instead. See README → Recipes.

## Reference

- Full README: [README.md](./README.md)
- API surface: README → API reference
- License key: [airpoint.app](https://airpoint.app)
- Issues / questions: `hello@airpoint.app`
