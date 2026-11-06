export async function verifyFirebaseUser(request) {
  const token = request.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1];
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;

  if (!token || !apiKey) {
    return { error: "Authentication is required.", status: 401 };
  }

  let response;
  try {
    response = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken: token }),
        cache: "no-store",
      },
    );
  } catch (error) {
    console.error("Firebase token verification request failed:", error);
    return { error: "Authentication service is temporarily unavailable.", status: 503 };
  }

  if (!response.ok) {
    return { error: "Your session could not be verified. Please sign in again.", status: 401 };
  }

  let result;
  try {
    result = await response.json();
  } catch (error) {
    console.error("Firebase token verification returned invalid JSON:", error);
    return { error: "Authentication service returned an invalid response.", status: 502 };
  }
  const uid = result.users?.[0]?.localId;
  if (!uid) {
    return { error: "Your session could not be verified. Please sign in again.", status: 401 };
  }

  return { uid };
}
