# smutstream

A LAN-only e621 slideshow + party tool for projector / TV nights. Guests open a URL on their phones to add tag groups, vote, comment, and pick what plays next. The display tab runs the slideshow with crossfades, multiplex layouts, live floating reactions, pop-in speech bubbles, and ambient music.

Built for **adults at private parties**. Not for the public internet. There is no auth beyond "type a name on first visit" — the trust model is your local Wi-Fi.

---

## What you're starting with

A zip file of source code. There's no git repo. Unzip it, install the runtime once, fill in two lines of config, then run.

```bash
unzip smutstream.zip
cd smutstream
```

The unzipped directory has source, configs, package files, and `.env.example`. It does NOT have `node_modules/` (you'll install those), a database (created on first run), an image cache (downloaded as you stream), or your `.env` (you'll copy from the example).

---

## Install the runtime (one time per machine)

You need **Node 22 or newer** and a working C++ toolchain (one native dependency, `better-sqlite3`, builds against it on install).

### macOS (Homebrew)

If you don't have Homebrew: `/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"`

```bash
brew install node@22
# Xcode Command Line Tools — provides the C++ compiler better-sqlite3 needs.
# Skip if you already have Xcode or the CLT installed.
xcode-select --install
```

Verify:

```bash
node --version   # should print v22.x.x or higher
npm --version
```

### Linux (Debian/Ubuntu)

```bash
# Use NodeSource for an up-to-date Node 22:
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs build-essential python3
```

### Windows

Easiest path: install Node 22 LTS from https://nodejs.org and **check the "Tools for native modules" box** during install. That covers the compiler.
Alternatively use WSL2 with Ubuntu and follow the Linux steps.

---

## Install smutstream's dependencies (one time per copy)

From inside the unzipped `smutstream/` folder:

```bash
npm install
```

This pulls about ~140 MB of npm packages into `./node_modules/` and compiles `better-sqlite3` natively. Takes ~30 seconds on a decent connection.

If `better-sqlite3` fails to build on macOS, run `xcode-select --install` and try again. On Linux, make sure you have `build-essential` and `python3`.

---

## Configure (one time per copy)

```bash
cp .env.example .env
```

Open `.env` in any editor and fill in your e621 credentials:

```env
E621_USERNAME=yourname
E621_API_KEY=...    # generate at https://e621.net/users/home → Manage API Access
```

How to get the API key:
1. Log into https://e621.net
2. Click your username (top-right) → **Manage API Access**
3. Click **Create API key**, name it whatever ("smutstream")
4. Copy the long string it gives you into `.env`. Don't share it; it's password-equivalent.

Anonymous (empty username/key) technically works for testing but you'll hit a tight rate limit and some content gets filtered. A logged-in key unlocks the full catalog and the documented 2 req/sec headroom.

Also worth tweaking in `.env` while you're there:
- `SAFETY_BLACKLIST=` — comma-separated tags that get appended as negatives to every search. Default has a starter set; add anything else you don't want at the party.
- Defaults for slide timing, overlay frequency, cache TTL — but you can change all of these from the in-UI settings card without restarting.

---

## Run

**Dev (two processes, with hot-reload)**:

```bash
npm run dev
```

- Vite serves the UI on `:5173`
- Express + Socket.IO API on `:3000`
- Visit `http://<your-lan-ip>:5173` from anywhere on the LAN — that's the URL the QR code points to in dev.

**Production-ish (one process, faster, no HMR)**:

```bash
npm run build
npm start
# everything on :3000
```

The server prints its LAN URL + hostname on boot. Share that URL with guests.

---

## Upgrading later

If you get a new zip of smutstream from the author:

```bash
# back up your config + data first
cp -R smutstream/.env smutstream/data ~/smutstream-backup/

# unzip the new copy into a temp dir
unzip new-smutstream.zip -d ~/tmp/

# move the new source on top of the old, KEEPING your runtime stuff
rsync -a --exclude='.env' --exclude='data' --exclude='cache' --exclude='node_modules' \
  ~/tmp/smutstream/ smutstream/

# from inside smutstream/
npm install        # picks up any new dependencies
```

