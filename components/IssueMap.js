"use client";

import { useEffect, useRef, useState } from "react";
import {
  Circle,
  MapContainer,
  Marker,
  Popup,
  TileLayer,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import { LoaderCircle, LocateFixed, LocateOff, MapPin } from "lucide-react";
import { CATEGORY_LABELS } from "../lib/issue-data";

function createMarkerIcon(status, urgency, isSelected) {
  let extraClass = "";
  if (isSelected) extraClass += " issue-marker-selected";

  if (status === "resolved") {
    return L.divIcon({
      className: `issue-marker issue-marker-resolved${extraClass}`,
      html: '<span class="issue-marker-dot issue-marker-resolved"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m3.5 8.2 3 3 6-6.4" /></svg></span>',
      iconSize: [24, 24],
      iconAnchor: [12, 12],
    });
  }

  if (status === "in_progress") {
    return L.divIcon({
      className: `issue-marker issue-marker-progress${extraClass}`,
      html: '<span class="issue-marker-dot issue-marker-progress"></span>',
      iconSize: [24, 24],
      iconAnchor: [12, 12],
    });
  }

  if (urgency === "high") {
    return L.divIcon({
      className: `issue-marker issue-marker-high${extraClass}`,
      html: '<span class="issue-marker-dot issue-marker-high"></span>',
      iconSize: [24, 24],
      iconAnchor: [12, 12],
    });
  }

  return L.divIcon({
    className: `issue-marker issue-marker-reported${extraClass}`,
    html: '<span class="issue-marker-dot issue-marker-reported"></span>',
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
}

const userLocationIcon = L.divIcon({
  className: "user-location-marker",
  html: '<span class="user-location-pulse"></span><span class="user-location-dot"></span>',
  iconSize: [32, 32],
  iconAnchor: [16, 16],
});

function MapAutoResize() {
  const map = useMap();

  useEffect(() => {
    const handleResize = () => {
      map.invalidateSize();
    };
    window.addEventListener("resize", handleResize);

    const container = map.getContainer();
    let resizeObserver;
    if (typeof ResizeObserver !== "undefined" && container) {
      resizeObserver = new ResizeObserver(() => {
        map.invalidateSize();
      });
      resizeObserver.observe(container);
    }

    const timer = setTimeout(() => {
      map.invalidateSize();
    }, 250);

    return () => {
      window.removeEventListener("resize", handleResize);
      resizeObserver?.disconnect();
      clearTimeout(timer);
    };
  }, [map]);

  return null;
}

function MapBounds({ issues, selectedId, isTracking }) {
  const map = useMap();
  const initialFit = useRef(false);

  useEffect(() => {
    if (isTracking) return;

    if (selectedId) {
      const selected = issues.find((item) => item.id === selectedId);
      if (selected) {
        map.setView([selected.latitude, selected.longitude], Math.max(map.getZoom(), 16), {
          animate: true,
        });
        return;
      }
    }

    if (!initialFit.current && issues.length > 0) {
      initialFit.current = true;
      if (issues.length > 1) {
        const bounds = L.latLngBounds(
          issues.map((issue) => [issue.latitude, issue.longitude]),
        );
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
      } else {
        map.setView([issues[0].latitude, issues[0].longitude], 15);
      }
    }
  }, [issues, selectedId, isTracking, map]);

  return null;
}

function FollowUserLocation({ location, isTracking }) {
  const map = useMap();
  const hasCentered = useRef(false);

  useEffect(() => {
    if (!isTracking || !location) {
      hasCentered.current = false;
      return;
    }

    const position = [location.latitude, location.longitude];
    if (!hasCentered.current) {
      map.setView(position, Math.max(map.getZoom(), 17), { animate: true });
      hasCentered.current = true;
    } else {
      map.panTo(position, { animate: true });
    }
  }, [isTracking, location, map]);

  return null;
}

function LocationControl({
  location,
  setLocation,
  isTracking,
  setIsTracking,
  isLocating,
  setIsLocating,
  locationError,
  setLocationError,
}) {
  const map = useMap();
  const watchId = useRef(null);

  useEffect(
    () => () => {
      if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
    },
    [],
  );

  function stopTracking() {
    if (watchId.current !== null) {
      navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    }
    setIsTracking(false);
    setIsLocating(false);
  }

  function handleLocationError(error) {
    stopTracking();
    setLocationError(
      error.code === 1
        ? "Location access denied. Please enable location permissions."
        : error.code === 3
          ? "Location timed out. Check your GPS reception."
          : "Location unavailable. Check device settings.",
    );
  }

  function locateUser() {
    setLocationError("");

    if (location) {
      map.setView(
        [location.latitude, location.longitude],
        Math.max(map.getZoom(), 17),
        { animate: true },
      );
      if (isTracking) return;
    }

    if (isTracking || isLocating) return;
    if (!navigator.geolocation) {
      setLocationError("Browser does not support geolocation.");
      return;
    }

    setIsLocating(true);
    try {
      const id = navigator.geolocation.watchPosition(
        (position) => {
          setLocation({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
          });
          setLocationError("");
          setIsLocating(false);
          setIsTracking(true);
        },
        handleLocationError,
        { enableHighAccuracy: true, maximumAge: 0, timeout: 20_000 },
      );
      watchId.current = id;
      setIsTracking(true);
    } catch (error) {
      setIsLocating(false);
      setLocationError(error.message || "Failed to start GPS tracking.");
    }
  }

  return (
    <div className="absolute right-3 top-3 z-[1000] flex max-w-[calc(100%-24px)] flex-col items-end gap-1.5 sm:right-3.5 sm:top-3.5 sm:gap-2">
      <div className="flex items-center gap-1 rounded-xl bg-white/95 p-1 shadow-sm backdrop-blur-md border border-slate-200">
        <button
          aria-label={isTracking ? "Center map on my live location" : "Locate my position"}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-wait disabled:opacity-60 sm:h-9 sm:px-3 sm:gap-2"
          disabled={isLocating}
          onClick={locateUser}
          title={isTracking ? "Center on my location" : "Find my location"}
          type="button"
        >
          {isLocating ? (
            <LoaderCircle aria-hidden="true" className="animate-spin text-blue-600" size={14} />
          ) : (
            <LocateFixed aria-hidden="true" className={isTracking ? "text-blue-600" : "text-slate-600"} size={14} />
          )}
          <span className="hidden xs:inline sm:inline">
            {isLocating ? "Locating…" : isTracking ? "Live GPS" : "Find Me"}
          </span>
        </button>
        {isTracking && (
          <button
            aria-label="Stop location tracking"
            className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition sm:h-9 sm:w-9"
            onClick={stopTracking}
            title="Stop live GPS tracking"
            type="button"
          >
            <LocateOff aria-hidden="true" size={14} />
          </button>
        )}
      </div>

      {(location || isTracking || locationError) && (
        <div
          aria-live="polite"
          className={`rounded-xl border px-2.5 py-1.5 text-right text-[11px] shadow-sm backdrop-blur-md transition sm:px-3 sm:py-2 sm:text-xs ${
            locationError
              ? "border-red-200 bg-red-50/95 text-red-700"
              : "border-slate-200 bg-white/95 text-slate-600"
          }`}
          role={locationError ? "alert" : "status"}
        >
          {locationError ? (
            locationError
          ) : location ? (
            <div>
              <div className="flex items-center justify-end gap-1 font-semibold text-slate-800">
                <span className="live-location-indicator" />
                <span>±{Math.round(location.accuracy)}m</span>
              </div>
              <p className="mt-0.5 hidden text-[10px] tabular-nums text-slate-500 sm:block">
                {location.latitude.toFixed(5)}, {location.longitude.toFixed(5)}
              </p>
            </div>
          ) : (
            "Acquiring GPS fix…"
          )}
        </div>
      )}
    </div>
  );
}

export default function IssueMap({ issues = [], selectedId = null, onSelect }) {
  const [location, setLocation] = useState(null);
  const [isTracking, setIsTracking] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [locationError, setLocationError] = useState("");

  const center =
    issues.length > 0
      ? [issues[0].latitude, issues[0].longitude]
      : [20, 0];
  const zoom = issues.length > 0 ? 14 : 2;

  return (
    <div className="map-shell h-full w-full min-h-[260px] overflow-hidden rounded-xl border border-slate-200/80 bg-slate-100 shadow-sm sm:rounded-2xl">
      <MapContainer
        center={center}
        zoom={zoom}
        scrollWheelZoom
        className="h-full w-full min-h-[260px]"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapAutoResize />
        <MapBounds issues={issues} selectedId={selectedId} isTracking={isTracking} />
        <FollowUserLocation location={location} isTracking={isTracking} />
        <LocationControl
          location={location}
          setLocation={setLocation}
          isTracking={isTracking}
          setIsTracking={setIsTracking}
          isLocating={isLocating}
          setIsLocating={setIsLocating}
          locationError={locationError}
          setLocationError={setLocationError}
        />
        {location && (
          <>
            <Circle
              center={[location.latitude, location.longitude]}
              radius={Math.max(location.accuracy, 8)}
              pathOptions={{
                color: "#2563eb",
                fillColor: "#3b82f6",
                fillOpacity: 0.12,
                weight: 1.5,
              }}
            />
            <Marker
              position={[location.latitude, location.longitude]}
              icon={userLocationIcon}
              zIndexOffset={1000}
            >
              <Popup>
                <div className="p-3 text-xs">
                  <p className="font-semibold text-blue-600">Your Current Position</p>
                  <p className="mt-1 tabular-nums text-slate-600">
                    {location.latitude.toFixed(6)}, {location.longitude.toFixed(6)}
                  </p>
                  <p className="mt-1 text-[11px] text-slate-400">
                    Accuracy: ±{Math.round(location.accuracy)} m
                  </p>
                </div>
              </Popup>
            </Marker>
          </>
        )}
        {issues.map((issue) => {
          const isSelected = issue.id === selectedId;
          const category = CATEGORY_LABELS[issue.category] ?? "Civic issue";

          return (
            <Marker
              key={issue.id}
              position={[issue.latitude, issue.longitude]}
              icon={createMarkerIcon(issue.status, issue.urgency, isSelected)}
              zIndexOffset={isSelected ? 500 : 0}
              eventHandlers={{
                click: () => onSelect?.(issue.id),
              }}
            >
              <Popup>
                <div className="w-52 p-2.5 sm:w-56 sm:p-3">
                  {issue.imageUrl && (
                    <div className="relative mb-2 h-16 w-full overflow-hidden rounded-lg bg-slate-100">
                      <img
                        src={issue.imageUrl}
                        alt={category}
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                      <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1.5 py-0.2 text-[9px] font-medium text-white backdrop-blur">
                        {category}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center justify-between gap-1.5">
                    <span className="text-xs font-semibold text-slate-900 truncate">{category}</span>
                    <span
                      className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide sm:text-[10px] ${
                        issue.status === "resolved"
                          ? "bg-emerald-50 text-emerald-700"
                          : issue.status === "in_progress"
                            ? "bg-blue-50 text-blue-700"
                            : issue.urgency === "high"
                              ? "bg-rose-50 text-rose-700"
                              : "bg-amber-50 text-amber-700"
                      }`}
                    >
                      {issue.status === "resolved"
                        ? "Resolved"
                        : issue.status === "in_progress"
                          ? "In Progress"
                          : issue.urgency === "high"
                            ? "Urgent"
                            : "Reported"}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-slate-600">
                    {issue.description}
                  </p>
                  <p className="mt-1.5 flex items-center gap-1 text-[11px] text-slate-400">
                    <MapPin size={11} className="shrink-0" />
                    <span className="truncate">{issue.address}</span>
                  </p>
                  <button
                    type="button"
                    onClick={() => onSelect?.(issue.id)}
                    className="mt-2.5 w-full rounded-lg bg-slate-900 py-1.5 text-center text-xs font-medium text-white transition hover:bg-slate-800"
                  >
                    Select Issue
                  </button>
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>
    </div>
  );
}
