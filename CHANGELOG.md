# Changelog

## 1.3.0 - 2026-07-13

- Rebuilt Nexo around a compact 96 px desktop rail, a 56 px top bar, tablet navigation and a five-destination mobile dock so content owns the screen.
- Replaced functional display typography and long narrative copy with a legible sans hierarchy while keeping Instrument Serif only as a restrained brand accent.
- Redesigned Inicio as a visual route with one clear focus, compact active works, an actionable Después queue, a cover-led Más adelante shelf and collapsible recent activity.
- Added pending states, 44 px critical actions and spatial roadmap transitions while preserving every move, reorder, start, complete, hide and undo operation.
- Simplified Descubrir into three clear modes with stable search tools, a focused surprise result and a visible Pendientes decision queue.
- Rebuilt Biblioteca with sticky progressive filters, removable chips, full-set bulk selection, a 24-item render window and a responsive side-sheet editor.
- Reworked Dado into a Tirar → Decidir → Afinar flow with a 420 ms reveal, one primary decision and secondary detail disclosures.
- Clarified Importar, Ajustes and Curación with primary workflows first and guides, diagnostics and advanced controls behind accessible disclosures.
- Added deterministic visual QA across six viewport sizes and seven themes, keyboard and reduced-motion coverage, Firebase/PWA E2E validation and stricter bundle budgets.
- Kept Firebase schemas, public APIs, persisted roadmap data and existing imports/backups fully compatible.

## 1.2.0 - 2026-07-12

- Reimagined Inicio as an editorial, cinematic “Atlas cultural vivo” with an organic route instead of a dashboard grid.
- Added a protagonist poster for Ahora, a compact active strip, an editorial Después selection, a Más adelante timeline and recent completion credits.
- Added deterministic loading, empty-library, next-chapter promotion and invitation states without duplicating roadmap entries.
- Extracted the global shell into a responsive `AppChrome` with a desktop sidebar, tablet rail and five-destination mobile navigation.
- Added a self-hosted Latin Instrument Serif display face while preserving the sans control typography and all seven themes.
- Added resilient generated cover art, hero-only priority loading and safe rendering for broken images and long titles.
- Prevented duplicate roadmap writes with pending mutation state while preserving move, reorder, start, complete, hide, undo, details and Dice flows.
- Expanded responsive, reduced-motion, contrast, accessibility and visual regression coverage across the release viewport matrix.

## 1.1.50 - 2026-07-11

- Added the private Inicio surface with the Tu ruta roadmap across Ahora, Después and Más adelante.
- Added persisted roadmap ordering, automatic suggestions, hiding, status transitions and reversible actions.
- Unified Catálogo and Explorador into Descubrir with Buscar, Sorpréndeme and Pendientes modes.
- Simplified navigation to Inicio, Descubrir, Biblioteca and Dado, with secondary destinations under Más.
- Added a shared Añadir flow, account creation and email password recovery.
- Simplified Biblioteca and Dado around their primary actions, including roadmap-aware rolls and qualitative fit.
- Preserved legacy URLs and schema-version-1 backups while keeping roadmap data additive and optional.
- Added lazy feature boundaries, recoverable view errors and release gates for the direct 1.1.50 target.
- Hardened unsaved editor navigation, cold deep links, account isolation and serialized atomic roadmap batches.
- Limited the initial Library render to 24 cards while preserving full-set filters and bulk actions.
- Replaced the hand-written service worker with Workbox `injectManifest`, real offline-write E2E coverage and voluntary updates.
- Added bounded catalog queries, idempotent demand receipts, restrictive per-collection rules and a read-only production data audit.
- Hardened the catalog Worker with partial responses, timeouts, concurrency/subrequest budgets, rate bindings, strict CORS and PII-free logs.
- Added immutable multi-backend deployment by revision, WIF/Cloudflare credential gates, production health checks and post-smoke release tagging.

## 1.0.0 - 2026-06-01

- Added the 1.0 tab structure: Biblioteca, Dado, Explorador, Ajustes and moderator-only Curacion.
- Added shared public catalog support through `publicItems`, with callable-only moderator writes.
- Added personal copies from public catalog entries using `publicItemId` and `publicSnapshot`.
- Added discovery candidates under each user with queued, saved and dismissed states.
- Added persisted user settings for theme, taste signals, explorer defaults and dice preferences.
- Added a polished responsive UI with cover-forward cards, dice animation and reduced-motion support.
- Split Firebase Auth, Firestore and Analytics into lazy chunks so the initial app bundle stays below Vite's 500 kB warning threshold.
- Added PWA metadata and a conservative same-origin service worker for installable app-like launches.
- Added JSON export with `schemaVersion: 1`.
- Added release scripts, CI verification, README and release checklist.