Your tag groups, votes, comments, and adjusted settings live in `data/` and survive across upgrades. Your image cache is in `cache/` — safe to delete anytime to free disk; it'll re-download on demand.

---

## How to use it on party night

1. **Display tab**: open `/display` on whatever machine is hooked to the TV / projector. Press `F` for fullscreen (or click the `⛶` icon top-right on hover). Audio output goes wherever that machine routes audio.
2. **Phone control**: every guest opens the LAN URL on their phone, types their name once. They land on `/` (control panel).
3. **First tag group**: hit "+ new group" → name it ("thicc dragons", "winter cozy", whatever), type tags with autocomplete, pick a sort (newest / hottest / top score / most faves / random), preview, then "play now" or "add to pool".
4. **Pool rotation**: enabled groups round-robin. Each group has its own image cap (5–2000 — anything over 320 paginates automatically).
5. **Live vibes**:
   - 👍 votes spawn floating emoji on the display + bump a counter
   - comments pop as speech bubbles ("immediate" or saved for "replay" on the next showing)
   - LAN-info overlay pops periodically with QR + URL so newcomers can join

---

## Features

### Slideshow
- **Crossfade transitions**: fade, fade-through-black, slide, zoom. Pick one or several — server randomizes per-advance so all displays stay in sync.
- **Multiplex layouts**: single, split-↔, split-↕, diagonal. Visual previews in the settings card. Configurable probability when mixed with single.
- **⏸ Pause / ▶ resume / ⏭ skip-ahead** from `/control` — pause holds the current frame; skip jumps to the next image/layout immediately so you can preview enabled layouts on demand.
- **Image cooldown** — don't repeat the same image within N minutes (default 30; 0=off). Slider in settings.
- **Per-image preload**: server downloads the next 2–3 images to disk before they show, so transitions don't stutter.
- **Tag groups with rotation, attribution, contribution log** (who created, who edited which tag, who enabled/disabled).
- **Hand-picked plays**: every image in the search-preview grid has its own ▶ play-now, ▶ play-next, ⬇ download, 🔗 source, 🚫 hide buttons. Plays show as "hand-picked by {name}" in the overlay.
- **Recently-shown strip** on `/control` — last 20 images, tap to expand and vote / comment / open source / hide.
- **Inline edit** on group cards: change name, tags, image cap; takes effect on next refill (~30s).
- **⬇ Download all** on each group card — server streams a ZIP of every image in the group (up to 500), with a `manifest.json` of sources + metadata. Uses the local cache when possible, fetches missing images naturally rate-limited.

### Live engagement
- **Explicit emoji reaction picker**: 18 party-flavored emojis (👍❤️🔥💦🥵😈😻🍑🍆🌶️💋🤤🥂🍾🍻🥃🤘🎉) — each tap floats *that* exact emoji up on the display with the sender's name. Independent of upvote counter.
- **Reaction confetti** — when reactions cross a threshold within a short sliding window (default 5 within 15s), a 36-emoji burst rains down the screen using the recently-sent emojis. Throttled to once per minute so it stays a treat, not a tax. Configurable.
- **Per-image like counter**: `👍 more like this` still bumps a persistent `♥ N` chip (bottom-left of display) that pulses on each new like and resets on image change.
- **Live comments**: type on your phone, your message pops as a speech bubble in the **bottom-right band** of the display (out of the central image area), lingers ~7s, fades out. Off / live / replay / both modes.

### Moderation
- **🚫 Hide post / 🙈 hide artist** — one-click block from any image's action row, plus a Blocklist card on `/control` to view + manage current blocks (one-tap unblock; manual "block by tag" input).
- **Safety blacklist** in `.env` is prepended to every search server-side; the runtime blocklist is layered on top.

### Optional integrations
- **✈️ Telegram bot** — point a Telegram bot at any chat/channel for **two-way** control:
  - **announce mode** — `off` (default — bot is for commands, not spam), `everyImage` (post every advance, throttled to 1/8s), or `onMilestone` (post only when an image hits N 👍 likes).
  - **commands** (long-polled, chat-scoped to the configured chat id):
    `/now` `/skip` `/pause` `/resume` `/pop` `/likes`
    `/groups` `/tags <id>` `/add <name> | <tags>` `/play <id> [now|next]` `/enable <id>` `/disable <id>` `/remove <id>`
    `/vote up|down` `/react <emoji>` `/comment <text>`
    `/music` `/music on|off` `/music <stationKey>`
    `/help`
  - Bot token is masked in every client-facing response so it never lands in a guest's browser.

