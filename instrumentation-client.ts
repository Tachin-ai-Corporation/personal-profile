import { z } from "zod"

/**
 * Next client boot hook: runs before any app code in the browser.
 *
 * zod 4 probes `new Function("")` once to decide whether it may JIT its
 * object parsers. The strict CSP (AD-21: no `'unsafe-eval'`) blocks the probe,
 * and the browser reports a `script-src (eval)` violation on every page that
 * parses an object. `jitless` skips the probe (and the eval) entirely
 * (spec R5-1: the signed-in `/` must load without any CSP violation).
 */
z.config({ jitless: true })
