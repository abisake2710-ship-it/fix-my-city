"use client";

import {
  ArrowLeft,
  ArrowRight,
  Camera,
  Check,
  CheckCircle2,
  CircleAlert,
  Compass,
  FileCheck2,
  LoaderCircle,
  MapPin,
  RefreshCw,
  RotateCcw,
  Shield,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { collection, createIssueWithImage, getFirebaseDb, serverTimestamp } from "../lib/firebase";
import { CATEGORIES, CATEGORY_LABELS, DEPARTMENTS, URGENCIES } from "../lib/issue-data";

const MAX_PHOTO_BYTES = 600 * 1024;

function getPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Your browser does not support geolocation."));
      return;
    }

    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 20000,
      maximumAge: 0,
    });
  });
}

function readableLocationError(error) {
  if (error?.code === 1) return "Location permission was denied. Please allow location access in your browser.";
  if (error?.code === 2) return "Location signal unavailable. Try moving closer to an open window or outdoors.";
  if (error?.code === 3) return "Location request timed out. Please try again.";
  return error?.message || "Could not access location.";
}

function toDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Failed to read photo data."));
    reader.readAsDataURL(blob);
  });
}

async function postJson(url, payload, token) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error("Received an unexpected response from the server.");
  }

  if (!response.ok) {
    throw new Error(data.error || "Request failed. Please try again.");
  }
  return data;
}

