import { NextResponse } from "next/server";
import { verifyFirebaseUser } from "../../../lib/server-auth";

export const runtime = "nodejs";

export async function GET(request) {
  const identity = await verifyFirebaseUser(request);
  if (identity.error) {
    return NextResponse.json({ error: identity.error }, { status: identity.status });
  }

  const { searchParams } = new URL(request.url);
  const latitude = Number(searchParams.get("lat"));
  const longitude = Number(searchParams.get("lon"));

  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    return NextResponse.json({ error: "Valid coordinates are required." }, { status: 400 });
  }

  const query = new URLSearchParams({
    format: "jsonv2",
    lat: String(latitude),
    lon: String(longitude),
    zoom: "18",
    addressdetails: "1",
  });
  let response;
  try {
    response = await fetch(`https://nominatim.openstreetmap.org/reverse?${query}`, {
      headers: {
        "Accept-Language": "en",
        "User-Agent": "CampusFixAI/1.0 (civic issue reporting app)",
      },
      cache: "no-store",
    });
  } catch (error) {
    console.error("Nominatim reverse geocoding request failed:", error);
    return NextResponse.json(
      { error: "Address lookup is temporarily unavailable. Please try again." },
      { status: 502 },
    );
  }

  if (!response.ok) {
    console.error("Nominatim reverse geocoding failed:", response.status);
    return NextResponse.json(
      { error: "Could not look up the address. Please try location again." },
      { status: 502 },
    );
  }

  let result;
  try {
    result = await response.json();
  } catch (error) {
    console.error("Nominatim returned invalid JSON:", error);
    return NextResponse.json(
      { error: "Address lookup returned an invalid response. Please try again." },
      { status: 502 },
    );
  }
  if (!result.display_name) {
    return NextResponse.json(
      { error: "No address was found for this location. Please try again nearby." },
      { status: 404 },
    );
  }

  return NextResponse.json({ address: result.display_name });
}
