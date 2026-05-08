# SKILL.md — Installing Airpoint SDK

> This file is written for AI coding agents (Claude Code, Cursor, Copilot, Codex, etc.) integrating `airpoint-sdk` into a user's web app.
> Humans: this is a deterministic install script the agent will follow. The full reference docs are in [README.md](./README.md).

## When to use this skill

Trigger this skill when the user asks to:

- "Add Airpoint", "add hand tracking", "add touchless control", "add gesture control" to a web app.
- "Install airpoint-sdk", "set up Airpoint".
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

Ask these questions **one at a time**, in order. Stop if the user says no to Q1. Use the exact wording. Suggest the default in brackets so users can just hit enter.

1. **Install Airpoint hand tracking in this app?** _(yes / no)_
2. **Do you have an AirMouse license key?** _(yes, paste it / no, I want to build my own gestures from raw landmarks / no, get me a key)_
   - **Yes** — unlocks the AirMouse ML model. Ask **"Paste the key"** (stored in `.env*`, never committed).
   - **No, raw landmarks** — the SDK will emit `raw_landmarks` events; the user writes their own gesture detection. Skip Q3–Q4.
   - **No, get me a key** — point them at [airpoint.app](https://airpoint.app) and stop.
3. **What would you like to do with hand movement?** _(default: move a cursor)_
   - **Move a cursor** _(default)_ — index finger drives an on-screen cursor. Then ask: **Cursor style?** _(arrow / dot / ring — default arrow)_.
   - **Nothing** — no cursor; the user only cares about discrete gestures.
   - **Explain** _(open field)_ — the user describes the behavior. You implement it on the `move` event. If the description requires APIs Airpoint doesn't expose, say so and offer the closest equivalent (a DOM event, a callback stub, or a `// TODO` with a clear comment) instead of inventing methods.
4. **Would you like to bind a function to a gesture?** _(yes / no — default yes, with a sensible starter)_
   - If **no**: skip to Q5.
   - If **yes**: enter the gesture loop below. Repeat until the user says "done" or "no more". Cap at 5 iterations to avoid runaway interviews.

   **Gesture loop:**

   a. **Which gesture?** Show the list:
   - `thumb_index_pinch` — thumb touches index fingertip
   - `thumb_middle_pinch` — thumb touches middle fingertip
   - `thumb_ring_pinch` — thumb touches ring fingertip _(commonly used for scroll)_
   - `thumb_pinky_pinch` — thumb touches pinky fingertip
   - `thumb_pinky_base` — thumb touches the base of the pinky

   b. **What would you like `<gesture>` to do?**
   - **Click** _(default for `thumb_middle_pinch` if user has no preference)_ — click whatever is under the cursor.
   - **Scroll the page** _(only offered for `thumb_ring_pinch`)_ — hand motion while pinching scrolls the window.
   - **Dispatch a custom DOM event** — ask for the event name. Other code can listen with `window.addEventListener("<name>", …)`.
   - **Focus an element** — ask for a CSS selector.
   - **Nothing** — skip this gesture.
   - **Explain** _(open field)_ — implement on `plugin.on("intent", …)` filtered by gesture id. Same rule as Q3: if it can't be done with the public API, leave a clearly-commented `// TODO` instead of inventing.

   c. **First-iteration default suggestion:** if the user said "yes" to Q4 without picking a gesture, propose `thumb_middle_pinch → click` and `thumb_ring_pinch → scroll the page` as a starter pair, and ask "Use these or pick your own?"

5. **Where should the integration live?** Suggest a path based on framework, e.g. `src/airpoint.ts` for Vite, `app/airpoint.ts` for Next.js App Router.

After Q5, summarize the full plan in 4–6 bullets (cursor on/off, gesture bindings, file path) and ask **"Proceed?"** before writing any files.

## Apply the changes

Do these steps in order. Report each one as you go.

### 1. Install the package

```bash
<pm> add airpoint-sdk            # pnpm / yarn / bun
# or:
npm install airpoint-sdk
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

Create the file the user agreed on in Q5. Build it up from these blocks based on Q3/Q4 answers — only include what's needed.

**Base scaffold:**

```ts
// src/airpoint.ts (Vite example — adjust import.meta.env reads per framework)
import {
  createAirpointPlugin,
  createAirpointDomAdapter,
  // + createAirpointCursorOverlay if Q3 = cursor
} from "airpoint-sdk";

const apiKey = import.meta.env.VITE_AIRPOINT_API_KEY;

export function createPreparedAirpoint(video: HTMLVideoElement) {
  // [cursor block, if Q3 = cursor]

  const plugin = createAirpointPlugin({
    apiKey, // omit if Q2 = "raw landmarks"
    video,
    adapter: createAirpointDomAdapter(),
    manifest: {
      runtime: { assets: { basePath: "/airpoint" } },
      tracking: {
        config: {
          enableMLClassifier: Boolean(apiKey),
          gestureModel: "airmouse-4.3-onnx",
        },
      },
      intents: {
        // [one entry per gesture from Q4 with action = "Click"]
      },
    },
  });

  // [cursor handler, if Q3 = cursor]
  // [scroll handler, if any gesture from Q4 = "Scroll the page"]
  // [intent handler, for "Dispatch event", "Focus element", or "Explain" actions from Q4]

  // Recommended: warm assets and the gesture engine at app startup so the
  // user's first "enable tracking" click only has to open camera + start frames.
  void plugin.prepare().catch((error) => {
    console.warn("Airpoint prepare failed:", error);
  });

  return {
    plugin,
    async enable() {
      await plugin.startCamera(video);
      await plugin.start();
    },
    disable() {
      plugin.pause();
      plugin.stopCamera();
    },
    destroy() {
      plugin.stop();
    },
  };
}
```

**Block: cursor (Q3 = "Move a cursor")**

```ts
const cursor = createAirpointCursorOverlay({
  style: "arrow", // ← user's choice from Q3
  clickAnimation: "pulse",
});
```

```ts
plugin.on("move", (e) => {
  cursor.move(e.x, e.y, {
    space: "normalized",
    clicking: e.clicking,
    hand: e.hand,
  });
});
plugin.on("hand_lost", () => cursor.hide());
```

**Block: cursor with custom move behavior (Q3 = "Explain")**

Instead of `createAirpointCursorOverlay`, write a `plugin.on("move", …)` that does what the user described. If you can't map their description to public APIs, leave a clearly-marked TODO:

```ts
plugin.on("move", (e) => {
  // TODO: <user's description goes here>
  // e.x, e.y are normalized 0–1 coordinates; e.hand is "left" | "right".
});
```

**Block: gesture → click (Q4 entry, action = "Click")**

```ts
intents: {
  thumb_middle_pinch: { tap: "primary-select" },
}
```

The DOM adapter will fire a real DOM click at the cursor position when this gesture happens.

**Block: gesture → scroll (Q4 entry, action = "Scroll the page", gesture = `thumb_ring_pinch`)**

```ts
plugin.on("scroll", (e) => {
  window.scrollBy({ left: e.deltaX ?? 0, top: e.deltaY ?? 0 });
});
```

**Block: gesture → custom DOM event (Q4 entry, action = "Dispatch event")**

```ts
intents: {
  thumb_pinky_base: { dispatch_event: "dismiss-modal" }, // ← user-chosen event name
}
```

App code listens with `window.addEventListener("dismiss-modal", …)`.

**Block: gesture → focus element (Q4 entry, action = "Focus element")**

```ts
intents: {
  thumb_pinky_pinch: { focus: "#search-input" }, // ← user-chosen selector
}
```

**Block: gesture → "Explain" (Q4 entry, action = open field)**

Map to a generic intent + handler. Leave a TODO with the user's description verbatim:

```ts
intents: {
  thumb_index_pinch: { dispatch_event: "airpoint:custom-1" },
}

plugin.on("intent", (e) => {
  if (e.intentId === "airpoint:custom-1") {
    // TODO: <user's description goes here>
  }
});
```

**Code generation rules:**

- If Q2 = "raw landmarks" (no key): omit `apiKey`, set `enableMLClassifier: false`, set `runtime.emitRawLandmarks: true`, remove the `gestureModel` line, drop the `intents` map and any gesture handlers (built-in gesture events need the ML model), and add a `plugin.on("raw_landmarks", (e) => { /* TODO: your gesture logic */ })` handler. Skip step 3 (env config) and skip Q3–Q4.
- If Q3 = "Nothing": drop the cursor blocks and the `createAirpointCursorOverlay` import.
- If Q4 produced no gestures: drop the `intents` map (leave it as `intents: {}` or omit it).
- Map gesture choices to manifest keys exactly as listed (`thumb_index_pinch`, `thumb_middle_pinch`, `thumb_ring_pinch`, `thumb_pinky_pinch`, `thumb_pinky_base`).
- Adjust the env read for the framework: Vite uses `import.meta.env.VITE_*`, Next.js uses `process.env.NEXT_PUBLIC_*`, SvelteKit uses `import { PUBLIC_AIRPOINT_API_KEY } from "$env/static/public"`, Astro uses `import.meta.env.PUBLIC_*`.
- For Next.js, the file must run client-side: add `"use client"` at the top and call `startAirpoint` from a `useEffect`.
- Never invent SDK methods. If a user's "Explain" answer needs something the SDK doesn't expose, leave a `// TODO` and tell the user in your summary.

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