### Overlay (LAN info)
- **Four verbosity levels**: qr-only (just the QR), minimal (QR + URL), normal (+ Wi-Fi name), verbose (+ hostname, alt IPs, now-showing).
- **Four corners**: ↖ ↗ ↙ ↘ (for chip variants).
- **Opacity + scale sliders**.
- **Three modes**: off, occasional (interval + duration sliders), always.

### Music
- **30 ad-free streaming stations** across 8 genres — SomaFM + Radio Paradise, all listener-supported and 24/7. Browse the station picker, organized by category:
  - **chill / lounge** — Groove Salad, Groove Salad Classic, Lush, Bossa Beyond, Digitalis, Fluid (chillhop)
  - **ambient / space** — Deep Space One, Drone Zone, Mission Control, Doomed
  - **party / electronic** — Beat Blender, The Trip, DEF CON Radio (synthwave), Dark Zone, Suburbs of Goa (psy-trance)
  - **rock / indie / metal** — BAGel Radio, Indie Pop Rocks, Metal Detector
  - **retro / 80s / oldies** — Underground 80s, Seven Inch Soul, Left Coast 70s
  - **country / folk / world-trad** — Boot Liquor, Folk Forward, Thistle (celtic)
  - **eclectic (Radio Paradise)** — Main, Mellow, Rock, Global mixes
  - **jazz** — Sonic Universe, Secret Agent
- **Quick controls on /control**: ⏮ prev station / ▶⏸ start-stop / ⏭ next station / 🔊 volume — independent of the deeper SettingsCard.
- Subtle ♪ chip in display top-left when playing; tap-to-start button if the browser blocks autoplay.

### Search / tag building
- **Autocomplete** via e621's tag-suggestions API (with arrow-key navigation).
- **Multi-tag paste**: drop `wolf canine order:hot` into the input → each becomes its own chip.
- **Sort quick-adds**: newest / hottest / top score / most faves / random buttons inject the e621 `order:*` metatag as a chip you can edit.
- **Live preview** with hover-actions on each thumbnail.
- **Safety blacklist** (configurable in `.env`) is prepended to every search server-side as negative tags, so you don't have to remember.
- **Videos auto-excluded** (`-type:webm -type:mp4 -type:swf`) so sort-by-score doesn't return all videos. Opt back in by typing `type:webm` etc. yourself.

### Multi-device sync
- WebSocket broadcasts of state (current image, upcoming, history, overlay) and settings (any change on one device reflects on all).
- Settings PATCHes track in-flight keys so a slider you're actively dragging on phone A can't be snapped by a broadcast from phone B.

---

## Settings reference

All settings persist to SQLite (`./data/smutstream.sqlite`). The control-panel UI shows everything; this is for reference. The `reset` button at the top of the Display Settings card clears stored values and falls back to `.env` / built-in defaults.

