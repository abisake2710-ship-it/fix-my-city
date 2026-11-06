const AUTH_STORAGE_KEY = "campusfix-anonymous-session";
const CONFIGURED_ADMIN_EMAIL = "abisake2710@gmail.com";
const SERVER_TIMESTAMP = Symbol("serverTimestamp");
const authListeners = new Set();
let activeUser = null;
let authInitialized = false;
let authInitPromise;
let signInPromise;

function firebaseConfig() {
  const config = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  };
  const missing = Object.entries(config)
    .filter(([, value]) => !value)
    .map(([key]) => key);

  if (missing.length) {
    throw new Error(`Missing Firebase configuration: ${missing.join(", ")}`);
  }
  return config;
}

function getStoredSession() {
  try {
    return JSON.parse(window.localStorage.getItem(AUTH_STORAGE_KEY) || "null");
  } catch (error) {
    console.error("Could not read the anonymous Firebase session:", error);
    return null;
  }
}

function saveSession(session) {
  window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
}

function notifyAuthListeners() {
  authInitialized = true;
  authListeners.forEach((listener) => listener(activeUser));
}

function userFromSession(session) {
  return {
    uid: session.localId,
    email: session.email ?? null,
    isAnonymous: Boolean(session.isAnonymous),
    async getIdToken(forceRefresh = false) {
      const current = getStoredSession();
      if (!current?.refreshToken) {
        throw new Error("Your anonymous session has expired. Reload the page to sign in again.");
      }

      if (!forceRefresh && current.expiresAt > Date.now() + 60_000) {
        return current.idToken;
      }

      const { apiKey } = firebaseConfig();
      const response = await fetch(
        `https://securetoken.googleapis.com/v1/token?key=${encodeURIComponent(apiKey)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            grant_type: "refresh_token",
            refresh_token: current.refreshToken,
          }),
          cache: "no-store",
        },
      );
      const result = await response.json();
      if (!response.ok) {
        console.error("Firebase anonymous token refresh failed:", result.error?.message);
        window.localStorage.removeItem(AUTH_STORAGE_KEY);
        activeUser = null;
        notifyAuthListeners();
        throw new Error("Your session expired. Reload the page to sign in again.");
      }

      const refreshed = {
        localId: current.localId,
        idToken: result.id_token,
        refreshToken: result.refresh_token,
        expiresAt: Date.now() + Number(result.expires_in) * 1000,
      };
      saveSession(refreshed);
      return refreshed.idToken;
    },
    async getIdTokenResult() {
      const token = await this.getIdToken();
      const encodedPayload = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
      const claims = JSON.parse(atob(encodedPayload.padEnd(Math.ceil(encodedPayload.length / 4) * 4, "=")));
      return { claims };
    },
  };
}

function initializeAuth() {
  if (authInitPromise) return authInitPromise;
  authInitPromise = Promise.resolve().then(() => {
    const stored = getStoredSession();
    activeUser = stored?.localId && stored?.refreshToken ? userFromSession(stored) : null;
    notifyAuthListeners();
  });
  return authInitPromise;
}

export function getFirebaseApp() {
  firebaseConfig();
  return {};
}

export function getFirebaseAuth() {
  firebaseConfig();
  return {};
}

export function getFirebaseDb() {
  return firebaseConfig();
}

export function onAuthStateChanged(_auth, listener) {
  authListeners.add(listener);
  if (authInitialized) listener(activeUser);
  else initializeAuth().catch((error) => {
    console.error("Could not initialize anonymous Firebase authentication:", error);
    listener(null);
  });
  return () => authListeners.delete(listener);
}

async function createAnonymousSession() {
  await initializeAuth();
  if (activeUser) return { user: activeUser };

  const { apiKey } = firebaseConfig();
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ returnSecureToken: true }),
      cache: "no-store",
    },
  );
  const result = await response.json();
  if (!response.ok) {
    if (
      result.error?.message === "OPERATION_NOT_ALLOWED" ||
      result.error?.message === "ADMIN_ONLY_OPERATION"
    ) {
      const error = new Error(
        "Anonymous sign-in is blocked for this Firebase project. Enable the Anonymous provider in Firebase Console → Authentication → Sign-in method.",
      );
      error.code = "auth/operation-not-allowed";
      throw error;
    }
    console.error("Firebase anonymous sign-in failed:", result.error?.message);
    throw new Error("Anonymous sign-in failed. Check Firebase Authentication and try again.");
  }

  const session = {
    localId: result.localId,
    idToken: result.idToken,
    refreshToken: result.refreshToken,
    expiresAt: Date.now() + Number(result.expiresIn) * 1000,
  };
  saveSession(session);
  activeUser = userFromSession(session);
  notifyAuthListeners();
  return { user: activeUser };
}

export function signInAnonymously() {
  if (!signInPromise) {
    signInPromise = createAnonymousSession().finally(() => {
      signInPromise = null;
    });
  }
  return signInPromise;
}

export async function signInWithEmailAndPassword(_auth, email, password) {
  const { apiKey } = firebaseConfig();
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim(), password, returnSecureToken: true }),
      cache: "no-store",
    },
  );
  const result = await response.json();

  if (!response.ok) {
    const message = result.error?.message;
    if (
      message === "EMAIL_NOT_FOUND" ||
      message === "INVALID_PASSWORD" ||
      message === "INVALID_LOGIN_CREDENTIALS"
    ) {
      throw new Error("Email or password is incorrect.");
    }
    if (
      message === "OPERATION_NOT_ALLOWED" ||
      message === "PASSWORD_LOGIN_DISABLED"
    ) {
      throw new Error(
        "Email/password sign-in is disabled. Enable it in Firebase Authentication settings.",
      );
    }
    if (message === "USER_DISABLED") {
      throw new Error("This Firebase account has been disabled.");
    }
    console.error("Firebase administrator sign-in failed:", message);
    throw new Error("Could not sign in. Check your connection and try again.");
  }

  const session = {
    localId: result.localId,
    email: result.email,
    isAnonymous: false,
    idToken: result.idToken,
    refreshToken: result.refreshToken,
    expiresAt: Date.now() + Number(result.expiresIn) * 1000,
  };
  saveSession(session);
  activeUser = userFromSession(session);
  notifyAuthListeners();
  return { user: activeUser };
}

export function signOutFirebase() {
  window.localStorage.removeItem(AUTH_STORAGE_KEY);
  activeUser = null;
  notifyAuthListeners();
}

export function collection(_db, collectionName) {
  return { collectionName };
}

export function orderBy(field, direction = "asc") {
  return { kind: "orderBy", field, direction };
}

export function limit(count) {
  return { kind: "limit", count };
}

export function query(collectionRef, ...constraints) {
  return { ...collectionRef, constraints };
}

function decodeValue(value) {
  if ("stringValue" in value) return value.stringValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return value.doubleValue;
  if ("booleanValue" in value) return value.booleanValue;
  if ("timestampValue" in value) {
    const date = new Date(value.timestampValue);
    return { toDate: () => date };
  }
  if ("nullValue" in value) return null;
  if ("mapValue" in value) return decodeFields(value.mapValue.fields || {});
  if ("arrayValue" in value) return (value.arrayValue.values || []).map(decodeValue);
  return null;
}

function decodeFields(fields = {}) {
  return Object.fromEntries(
    Object.entries(fields).map(([key, value]) => [key, decodeValue(value)]),
  );
}

function encodeValue(value) {
  if (value === SERVER_TIMESTAMP) return undefined;
  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "number") {
    return Number.isInteger(value)
      ? { integerValue: String(value) }
      : { doubleValue: value };
  }
  if (typeof value === "boolean") return { booleanValue: value };
  if (value === null) return { nullValue: null };
  if (Array.isArray(value)) {
    return { arrayValue: { values: value.map(encodeValue) } };
  }
  if (typeof value === "object") {
    return { mapValue: { fields: encodeFields(value) } };
  }
  throw new Error("Unsupported Firestore field value.");
}

function encodeFields(values) {
  return Object.fromEntries(
    Object.entries(values)
      .map(([key, value]) => [key, encodeValue(value)])
      .filter(([, value]) => value !== undefined),
  );
}

async function firestoreRequest(config, path, options = {}, token) {
  const url = new URL(
    `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(config.projectId)}/databases/(default)/${path}`,
  );
  url.searchParams.set("key", config.apiKey);
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(url, {
    ...options,
    headers,
    cache: "no-store",
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const apiError = Array.isArray(result)
      ? result.find((entry) => entry.error)?.error
      : result.error;
    const error = new Error(
      response.status === 403
        ? "Firestore permission denied. Confirm the Firestore security rules are deployed."
        : apiError?.message || "Firestore request failed.",
    );
    error.code =
      response.status === 403
        ? "permission-denied"
        : response.status === 404
          ? "not-found"
          : "firestore/request-failed";
    throw error;
  }
  return result;
}

export async function isAdminUser(user) {
  if (!user || user.isAnonymous || user.email?.toLowerCase() !== CONFIGURED_ADMIN_EMAIL) {
    return false;
  }

  const config = firebaseConfig();
  const token = await user.getIdToken();
  const documentPath = `documents/admins/${encodeURIComponent(user.uid)}`;

  try {
    const document = await firestoreRequest(
      config,
      documentPath,
      {},
      token,
    );
    return (
      document.fields?.enabled?.booleanValue === true &&
      document.fields?.email?.stringValue?.toLowerCase() === CONFIGURED_ADMIN_EMAIL
    );
  } catch (error) {
    if (error.code !== "not-found") throw error;
  }

  try {
    await firestoreRequest(
      config,
      `documents/admins?documentId=${encodeURIComponent(user.uid)}`,
      {
        method: "POST",
        body: JSON.stringify({
          fields: encodeFields({
            email: CONFIGURED_ADMIN_EMAIL,
            enabled: true,
          }),
        }),
      },
      token,
    );
    return true;
  } catch (createError) {
    if (createError.code !== "firestore/request-failed") throw createError;
    const document = await firestoreRequest(config, documentPath, {}, token);
    return (
      document.fields?.enabled?.booleanValue === true &&
      document.fields?.email?.stringValue?.toLowerCase() === CONFIGURED_ADMIN_EMAIL
    );
  }
}

async function fetchIssues(queryRef) {
  const config = firebaseConfig();
  const order = queryRef.constraints.find((item) => item.kind === "orderBy");
  const maxResults = queryRef.constraints.find((item) => item.kind === "limit");
  const result = await firestoreRequest(
    config,
    "documents:runQuery",
    {
      method: "POST",
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId: queryRef.collectionName }],
          ...(order && {
            orderBy: [
              {
                field: { fieldPath: order.field },
                direction: order.direction === "desc" ? "DESCENDING" : "ASCENDING",
              },
            ],
          }),
          ...(maxResults && { limit: maxResults.count }),
        },
      }),
    },
  );

  return result
    .filter((item) => item.document)
    .map((item) => {
      const document = item.document;
      return {
        id: document.name.split("/").pop(),
        data: () => decodeFields(document.fields),
      };
    });
}

export function onSnapshot(queryRef, onNext, onError) {
  let stopped = false;
  let fetching = false;
  let lastSnapshot = "";
  let timer;

  const poll = async () => {
    if (stopped || fetching) return;
    fetching = true;
    try {
      const docs = await fetchIssues(queryRef);
      if (stopped) return;
      const snapshotKey = JSON.stringify(docs.map((item) => [item.id, item.data()]));
      if (snapshotKey !== lastSnapshot) {
        lastSnapshot = snapshotKey;
        onNext({ docs });
      }
    } catch (error) {
      if (!stopped) onError(error);
    } finally {
      fetching = false;
      if (!stopped) timer = window.setTimeout(poll, 15_000);
    }
  };

  poll();
  return () => {
    stopped = true;
    window.clearTimeout(timer);
  };
}

export async function createIssueWithImage(collectionRef, data, imageBase64) {
  const config = firebaseConfig();
  const auth = activeUser;
  if (!auth) throw new Error("Sign in before submitting a report.");
  if (
    typeof imageBase64 !== "string" ||
    imageBase64.length === 0 ||
    imageBase64.length > 819_200 ||
    !/^\/9j\/[A-Za-z0-9+/]+={0,2}$/.test(imageBase64)
  ) {
    throw new Error("The photo must be a valid JPEG under 600 KB.");
  }

  const id = crypto.randomUUID().replaceAll("-", "");
  const documentPrefix = `projects/${config.projectId}/databases/(default)/documents`;
  const issueFields = {
    ...data,
    imageUrl: `/api/issues/${id}/image`,
  };
  const imageFields = {
    imageData: imageBase64,
    reportedBy: auth.uid,
    createdAt: data.createdAt,
  };
  const createWrite = (name, fields) => ({
    update: { name, fields: encodeFields(fields) },
    ...(fields.createdAt === SERVER_TIMESTAMP && {
      updateTransforms: [
        { fieldPath: "createdAt", setToServerValue: "REQUEST_TIME" },
      ],
    }),
    currentDocument: { exists: false },
  });
  const token = await auth.getIdToken();
  await firestoreRequest(
    config,
    "documents:commit",
    {
      method: "POST",
      body: JSON.stringify({
        writes: [
          createWrite(
            `${documentPrefix}/${collectionRef.collectionName}/${id}`,
            issueFields,
          ),
          createWrite(`${documentPrefix}/issueImages/${id}`, imageFields),
        ],
      }),
    },
    token,
  );
  return { id, imageUrl: issueFields.imageUrl };
}

export function doc(_db, collectionName, id) {
  return { collectionName, id };
}

export function serverTimestamp() {
  return SERVER_TIMESTAMP;
}

export async function updateDoc(documentRef, updates) {
  if (Object.keys(updates).some((key) => key !== "status")) {
    throw new Error("Only issue status updates are allowed.");
  }
  const config = firebaseConfig();
  if (!activeUser) throw new Error("Sign in before updating a report.");
  const token = await activeUser.getIdToken();
  await firestoreRequest(
    config,
    `documents/${documentRef.collectionName}/${documentRef.id}?updateMask.fieldPaths=status`,
    {
      method: "PATCH",
      body: JSON.stringify({ fields: encodeFields(updates) }),
    },
    token,
  );
}

export async function deleteIssueWithImage(issueId) {
  if (typeof issueId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(issueId)) {
    throw new Error("Invalid report ID.");
  }

  const config = firebaseConfig();
  if (!activeUser) throw new Error("Sign in before deleting a report.");

  const token = await activeUser.getIdToken();
  const documentPrefix = `projects/${config.projectId}/databases/(default)/documents`;
  await firestoreRequest(
    config,
    "documents:commit",
    {
      method: "POST",
      body: JSON.stringify({
        writes: [
          { delete: `${documentPrefix}/issues/${issueId}` },
          { delete: `${documentPrefix}/issueImages/${issueId}` },
        ],
      }),
    },
    token,
  );
}
