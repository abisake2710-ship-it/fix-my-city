import { NextResponse } from "next/server";
import { MAX_FIRESTORE_IMAGE_BASE64_LENGTH, parseJpegDataUrl } from "../../../../../lib/jpeg-data";

export const runtime = "nodejs";

export async function GET(_request, { params }) {
  const { issueId } = await params;
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(issueId)) {
    return NextResponse.json({ error: "Invalid issue ID." }, { status: 400 });
  }

  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  if (!apiKey || !projectId) {
    return NextResponse.json(
      { error: "Firebase is not configured on this server." },
      { status: 503 },
    );
  }

  const firestoreUrl = new URL(
    `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents/issueImages/${encodeURIComponent(issueId)}`,
  );
  firestoreUrl.searchParams.set("key", apiKey);

  let response;
  try {
    response = await fetch(firestoreUrl, { cache: "no-store" });
  } catch (error) {
    console.error("Could not retrieve the issue image from Firestore:", error);
    return NextResponse.json(
      { error: "The issue image is temporarily unavailable." },
      { status: 502 },
    );
  }

  if (response.status === 404) {
    return NextResponse.json({ error: "Issue image not found." }, { status: 404 });
  }
  if (!response.ok) {
    console.error("Firestore image lookup failed:", response.status);
    return NextResponse.json(
      { error: "The issue image could not be loaded from Firestore." },
      { status: 502 },
    );
  }

  let document;
  try {
    document = await response.json();
  } catch (error) {
    console.error("Firestore returned invalid issue image JSON:", error);
    return NextResponse.json(
      { error: "The issue image record is invalid." },
      { status: 502 },
    );
  }

  const base64 = document.fields?.imageData?.stringValue;
  if (
    typeof base64 !== "string" ||
    base64.length > MAX_FIRESTORE_IMAGE_BASE64_LENGTH
  ) {
    return NextResponse.json({ error: "Issue image data is invalid." }, { status: 422 });
  }

  const image = parseJpegDataUrl(`data:image/jpeg;base64,${base64}`);
  if (!image) {
    return NextResponse.json({ error: "Issue image data is invalid." }, { status: 422 });
  }

  return new Response(image.buffer, {
    headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": "public, max-age=3600, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