| Setting | Range | Default |
|---|---|---|
| `slideDurationMs` | 3000–120000 | 60000 |
| `fadeMs` | 200–6000 | 2000 |
| `enabledTransitions` | subset of `fade`, `fade-black`, `slide`, `zoom` | `["fade"]` |
| `overlayMode` | `off` / `occasional` / `always` | `occasional` |
| `overlayIntervalMs` | 15000–600000 | 360000 (6 min) |
| `overlayDurationMs` | 3000–60000 | 45000 |
| `overlayVerbosity` | `qr-only` / `minimal` / `normal` / `verbose` | `minimal` |
| `overlayOpacity` | 0.3–1.0 | 0.85 |
| `overlayScale` | 0.6–1.6 | 1.0 |
| `overlayCorner` | `tl` / `tr` / `bl` / `br` | `br` |
| `wifiSsid` | string \| null | null (or auto-detect on macOS pre-14.4) |
| `enabledLayouts` | subset of `single`, `split-v`, `split-h`, `diag` | `["single"]` |
| `multiplexProbability` | 0–1 | 0.35 |
| `reactionsEnabled` | bool | true |
| `commentsMode` | `off` / `immediate` / `replay` / `both` | `immediate` |
| `musicEnabled` | bool | true |
| `musicStation` | one of `STATIONS` keys | `groovesalad` |
| `musicVolume` | 0–1 | 0.45 |
| `imageCooldownMs` | 0–86400000 (24h) | 1800000 (30 min) |
| `telegramEnabled` | bool | false |
| `telegramBotToken` | string (server-side only — masked to `•••••` in responses) | "" |
| `telegramChatId` | string | "" |
| `telegramAnnounceMode` | `off` / `everyImage` / `onMilestone` | `off` |
| `telegramCommandsEnabled` | bool | true |
| `telegramMilestoneLikes` | 2–50 | 5 |
| `reactionConfettiEnabled` | bool | true |
| `reactionConfettiThreshold` | 2–50 | 5 |
| `reactionConfettiWindowMs` | 3000–120000 | 15000 |

`.env` controls the *initial* defaults on a fresh SQLite (slide/fade/overlay timings, blacklist, server port) plus credentials and cache paths. Everything else lives in the UI.

---

## Architecture

```
┌────────────────────────────────────────────────────────────────────┐
│  Browser /display (TV)            Browsers /control (phones)       │
│  React, single full-bleed         React, mobile-first              │
│       │                                  │                          │
│       └────── WebSocket (Socket.IO) ─────┘                          │
│                       │                                             │
│            Express + Socket.IO server (Node + tsx)                  │
│       ┌───────────┬───────────┬──────────┬────────────┐            │
│       │ scheduler │ e621 api  │  cache   │  sqlite    │            │
│       │ (rotation │ (rate-    │ (disk,   │ (groups,   │            │
│       │  + layout │  limited, │  TTL     │  votes,    │            │
│       │  + replay │  paginated│  sweep)  │  comments, │            │
│       │  comments)│  search)  │          │  settings) │            │
│       └───────────┴─────┬─────┴──────────┴────────────┘            │
│                         │                                           │
│                e621.net (Basic auth + UA)                           │
└────────────────────────────────────────────────────────────────────┘
```

**Key invariants / design notes**:
- All e621 traffic goes through the **server** — your API key never leaves the laptop. Guest phones only hit the local server.
- Image files are downloaded to the **on-disk cache** (`./cache/`) and served from there, so guests don't hammer e621's CDN and the display has consistent latency.
- The **scheduler is serialized** via a single promise chain — concurrent triggers (timer tick + "play now" click + group change) can't race the `await` on cache writes.
- e621 has a **hard 2 req/sec rate limit**. The client uses a serial request queue with ~1.1s spacing + 503/429 backoff, well under the limit even with multiple groups + active autocomplete.
- The **`SAFETY_BLACKLIST` env var** + a permanent `-type:webm -type:mp4 -type:swf` exclusion get appended to every search. Set yours in `.env`.
- Settings changes broadcast over WebSocket with **in-flight key tracking** so live multi-device editing doesn't clobber an active drag.

---

## Troubleshooting

**LAN URL doesn't work from another device**  
You're probably running `npm run dev` and pointing at `:3000` (the API) instead of `:5173` (Vite). The QR/overlay URL automatically advertises the right port. Or run `npm run build && npm start` and everything's on `:3000`.

**Display says "tap to start music"**  
Chrome / Safari blocks audio autoplay until a user gesture on the page. Tap once on the display tab — after that, station/volume changes work seamlessly without re-prompting.

**Overlay chip is partially cut off on my TV**  
TV overscan eating the edge. Look for "Just Scan" / "Screen Fit" / "1:1 Pixel" / "Native" / "Overscan Off" in the TV's picture settings.

**Wi-Fi name in overlay is empty / shows `<redacted>`**  
macOS 14+ hides the SSID from non-privileged processes. Type your Wi-Fi name into the "wi-fi name" field in settings — that's the override.