export default function ReportIssueModal({ user, onClose, onCreated }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const previewUrlRef = useRef("");

  const [stage, setStage] = useState("start"); // "start" | "camera" | "preview" | "result"
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [coords, setCoords] = useState(null);
  const [address, setAddress] = useState("");
  const [photo, setPhoto] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");

  // Editable analysis fields
  const [selectedCategory, setSelectedCategory] = useState("other");
  const [selectedUrgency, setSelectedUrgency] = useState("medium");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  };

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === "Escape" && !busy && !saving) onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [busy, onClose, saving]);

  useEffect(() => {
    if (stage !== "camera" || !streamRef.current || !videoRef.current) return;
    videoRef.current.srcObject = streamRef.current;
    videoRef.current.play().catch((playError) => {
      console.error("Camera playback error:", playError);
      setError("Unable to stream camera feed. Please check permissions and reload.");
    });
  }, [stage]);

  async function startCamera() {
    setError("");
    setBusy(true);
    setProgress("Requesting camera and GPS access…");
    let cameraStream;
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Camera requires a supported browser and HTTPS connection.");
      }

      const cameraPromise = navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1600 }, height: { ideal: 1200 } },
      });
      const locationPromise = getPosition();
      const [cameraResult, locationResult] = await Promise.allSettled([
        cameraPromise,
        locationPromise,
      ]);

      if (cameraResult.status === "fulfilled") cameraStream = cameraResult.value;
      if (cameraResult.status === "rejected") {
        throw new Error("Camera permission was denied. Please allow camera access in your browser.");
      }
      if (locationResult.status === "rejected") {
        throw new Error(readableLocationError(locationResult.reason));
      }

      const position = locationResult.value;
      const nextCoords = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      };
      setCoords(nextCoords);
      setProgress("Resolving street address…");
      const token = await user.getIdToken();
      const response = await fetch(
        `/api/geocode?lat=${encodeURIComponent(nextCoords.latitude)}&lon=${encodeURIComponent(nextCoords.longitude)}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Unable to resolve street address.");
      }

      setAddress(result.address);
      streamRef.current = cameraStream;
      setStage("camera");
      setProgress("");
    } catch (startError) {
      console.error("Setup error:", startError);
      cameraStream?.getTracks().forEach((track) => track.stop());
      setError(startError.message || "Failed to initialize camera.");
      setProgress("");
    } finally {
      setBusy(false);
    }
  }

  async function capturePhoto() {
    const video = videoRef.current;
    if (!video?.videoWidth || !video?.videoHeight || !coords || !address) {
      setError("Camera is still warming up. Please try again in a moment.");
      return;
    }

    setError("");
    const scale = Math.min(1, 1200 / video.videoWidth);
    const width = Math.round(video.videoWidth * scale);
    const height = Math.round(video.videoHeight * scale);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) {
      setError("Could not initialize image processing canvas.");
      return;
    }

    context.drawImage(video, 0, 0, width, height);

    // Clean modern location watermark overlay
    const barHeight = Math.max(80, Math.round(height * 0.16));
    context.fillStyle = "rgba(15, 23, 42, 0.85)";
    context.fillRect(0, height - barHeight, width, barHeight);
    context.fillStyle = "#ffffff";
    context.textBaseline = "middle";
    const padding = Math.max(20, Math.round(width * 0.03));
    let addressFont = Math.max(16, Math.round(width * 0.026));
    context.font = `600 ${addressFont}px system-ui, -apple-system, sans-serif`;
    while (context.measureText(address).width > width - padding * 2 && addressFont > 12) {
      addressFont -= 1;
      context.font = `600 ${addressFont}px system-ui, -apple-system, sans-serif`;
    }
    const firstLine = addressFont + Math.round(height * 0.03);
    const coordinates = `Lat: ${coords.latitude.toFixed(6)}, Lon: ${coords.longitude.toFixed(6)}`;
    context.fillText(address, padding, height - barHeight / 2 - firstLine / 2, width - padding * 2);
    context.font = `500 ${Math.max(13, Math.round(addressFont * 0.72))}px system-ui, -apple-system, sans-serif`;
    context.fillStyle = "rgba(226, 232, 240, 0.9)";
    context.fillText(coordinates, padding, height - barHeight / 2 + firstLine / 2);

    let blob = null;
    for (const imageScale of [1, 0.85, 0.7, 0.55]) {
      const outputCanvas = document.createElement("canvas");
      outputCanvas.width = Math.round(width * imageScale);
      outputCanvas.height = Math.round(height * imageScale);
      const outputContext = outputCanvas.getContext("2d");
      if (!outputContext) {
        setError("Could not process photo compression.");
        return;
      }
      outputContext.drawImage(canvas, 0, 0, outputCanvas.width, outputCanvas.height);

      for (const quality of [0.8, 0.7, 0.6, 0.5]) {
        blob = await new Promise((resolve) =>
          outputCanvas.toBlob(resolve, "image/jpeg", quality),
        );
        if (blob?.size <= MAX_PHOTO_BYTES) break;
      }
      if (blob?.size <= MAX_PHOTO_BYTES) break;
    }

    if (!blob) {
      setError("Unable to compress image. Please try again.");
      return;
    }
    if (blob.size > MAX_PHOTO_BYTES) {
      setError("Photo size exceeds limits. Please step closer to the subject and retake.");
      return;
    }

    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    const nextPreviewUrl = URL.createObjectURL(blob);
    previewUrlRef.current = nextPreviewUrl;
    setPreviewUrl(nextPreviewUrl);
    setPhoto(blob);
    stopCamera();
    setStage("preview");
  }

  async function analyzePhoto() {
    if (!photo) return;
    setError("");
    setBusy(true);
    try {
      const token = await user.getIdToken();
      setProgress("Verifying image and categorizing issue…");
      const result = await postJson(
        "/api/analyze",
        { imageDataUrl: await toDataUrl(photo) },
        token,
      );

      setSelectedCategory(result.category || "other");
      setSelectedUrgency(result.urgency || "medium");
      setDescription(result.description || "");
      setStage("result");
    } catch (uploadError) {
      console.error("Analysis error:", uploadError);
      setError(uploadError.message || "Failed to analyze photo.");
    } finally {
      setBusy(false);
      setProgress("");
    }
  }

  async function saveIssue() {
    if (!user || !coords || !address || !photo) {
      setError("Incomplete report details. Please retake the photo.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const dataUrl = await toDataUrl(photo);
      const imageBase64 = dataUrl.slice("data:image/jpeg;base64,".length);
      await createIssueWithImage(
        collection(getFirebaseDb(), "issues"),
        {
          category: selectedCategory,
          urgency: selectedUrgency,
          description: description.trim() || `Civic issue reported: ${CATEGORY_LABELS[selectedCategory] || "Other"}`,
          department: DEPARTMENTS[selectedCategory] || DEPARTMENTS.other,
          address,
          latitude: coords.latitude,
          longitude: coords.longitude,
          status: "reported",
          reportedBy: user.uid,
          createdAt: serverTimestamp(),
        },
        imageBase64,
      );
      onCreated();
    } catch (saveError) {
      console.error("Save error:", saveError);
      setError(
        saveError.code === "permission-denied"
          ? "Permission denied. Please verify authorization and try again."
          : "Could not save report. Please check your connection and retry.",
      );
    } finally {
      setSaving(false);
    }
  }

  function retakePhoto() {
    setPhoto(null);
    setError("");
    setStage("start");
  }

  const steps = [
    { id: "start", label: "Camera & Location" },
    { id: "preview", label: "Verify Stamp" },
    { id: "result", label: "Review & Dispatch" },
  ];

  const currentStepIndex =
    stage === "start" || stage === "camera"
      ? 0
      : stage === "preview"
        ? 1
        : 2;

  return (
    <div
      className="fixed inset-0 z-[1100] flex items-end justify-center bg-slate-900/60 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy && !saving) onClose();
      }}
    >
      <section
        aria-labelledby="report-modal-title"
        aria-modal="true"
        className="relative flex max-h-[94dvh] w-full max-w-xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl sm:max-h-[88vh]"
        role="dialog"
      >
        {/* Header */}
        <header className="flex items-center justify-between border-b border-slate-100 px-4 py-3 sm:px-6 sm:py-4">
          <div className="min-w-0 pr-2">
            <h2 id="report-modal-title" className="truncate text-sm font-semibold text-slate-900 sm:text-base">
              New Issue Report
            </h2>
            <p className="truncate text-[11px] text-slate-500 sm:text-xs">
              Verified with live GPS coordinates and location watermark
            </p>
          </div>
          <button
            type="button"
            aria-label="Close dialog"
            onClick={onClose}
            disabled={busy || saving}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-40"
          >
            <X size={17} />
          </button>
        </header>

        {/* Step Indicator */}
        <div className="border-b border-slate-100 bg-slate-50/70 px-4 py-2 sm:px-6 sm:py-2.5">
          <div className="flex items-center justify-between gap-1 sm:gap-2">
            {steps.map((step, idx) => (
              <div key={step.id} className="flex min-w-0 items-center gap-1 sm:gap-2">
                <span
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] sm:h-5 sm:w-5 sm:text-[11px] font-semibold ${
                    idx < currentStepIndex
                      ? "bg-slate-900 text-white"
                      : idx === currentStepIndex
                        ? "bg-blue-600 text-white"
                        : "bg-slate-200 text-slate-500"
                  }`}
                >
                  {idx < currentStepIndex ? <Check size={10} strokeWidth={3} /> : idx + 1}
                </span>
                <span
                  className={`truncate text-[10px] sm:text-xs ${
                    idx === currentStepIndex
                      ? "font-semibold text-slate-900"
                      : "text-slate-500"
                  }`}
                >
                  {step.label}
                </span>
                {idx < steps.length - 1 && (
                  <span className="mx-1 hidden h-px w-4 bg-slate-200 sm:block sm:w-6" />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Content Area */}
        <div className="overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
          {stage === "start" && (
            <div className="space-y-4">
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50/80 px-6 py-10 text-center">
                <div className="grid h-12 w-12 place-items-center rounded-full bg-slate-100 text-slate-700 shadow-sm">
                  <Camera size={22} />
                </div>
                <h3 className="mt-4 text-sm font-semibold text-slate-900">
                  Ready to capture issue
                </h3>
                <p className="mt-1 max-w-sm text-xs leading-relaxed text-slate-500">
                  CampusFix will request access to your camera and current GPS coordinates to verify the exact location of the issue.
                </p>
                <div className="mt-6 flex flex-wrap items-center justify-center gap-3 text-xs text-slate-600">
                  <span className="inline-flex items-center gap-1.5 rounded-md bg-white px-2.5 py-1 shadow-sm border border-slate-200">
                    <Compass size={13} className="text-blue-600" />
                    High-accuracy GPS
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-md bg-white px-2.5 py-1 shadow-sm border border-slate-200">
                    <Shield size={13} className="text-emerald-600" />
                    Watermarked photo
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={startCamera}
                disabled={busy}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-slate-900 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
              >
                {busy ? <LoaderCircle className="animate-spin" size={16} /> : <Camera size={16} />}
                {busy ? progress || "Requesting permissions…" : "Open Camera & GPS"}
              </button>
            </div>
          )}

          {stage === "camera" && (
            <div className="space-y-4">
              <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-slate-950">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="h-full w-full object-cover"
                />

                {/* Viewfinder Overlay */}
                <div className="pointer-events-none absolute inset-4 border border-white/30 rounded-lg">
                  <div className="absolute left-0 top-0 h-4 w-4 border-l-2 border-t-2 border-white" />
                  <div className="absolute right-0 top-0 h-4 w-4 border-r-2 border-t-2 border-white" />
                  <div className="absolute bottom-0 left-0 h-4 w-4 border-b-2 border-l-2 border-white" />
                  <div className="absolute bottom-0 right-0 h-4 w-4 border-b-2 border-r-2 border-white" />
                </div>

                <div className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-slate-900/80 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
                  Live Viewfinder
                </div>
              </div>

              <div className="flex items-start gap-2.5 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs">
                <MapPin size={16} className="mt-0.5 shrink-0 text-blue-600" />
                <div className="min-w-0">
                  <p className="font-semibold text-slate-800">Locked Address</p>
                  <p className="mt-0.5 truncate text-slate-500">{address}</p>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    stopCamera();
                    setStage("start");
                  }}
                  className="flex h-11 items-center justify-center rounded-xl border border-slate-200 px-4 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={capturePhoto}
                  className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-slate-900 text-sm font-semibold text-white transition hover:bg-slate-800"
                >
                  <Camera size={16} />
                  Capture Photo
                </button>
              </div>
            </div>
          )}

          {stage === "preview" && (
            <div className="space-y-3.5">
              <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-slate-100 flex items-center justify-center">
                <img
                  src={previewUrl}
                  alt="Captured photo with verified location watermark"
                  className="max-h-[26vh] w-auto max-w-full object-contain"
                />
                <span className="absolute left-2.5 top-2.5 inline-flex items-center gap-1.5 rounded-md bg-slate-900/85 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur">
                  <FileCheck2 size={12} className="text-emerald-400" />
                  Watermark Attached
                </span>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-800">Location Record</span>
                  <span className="text-[11px] text-slate-400 tabular-nums">
                    {coords.latitude.toFixed(5)}, {coords.longitude.toFixed(5)}
                  </span>
                </div>
                <p className="mt-1 text-slate-600">{address}</p>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={retakePhoto}
                  disabled={busy}
                  className="flex h-11 items-center justify-center gap-1.5 rounded-xl border border-slate-200 px-4 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  <RotateCcw size={14} />
                  Retake
                </button>
                <button
                  type="button"
                  onClick={analyzePhoto}
                  disabled={busy}
                  className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-slate-900 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
                >
                  {busy ? <LoaderCircle className="animate-spin" size={16} /> : <ArrowRight size={16} />}
                  {busy ? progress || "Processing…" : "Continue with this photo"}
                </button>
              </div>
            </div>
          )}

          {stage === "result" && (
            <div className="space-y-3.5">
              <div className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-slate-50 p-2.5">
                <img
                  src={previewUrl}
                  alt="Issue thumbnail"
                  className="h-12 w-12 shrink-0 rounded-lg object-cover border border-slate-200"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-slate-900">Verified Location</p>
                  <p className="mt-0.5 line-clamp-1 text-xs text-slate-500">{address}</p>
                  <p className="mt-1 text-[11px] tabular-nums text-slate-400">
                    GPS: {coords.latitude.toFixed(5)}, {coords.longitude.toFixed(5)}
                  </p>
                </div>
              </div>

              {/* Form Controls */}
              <div className="space-y-3.5">
                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Issue Category
                  </label>
                  <select
                    value={selectedCategory}
                    onChange={(e) => setSelectedCategory(e.target.value)}
                    className="status-select mt-1.5 h-10 w-full rounded-xl border border-slate-200 bg-white pl-3 pr-8 text-xs font-medium text-slate-800 outline-none focus:border-slate-900"
                  >
                    {CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {CATEGORY_LABELS[cat] || cat}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700">
                      Priority Level
                    </label>
                    <select
                      value={selectedUrgency}
                      onChange={(e) => setSelectedUrgency(e.target.value)}
                      className="status-select mt-1.5 h-10 w-full rounded-xl border border-slate-200 bg-white pl-3 pr-8 text-xs font-medium text-slate-800 outline-none focus:border-slate-900"
                    >
                      {URGENCIES.map((urg) => (
                        <option key={urg} value={urg}>
                          {urg.charAt(0).toUpperCase() + urg.slice(1)} Priority
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700">
                      Routing Department
                    </label>
                    <div className="mt-1.5 flex h-10 items-center rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs text-slate-600">
                      <span className="truncate">
                        {DEPARTMENTS[selectedCategory] || DEPARTMENTS.other}
                      </span>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Description & Observations
                  </label>
                  <textarea
                    rows={3}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Provide additional details to assist dispatch teams…"
                    className="mt-1.5 w-full rounded-xl border border-slate-200 p-3 text-xs text-slate-800 outline-none focus:border-slate-900 resize-none"
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={retakePhoto}
                  disabled={saving}
                  className="flex h-11 items-center justify-center gap-1.5 rounded-xl border border-slate-200 px-4 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  <ArrowLeft size={14} />
                  Retake
                </button>
                <button
                  type="button"
                  onClick={saveIssue}
                  disabled={saving}
                  className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-slate-900 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
                >
                  {saving ? (
                    <LoaderCircle className="animate-spin" size={16} />
                  ) : (
                    <CheckCircle2 size={16} />
                  )}
                  {saving ? "Submitting Report…" : "Submit Report to Dispatch"}
                </button>
              </div>
            </div>
          )}

          {error && (
            <div
              className="mt-4 flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700"
              role="alert"
            >
              <CircleAlert size={16} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
