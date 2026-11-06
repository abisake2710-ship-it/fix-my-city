import { NextResponse } from "next/server";
import { DEPARTMENTS, normalizeAnalysis } from "../../../lib/issue-data";
import { parseJpegDataUrl } from "../../../lib/jpeg-data";
import { verifyFirebaseUser } from "../../../lib/server-auth";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request) {
  const identity = await verifyFirebaseUser(request);
  if (identity.error) {
    return NextResponse.json({ error: identity.error }, { status: identity.status });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "AI analysis is not configured. Add GEMINI_API_KEY to .env.local, then restart the app. In Vercel, add it under Project Settings → Environment Variables and redeploy.",
      },
      { status: 503 },
    );
  }

  let imageDataUrl;
  try {
    ({ imageDataUrl } = await request.json());
  } catch {
    return NextResponse.json({ error: "A JPEG photo is required." }, { status: 400 });
  }

  const image = parseJpegDataUrl(imageDataUrl);
  if (!image) {
    return NextResponse.json(
      { error: "Please use a valid JPEG photo under 600 KB." },
      { status: 400 },
    );
  }

  let response;
  let result;
  try {
    response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent",
      {
        method: "POST",
        signal: AbortSignal.timeout(25_000),
        headers: {
          "x-goog-api-key": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [
              {
                text: "You triage civic maintenance photos. Return exactly one clear, factual sentence describing the visible issue. Never infer facts that cannot be seen. Choose the most fitting category and urgency.",
              },
            ],
          },
          contents: [
            {
              parts: [
                { text: "Classify this civic issue photograph." },
                {
                  inlineData: {
                    mimeType: "image/jpeg",
                    data: image.base64,
                  },
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 512,
            responseMimeType: "application/json",
            thinkingConfig: { thinkingLevel: "low" },
            responseSchema: {
              type: "OBJECT",
              properties: {
                category: {
                  type: "STRING",
                  enum: [
                    "garbage",
                    "pothole",
                    "streetlight",
                    "water_leak",
                    "safety_hazard",
                    "other",
                  ],
                },
                urgency: { type: "STRING", enum: ["low", "medium", "high"] },
                description: { type: "STRING" },
              },
              required: ["category", "urgency", "description"],
            },
          },
        }),
        cache: "no-store",
      },
    );
    result = await response.json();
  } catch (error) {
    console.error("Gemini image analysis request failed:", error);
    return NextResponse.json(
      { error: "AI analysis is temporarily unavailable. Please try again." },
      { status: 502 },
    );
  }

  if (!response.ok) {
    console.error(
      "Gemini image analysis failed:",
      response.status,
      result.error?.message ?? "Unknown Gemini API error",
    );
    return NextResponse.json(
      { error: "AI analysis is temporarily unavailable. Please try again." },
      { status: 502 },
    );
  }

  const content = result.candidates?.[0]?.content?.parts
    ?.map((part) => part.text)
    .filter(Boolean)
    .join("");
  let proposed;
  try {
    proposed = JSON.parse(content);
  } catch {
    console.error("Gemini returned an invalid issue analysis response.");
    proposed = null;
  }

  const analysis = normalizeAnalysis(proposed);
  return NextResponse.json({
    ...analysis,
    department: DEPARTMENTS[analysis.category],
  });
}
