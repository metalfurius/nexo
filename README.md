# Listas Web

Web privada para gestionar cosas que ver, leer y jugar, con biblioteca, busqueda externa y un recomendador tipo dado ponderado.

## Stack

- React + Vite + TypeScript
- Firebase Hosting
- Firebase Auth con Google
- Cloud Firestore
- Cloud Functions para APIs externas
- Vitest + Playwright

## Desarrollo local

```bash
npm install
npm --prefix functions install
npm run dev
```

La app funciona en modo demo si no existe `.env`.

Para conectar Firebase, copia `.env.example` a `.env` y completa:

```bash
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
VITE_FIREBASE_MEASUREMENT_ID=
VITE_DEMO_MODE=false
```

## Firebase

1. Usa el proyecto Firebase `recomendaciones-78eb7` o cambia `.firebaserc`.
2. Activa Authentication con Google.
3. Activa Firestore.
4. En Authentication > Settings > Authorized domains, anade `localhost` para desarrollo local. Si abres la app con `127.0.0.1`, anade tambien `127.0.0.1`.
5. Configura secretos para Functions:

```bash
firebase functions:secrets:set TMDB_TOKEN
firebase functions:secrets:set RAWG_API_KEY
```

Para login local usa preferiblemente:

```text
http://localhost:5173
```

## Importar las listas actuales

El importador lee el repo hermano `../Listas`, genera JSON y conserva notas de importacion cuando una linea no se puede clasificar con seguridad.

```bash
npm run import:markdown
```

Resultado:

```text
seed/listas-import.json
```

Para escribir a Firestore desde una cuenta con permisos:

```bash
FIREBASE_PROJECT_ID=tu-proyecto GOOGLE_APPLICATION_CREDENTIALS=./service-account.json npm run import:markdown -- --write
```

## Checks

```bash
npm run lint
npm test
npm run build
npm run build:functions
npm run test:e2e
```

Los tests de reglas Firestore se saltan si `FIRESTORE_EMULATOR_HOST` no esta activo.
