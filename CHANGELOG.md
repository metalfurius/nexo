# Changelog

## 1.1.50 - 2026-07-11

- Added the private Inicio surface with the Tu ruta roadmap across Ahora, Después and Más adelante.
- Added persisted roadmap ordering, automatic suggestions, hiding, status transitions and reversible actions.
- Unified Catálogo and Explorador into Descubrir with Buscar, Sorpréndeme and Pendientes modes.
- Simplified navigation to Inicio, Descubrir, Biblioteca and Dado, with secondary destinations under Más.
- Added a shared Añadir flow, account creation and email password recovery.
- Simplified Biblioteca and Dado around their primary actions, including roadmap-aware rolls and qualitative fit.
- Preserved legacy URLs and schema-version-1 backups while keeping roadmap data additive and optional.
- Added lazy feature boundaries, recoverable view errors and release gates for the direct 1.1.50 target.

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
