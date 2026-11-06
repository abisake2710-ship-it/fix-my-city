# CampusFix AI

Snap it. Report it. Track it.

CampusFix AI lets a community report visible civic problems with a GPS-stamped photo, AI triage, a department assignment, and a live map. It uses Next.js App Router, Firebase Anonymous Authentication and Firestore, Gemini vision, and OpenStreetMap tiles. Issue details and compressed photos are stored in Firestore; no Cloudinary or Firebase Storage is used.

## Run locally

1. Use Node.js 18.18 or newer.
2. Copy `.env.example` to `.env.local` and fill in the values below.
3. Install packages and start the app:

   ```sh
   npm install
   npm run dev
   ```

4. Open `http://localhost:3000`. Camera and geolocation permissions require HTTPS in production; browsers treat `localhost` as a secure development context.

## Service setup

### Firebase (Spark/free plan)

- Create a Firebase web app and set the four `NEXT_PUBLIC_FIREBASE_*` values.
- Create a Firestore database and enable **Authentication → Sign-in method → Anonymous**.
- Also enable **Authentication → Sign-in method → Email/Password** for the administrator account.
- Deploy the included Firestore rules with `firebase deploy --only firestore:rules`.
- The admin page uses Email/Password sign-in. Only `abisake2710@gmail.com` is authorized. Create that account in **Authentication → Users**. After sign-in at `/admin`, the app creates `admins/{UID}` with only `email` and `enabled: true`. Firestore rules only permit that exact email to create its own admin record; clients cannot change or delete admin records. Passwords are verified by Firebase Authentication and are never stored in Firestore.
- Firestore reads for `issues` and `issueImages` are public so the community map and report photos can be shared. Creates require an authenticated user and validated issue fields. Report and photo documents are committed together; only an enabled administrator can update report status or delete a report and its photo together. Admin records are readable only by their matching signed-in account; app clients cannot change or delete admin records.
- Issue metadata is in `issues`; each JPEG is stored as base64 in its matching `issueImages` document. Photos are compressed to at most 600 KiB to stay within Firestore's 1 MiB per-document limit. The map query only fetches report metadata; photos load on demand through `/api/issues/[issueId]/image`.
- Firestore's free quota and document-size limit still apply. Keep photo sizes modest and monitor Firestore usage as reports grow.

Firebase's web API key is a public project identifier, not a server secret. The server uses it to verify anonymous ID tokens through Firebase Auth, so an HTTP-referrer-only restriction can block those server requests. Keep Firestore rules deployed; hiding the client key does not secure a Firebase project.

### Gemini

- Set `GEMINI_API_KEY` on the server. Image classification uses `gemini-3.6-flash` with a JSON response schema and low reasoning effort for responsive photo triage. Keep this key server-only; configure API usage limits for a demo.
- The key is never sent to the browser. Missing configuration and upstream errors are shown to the reporter rather than silently pretending analysis succeeded.

### Location and map

- Reverse geocoding is proxied through `/api/geocode` to Nominatim. Respect the [Nominatim usage policy](https://operations.osmfoundation.org/policies/nominatim/); its public endpoint is rate-limited and is not intended for high-volume production traffic.
- Map tiles and attribution come from OpenStreetMap contributors. For substantial production traffic, use a tile provider that permits your expected usage.

## Vercel deployment

Import this repository into Vercel, configure all environment variables for the target environment, and deploy. Add the deployed hostname to Firebase Authentication's authorized domains. Enable Email/Password in Firebase Authentication. Camera access is available on HTTPS. Firebase Firestore remains on its free-friendly Spark plan; no Firebase Storage or Blaze-only service is used.

## Report flow

The browser requests camera and precise location permission together. GPS coordinates are reverse-geocoded, then the address and six-decimal coordinates are burned into the compressed JPEG itself. An authenticated server route sends the JPEG directly to Gemini. The user reviews the analysis before the client atomically saves the issue metadata and JPEG to Firestore. Firestore snapshots update the report feed and Leaflet map in real time; report photos are served back from Firestore on demand.