**"0 matches" on a search that should clearly have hits**  
Likely a videos-only result set. The server auto-excludes `webm/mp4/swf` because the display only renders stills. Opt back in by typing `type:webm` etc. as a positive tag.

**Sliders snap back when I change them**  
This was a bug, now fixed. If you still see it: open browser devtools console on `/control` and check for PATCH errors. The settings endpoint returns the canonical state — if the server rejected/clamped your value, the slider reflects what was stored.

**better-sqlite3 won't install**  
You need Xcode Command Line Tools on macOS: `xcode-select --install`. On Linux you need build-essential + python3.

---

## File layout

```
server/
  config.ts        env loading + computed paths
  lan.ts           network interface + SSID detection
  db.ts            sqlite schema (users, groups, contributions, votes, comments, settings)
  settings.ts      type-safe get / update / reset + sanitization
  e621.ts          rate-limited client + tag query builder + pagination
  cache.ts         on-disk image cache + TTL sweeper
  comments.ts      comment storage helpers (isolated to break circular import)
  identity.ts      cookie-based "type a name" identity
  scheduler.ts     slideshow loop, multiplex picker, transition picker, history, replay comments
  routes.ts        REST endpoints (groups, votes, comments, settings, server-info, play, overlay)
  sockets.ts       Socket.IO setup + broadcast helpers (state, settings, reaction, comment)
  index.ts         entry point

src/
  routes/
    Display.tsx    full-bleed slideshow + overlay + reactions + comments + music
    Control.tsx    phone control panel — name, now-playing, group pool, recent strip, settings
    Search.tsx     tag group builder with autocomplete preview + per-thumb actions + sort quick-add
  components/
    Slideshow.tsx  frame-based renderer with crossfade / slide / zoom / fade-black + multiplex cells
    Overlay.tsx    qr-only / minimal / normal / verbose variants with corner placement
    ReactionsLayer.tsx  floating emoji + like counter
    CommentsLayer.tsx   pop-in speech bubbles
    MusicPlayer.tsx     SomaFM streamer with tap-to-start fallback
    SettingsCard.tsx    everything wired with in-flight clobber protection
    TagInput.tsx        autocomplete + multi-tag paste + cancelable fetches
    GroupCard.tsx       quick actions + inline edit mode
    PostActions.tsx     reusable 👍 👎 ⬇ 🔗 💬 row (icon-only on mobile)
    RecentStrip.tsx     last-N thumbnails with expand-to-actions
    Logo.tsx
  lib/
    types.ts       shared TypeScript types
    api.ts         REST client
    socket.ts      WS hooks + subscribers (state, settings, reaction, comment)
    posts.ts       sourceUrl helper
    stations.ts    SomaFM station registry
  styles.css       all CSS (no Tailwind dependency; CSS variables for theming)
public/
  logo.svg
  favicon.svg
```

---

## What's deliberately not built

- **Dedicated party-goer-only page** (locked down — voting + comment, no settings/group management). Easy to add: just clone `/control` and conditionally hide `SettingsCard` + group management based on a setting or query param. Save for when you actually need it.
- **Diagonal multiplex cuts / quad layouts**. Possible with `clip-path` but real care needed to avoid cropping faces awkwardly.
- **Saliency-aware multiplex cropping**. Multiplex cells use `background-size: cover` and center-position; some images get cropped. Single layout always uses `contain` (no cropping). If a particular image looks bad split, "play now" → switch enabled-layouts to just `single` temporarily.
- **Persistent reaction/comment leaderboards across nights**. Comments persist in SQLite (so replay mode can re-show them later sessions); reactions are tallied per-post via the votes table. No leaderboard UI.
- **Native Chromecast receiver**. Tab-cast from Chrome works fine for almost everything; native receiver is more work than it's worth for one-night parties.

---

## License + credits

- Built for personal use by the author. No license file; treat as "all rights reserved" until/unless one is added.
- Uses **SomaFM** for ambient streams — listener-supported, ad-free. If you end up loving the music, consider tossing them money at https://somafm.com. They pay real bandwidth + licensing fees.
- Uses **e621**'s public API — please respect their rate limits (2 req/sec hard, ~1 req/sec sustained) and User-Agent policy. This app already does, but if you fork it, keep that.
