// Public (gh-pages) deploy-time allowlist — runs AFTER `vite build` (which copies the full
// public/*.json set into dist/, same as the operator build) and BEFORE `gh-pages -d dist`
// publishes. build-card-data.js keeps emitting the full internal set unchanged — this script
// is the ONLY place the partner/internal split is enforced (deploy-time gate, not build-time).
//
// ALLOWLIST / default-exclude: anything not explicitly named below is deleted from dist/, so a
// newly-emitted internal file type (registry.json, operator-*.json, sorular-*.json, or anything
// future) is hidden by default rather than leaked by omission.
import { readdirSync, rmSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const distDir = join(__dirname, '..', 'dist')

// Real, invited partners only — not-yet-invited/demo/test ids stay excluded by default.
// Widen by adding an id here; err toward exclusion when unsure (see task notes in worker/README.md).
const PUBLIC_PARTNER_IDS = []

const ALWAYS_KEEP = new Set(['index.html', 'assets'])
const partnerCardFiles = new Set(PUBLIC_PARTNER_IDS.map(id => `cards-${id}.json`))

const kept = [], removed = []
for (const entry of readdirSync(distDir)) {
  if (ALWAYS_KEEP.has(entry) || partnerCardFiles.has(entry)) { kept.push(entry); continue }
  rmSync(join(distDir, entry), { recursive: true, force: true })
  removed.push(entry)
}

console.log(`deploy-public-trim: kept ${kept.length} → ${kept.join(', ')}`)
console.log(`deploy-public-trim: removed ${removed.length} → ${removed.join(', ') || '(none)'}`)
