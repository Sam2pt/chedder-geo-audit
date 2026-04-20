---
name: browser-verify
description: Visually verify a Chedder deploy in Chrome MCP. Opens a URL (defaults to the prod homepage), takes a screenshot, reads console errors, and spot-checks that the page hydrated correctly. Use after any UI or copy change, any deploy, or when the user reports the app looking broken. Catches ChunkLoadError, hydration bugs, stale-cache issues, and visual regressions that curl-based testing cannot see.
tools: mcp__Claude_in_Chrome__tabs_context_mcp, mcp__Claude_in_Chrome__tabs_create_mcp, mcp__Claude_in_Chrome__navigate, mcp__Claude_in_Chrome__computer, mcp__Claude_in_Chrome__read_console_messages, Bash
---

# Browser Verify

Opens a Chedder URL in Chrome MCP, takes a screenshot, reads console errors, and reports what the user is actually seeing. This is the gap-closer between "curl returns 200" and "page renders correctly in a browser."

## When to run this skill

Run `browser-verify` after any of:

- Any UI copy change (module names, finding text, loading messages, recommendations)
- Any frontend component change
- Any deploy following changes to `app/`, `components/`, `netlify.toml`, or `app/globals.css`
- User reports the app "looks broken," "won't load," or "is weird"
- Before declaring a session complete if UI was touched

Do **not** need to run for backend-only changes (analyzer logic, API routes that don't affect rendered HTML, lib/ helpers that don't feed UI copy).

## What it does

1. Gets (or creates) a Chrome MCP tab
2. Navigates to the target URL with a cache-bust query string appended (browsers cache aggressively; `?v=<timestamp>` forces a fresh fetch)
3. Waits 2 seconds for hydration
4. Takes a screenshot
5. Reads the console for `error|Error|fail|Fail|exception|Exception|Uncaught|ChunkLoadError` patterns
6. Reports: URL, screenshot ID, console errors (if any), and a one-line sanity check of whether the expected page chrome is visible

## Default URL

`https://chedder.2pt.ai` (production homepage). Pass a different URL via `args` if you want to verify a specific page:
- `https://chedder.2pt.ai/a/<slug>` for a permalink audit page
- `https://localhost:3000` for a local dev server
- A specific deploy preview URL

## Output format

Report back concisely:

```
URL:         https://chedder.2pt.ai?v=1713612345
Render:      Home hero loaded ("When AI answers, is your brand mentioned?")
Console:     Clean
Screenshot:  ss_xxxxxx (saved)
```

Or when something's wrong:

```
URL:         https://chedder.2pt.ai?v=1713612345
Render:      ❌ "This page couldn't load" error page
Console:     ChunkLoadError: Failed to load chunk /_next/static/chunks/0d~o0frfxl90v.js
Likely fix:  Stale CDN cache. Check Cache-Control headers in netlify.toml.
```

## Implementation notes

- Always use a cache-bust query parameter. Without it, the browser may serve stale HTML that predates the deploy you're verifying.
- If `read_console_messages` returns a `ChunkLoadError`, the root cause is almost always a stale cached HTML response. Confirm with `curl -sI` looking at `cache-control` and `age` headers, then suggest a cache-clear deploy.
- If the page title says "Chedder" and the hero heading is visible, consider the page successfully rendered. Pixel-level regression testing is out of scope.
- If Chrome MCP is unavailable or the tab won't open, fall back to `curl` headers + `grep`-ing the HTML for known chrome text, and report the degraded verification.
