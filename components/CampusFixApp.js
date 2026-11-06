"use client";

import dynamic from "next/dynamic";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  CircleAlert,
  Clock,
  Copy,
  Layers,
  ListFilter,
  LogOut,
  Map as MapIcon,
  MapPin,
  Plus,
  RefreshCw,
  Search,
  Shield,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import {
  collection,
  deleteIssueWithImage,
  doc,
  getFirebaseAuth,
  getFirebaseDb,
  isAdminUser,
  limit,
  onAuthStateChanged,
  onSnapshot,
  orderBy,
  query,
  signInAnonymously,
  signOutFirebase,
  updateDoc,
} from "../lib/firebase";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CATEGORIES, CATEGORY_LABELS, DEPARTMENTS, ISSUE_STATUSES } from "../lib/issue-data";
import ReportIssueModal from "./ReportIssueModal";

const IssueMap = dynamic(() => import("./IssueMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full min-h-[260px] flex-col items-center justify-center rounded-xl border border-slate-200/80 bg-slate-100 p-4 text-center text-slate-500 sm:rounded-2xl">
      <div className="h-7 w-7 animate-spin rounded-full border-2 border-slate-300 border-t-slate-800" />
      <p className="mt-2.5 text-xs font-medium">Loading interactive map…</p>
    </div>
  ),
});

const STATUS_CONFIG = {
  reported: {
    label: "Reported",
    bg: "bg-amber-50",
    text: "text-amber-700",
    border: "border-amber-200/70",
    dot: "bg-amber-500",
  },
  in_progress: {
    label: "In Progress",
    bg: "bg-blue-50",
    text: "text-blue-700",
    border: "border-blue-200/70",
    dot: "bg-blue-500",
  },
  resolved: {
    label: "Resolved",
    bg: "bg-emerald-50",
    text: "text-emerald-700",
    border: "border-emerald-200/70",
    dot: "bg-emerald-500",
  },
};

const CATEGORY_ICONS = {
  garbage: "🗑️",
  pothole: "🕳️",
  streetlight: "💡",
  water_leak: "🚰",
  safety_hazard: "⚠️",
  other: "📌",
};

function formatTimeAgo(timestamp) {
  if (!timestamp?.toDate) return "Just now";
  const date = timestamp.toDate();
  const now = new Date();
  const diffInSeconds = Math.floor((now - date) / 1000);

  if (diffInSeconds < 60) return "Just now";
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
  if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d ago`;

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function IssueCard({
  issue,
  selected,
  canManage,
  onSelect,
  onStatusChange,
  onDelete,
  saving,
  deleting,
}) {
  const categoryName = CATEGORY_LABELS[issue.category] ?? "Civic Issue";
  const categoryIcon = CATEGORY_ICONS[issue.category] || "📌";
  const statusInfo = STATUS_CONFIG[issue.status] || STATUS_CONFIG.reported;
  const isHighPriority = issue.urgency === "high";

  return (
    <article
      className={`group relative flex flex-col rounded-xl border p-3 transition-all duration-150 sm:p-3.5 ${
        selected
          ? "border-slate-900 bg-slate-50/70 shadow-sm ring-1 ring-slate-900"
          : "border-slate-200/80 bg-white hover:border-slate-300 hover:shadow-card"
      }`}
    >
      <div
        className="flex cursor-pointer gap-2.5 sm:gap-3"
        onClick={() => onSelect(issue.id)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onSelect(issue.id);
          }
        }}
        aria-label={`View ${categoryName} report`}
      >
        <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-slate-200/70 bg-slate-100 sm:h-14 sm:w-14">
          <img
            src={issue.imageUrl}
            alt={categoryName}
            loading="lazy"
            className="h-full w-full object-cover transition duration-200 group-hover:scale-105"
          />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-1.5">
            <span className="flex items-center gap-1.5 truncate text-xs font-semibold text-slate-900">
              <span className="text-sm">{categoryIcon}</span>
              <span className="truncate">{categoryName}</span>
            </span>
            <span className="shrink-0 text-[10px] text-slate-400 sm:text-[11px]">
              {formatTimeAgo(issue.createdAt)}
            </span>
          </div>

          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-600">
            {issue.description}
          </p>

          <div className="mt-1.5 flex items-center gap-1 text-[11px] text-slate-500">
            <MapPin size={11} className="shrink-0 text-slate-400" />
            <span className="truncate">{issue.address}</span>
          </div>
        </div>
      </div>

      <div className="mt-2.5 flex items-center justify-between border-t border-slate-100 pt-2 text-[10px] sm:pt-2.5">
        <div className="flex items-center gap-1.5">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-medium ${statusInfo.bg} ${statusInfo.text} ${statusInfo.border}`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${statusInfo.dot}`} />
            {statusInfo.label}
          </span>

          {isHighPriority && (
            <span className="inline-flex items-center gap-1 rounded-full border border-red-200/60 bg-red-50 px-2 py-0.5 font-medium text-red-700">
              High
            </span>
          )}
        </div>

        <span className="truncate text-slate-400 pl-2">
          {DEPARTMENTS[issue.category] || "Municipal Dept"}
        </span>
      </div>

      {canManage && (
        <div className="mt-2 flex items-center justify-between gap-2 border-t border-slate-100 pt-2 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-medium text-slate-500 sm:text-[11px]">Status:</span>
            <select
              aria-label={`Update status for ${categoryName}`}
              className="status-select min-w-[112px] rounded-lg border border-slate-200 bg-white py-1 pl-2.5 pr-7 text-[10px] font-semibold text-slate-800 disabled:opacity-50 sm:min-w-[120px] sm:text-[11px]"
              disabled={saving || deleting}
              value={issue.status}
              onChange={(e) => onStatusChange(issue, e.target.value)}
            >
              {ISSUE_STATUSES.map((status) => (
                <option value={status} key={status}>
                  {STATUS_CONFIG[status]?.label || status}
                </option>
              ))}
            </select>
          </div>

          <button
            aria-label={`Delete ${categoryName} report`}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium text-red-600 hover:bg-red-50 transition disabled:opacity-50 sm:text-[11px]"
            disabled={saving || deleting}
            onClick={() => onDelete(issue)}
            type="button"
          >
            <Trash2 size={12} />
            {deleting ? "Deleting…" : "Delete"}
          </button>
        </div>
      )}
    </article>
  );
}

export default function CampusFixApp() {
  const [user, setUser] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [issues, setIssues] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [filter, setFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState("split"); // "split" | "map" | "list"
  const [isReportOpen, setIsReportOpen] = useState(false);
  const [authError, setAuthError] = useState("");
  const [dataError, setDataError] = useState("");
  const [notice, setNotice] = useState("");
  const [copiedId, setCopiedId] = useState(null);
  const [savingStatusId, setSavingStatusId] = useState("");
  const [deletingIssueId, setDeletingIssueId] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  const statusOverridesRef = useRef(new Map());
  const pendingDeletesRef = useRef(new Set());

  useEffect(() => {
    let unsubscribe;
    let active = true;
    let currentUid = null;
    try {
      const auth = getFirebaseAuth();
      unsubscribe = onAuthStateChanged(auth, (currentUser) => {
        setUser(currentUser);
        setAuthError("");
        if (!currentUser) {
          currentUid = null;
          setIsAdmin(false);
          signInAnonymously(auth).catch((error) => {
            const anonymousProviderDisabled =
              error.code === "auth/operation-not-allowed" ||
              error.message?.includes("Anonymous sign-in is blocked");
            if (!anonymousProviderDisabled) {
              console.error("Anonymous sign-in error:", error);
            }
            setAuthError(error.message);
          });
          return;
        }

        currentUid = currentUser.uid;
        isAdminUser(currentUser)
          .then((authorized) => {
            if (active && currentUid === currentUser.uid) setIsAdmin(authorized);
          })
          .catch((error) => {
            console.error("Admin verification error:", error);
            if (active && currentUid === currentUser.uid) {
              setIsAdmin(false);
              setNotice("Could not verify admin access.");
            }
          });
      });
    } catch (error) {
      console.error("Firebase auth error:", error);
      setAuthError(error.message);
    }

    return () => {
      active = false;
      unsubscribe?.();
    };
  }, []);

  useEffect(() => {
    let unsubscribe;
    try {
      const db = getFirebaseDb();
      const issuesQuery = query(
        collection(db, "issues"),
        orderBy("createdAt", "desc"),
        limit(100),
      );
      unsubscribe = onSnapshot(
        issuesQuery,
        (snapshot) => {
          setIssues(
            snapshot.docs.flatMap((item) => {
              const issue = { id: item.id, ...item.data() };
              if (pendingDeletesRef.current.has(issue.id)) return [];
              const statusOverride = statusOverridesRef.current.get(issue.id);
              if (!statusOverride) return [issue];
              if (issue.status === statusOverride.status) {
                statusOverridesRef.current.delete(issue.id);
                return [issue];
              }
              return [{ ...issue, status: statusOverride.status }];
            }),
          );
          setDataError("");
          setIsLoading(false);
        },
        (error) => {
          console.error("Snapshot error:", error);
          setDataError(error.message || "Failed to load reports from database.");
          setIsLoading(false);
        },
      );
    } catch (error) {
      console.error("Database initialization error:", error);
      setDataError(error.message);
      setIsLoading(false);
    }

    return () => unsubscribe?.();
  }, []);

  useEffect(() => {
    if (!notice) return undefined;
    const timer = window.setTimeout(() => setNotice(""), 4000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const filteredIssues = useMemo(() => {
    return issues.filter((issue) => {
      if (filter !== "all" && issue.status !== filter) return false;
      if (categoryFilter !== "all" && issue.category !== categoryFilter) return false;
      if (searchQuery.trim()) {
        const queryLower = searchQuery.toLowerCase();
        const matchesAddress = issue.address?.toLowerCase().includes(queryLower);
        const matchesDesc = issue.description?.toLowerCase().includes(queryLower);
        const matchesCat = CATEGORY_LABELS[issue.category]?.toLowerCase().includes(queryLower);
        if (!matchesAddress && !matchesDesc && !matchesCat) return false;
      }
      return true;
    });
  }, [issues, filter, categoryFilter, searchQuery]);

  const selectedIssue = useMemo(
    () => issues.find((issue) => issue.id === selectedId) || null,
    [issues, selectedId],
  );

  const openCount = issues.filter((issue) => issue.status === "reported").length;
  const inProgressCount = issues.filter((issue) => issue.status === "in_progress").length;
  const highPriorityCount = issues.filter(
    (issue) => issue.urgency === "high" && issue.status !== "resolved",
  ).length;
  const resolvedCount = issues.filter((issue) => issue.status === "resolved").length;

  const updateStatus = useCallback(
    async (issue, status) => {
      if (!isAdmin) {
        setNotice("Admin authorization required to change status.");
        return;
      }
      if (!ISSUE_STATUSES.includes(status)) return;

      const previousStatus = issue.status;
      statusOverridesRef.current.set(issue.id, { status });
      setIssues((currentIssues) =>
        currentIssues.map((item) =>
          item.id === issue.id ? { ...item, status } : item,
        ),
      );
      setSavingStatusId(issue.id);
      try {
        await updateDoc(doc(getFirebaseDb(), "issues", issue.id), { status });
        setNotice(`Status updated to ${STATUS_CONFIG[status]?.label || status}.`);
      } catch (error) {
        statusOverridesRef.current.delete(issue.id);
        setIssues((currentIssues) =>
          currentIssues.map((item) =>
            item.id === issue.id ? { ...item, status: previousStatus } : item,
          ),
        );
        console.error("Status update error:", error);
        setNotice("Failed to update status. Please try again.");
      } finally {
        setSavingStatusId("");
      }
    },
    [isAdmin],
  );

  const deleteIssue = useCallback(
    async (issue) => {
      if (!isAdmin) {
        setNotice("Admin authorization required to delete reports.");
        return;
      }
      if (!window.confirm("Permanently delete this report and its photo?")) return;

      pendingDeletesRef.current.add(issue.id);
      setDeletingIssueId(issue.id);
      try {
        await deleteIssueWithImage(issue.id);
        setIssues((currentIssues) =>
          currentIssues.filter((item) => item.id !== issue.id),
        );
        setSelectedId((currentId) => (currentId === issue.id ? null : currentId));
        setNotice("Report successfully deleted.");
      } catch (error) {
        pendingDeletesRef.current.delete(issue.id);
        console.error("Delete error:", error);
        setNotice("Failed to delete report.");
      } finally {
        setDeletingIssueId("");
      }
    },
    [isAdmin],
  );

  const handleCopyLocation = (text, id) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleIssueCreated = () => {
    setFilter("all");
    setCategoryFilter("all");
    setSearchQuery("");
    setIsReportOpen(false);
    setNotice("Your report has been submitted to dispatch.");
  };

  return (
    <div className="flex min-h-screen w-full flex-col bg-slate-50 text-slate-900 lg:h-screen lg:max-h-screen lg:overflow-hidden">
      {/* Top Navbar */}
      <header className="sticky top-0 z-40 shrink-0 border-b border-slate-200/80 bg-white/95 backdrop-blur-md">
        <div className="mx-auto flex h-14 w-full max-w-7xl items-center justify-between px-3 sm:h-16 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white shadow-sm sm:h-9 sm:w-9">
              <ShieldCheck size={18} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 sm:gap-2">
                <span className="truncate text-sm font-bold tracking-tight text-slate-900">
                  CampusFix
                </span>
                <span className="hidden rounded-full border border-slate-200 bg-slate-100 px-2 py-0.2 text-[10px] font-medium text-slate-600 sm:inline-block">
                  Civic Tracker
                </span>
              </div>
              <p className="hidden text-[10px] text-slate-500 xs:block sm:text-[11px]">
                Infrastructure & Repairs Dispatch
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2.5">
            <div className="hidden items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-600 md:flex">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>Live System</span>
            </div>

            {isAdmin ? (
              <button
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition sm:h-9 sm:px-3"
                onClick={signOutFirebase}
                type="button"
                aria-label="Sign out"
              >
                <LogOut size={13} />
                <span className="hidden xs:inline">Sign Out</span>
              </button>
            ) : (
              <a
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition sm:h-9 sm:px-3"
                href="/admin"
              >
                <Shield size={13} />
                <span className="hidden xs:inline sm:inline">Admin</span>
              </a>
            )}

            <button
              type="button"
              onClick={() => setIsReportOpen(true)}
              disabled={!user || Boolean(authError)}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-slate-900 px-3 text-xs font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-50 sm:h-9 sm:px-3.5"
            >
              <Plus size={14} />
              <span>Report</span>
              <span className="hidden sm:inline">Issue</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col overflow-hidden px-3 py-3 sm:px-6 sm:py-4 lg:px-8">
        {/* Compact Operational Overview Bar */}
        <section className="mb-3 shrink-0 rounded-xl border border-slate-200/80 bg-white p-3 shadow-sm sm:mb-4 sm:rounded-2xl sm:p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <h1 className="truncate text-sm font-bold tracking-tight text-slate-900 sm:text-base">
                Campus & Community Operations
              </h1>
              <p className="mt-0.5 text-[11px] text-slate-500 sm:text-xs">
                Real-time incident feed and verified location mapping.
              </p>
            </div>

            {/* Quick Metrics Autofit Grid */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-2.5">
              <div className="flex items-center gap-2 rounded-lg border border-slate-100 bg-slate-50/80 px-2.5 py-1.5 sm:px-3 sm:py-2">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-amber-100 text-amber-700 sm:h-7 sm:w-7">
                  <Clock size={13} />
                </span>
                <div className="min-w-0">
                  <div className="truncate text-[9px] font-medium uppercase text-slate-400 sm:text-[10px]">
                    Reported
                  </div>
                  <div className="text-xs font-bold text-slate-900 sm:text-sm">{openCount}</div>
                </div>
              </div>

              <div className="flex items-center gap-2 rounded-lg border border-slate-100 bg-slate-50/80 px-2.5 py-1.5 sm:px-3 sm:py-2">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-blue-100 text-blue-700 sm:h-7 sm:w-7">
                  <RefreshCw size={13} />
                </span>
                <div className="min-w-0">
                  <div className="truncate text-[9px] font-medium uppercase text-slate-400 sm:text-[10px]">
                    In Progress
                  </div>
                  <div className="text-xs font-bold text-slate-900 sm:text-sm">{inProgressCount}</div>
                </div>
              </div>

              <div className="flex items-center gap-2 rounded-lg border border-slate-100 bg-slate-50/80 px-2.5 py-1.5 sm:px-3 sm:py-2">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-red-100 text-red-700 sm:h-7 sm:w-7">
                  <AlertTriangle size={13} />
                </span>
                <div className="min-w-0">
                  <div className="truncate text-[9px] font-medium uppercase text-slate-400 sm:text-[10px]">
                    Urgent
                  </div>
                  <div className="text-xs font-bold text-slate-900 sm:text-sm">{highPriorityCount}</div>
                </div>
              </div>

              <div className="flex items-center gap-2 rounded-lg border border-slate-100 bg-slate-50/80 px-2.5 py-1.5 sm:px-3 sm:py-2">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-emerald-100 text-emerald-700 sm:h-7 sm:w-7">
                  <CheckCircle2 size={13} />
                </span>
                <div className="min-w-0">
                  <div className="truncate text-[9px] font-medium uppercase text-slate-400 sm:text-[10px]">
                    Resolved
                  </div>
                  <div className="text-xs font-bold text-slate-900 sm:text-sm">{resolvedCount}</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Global Alert Bar if Errors */}
        {(authError || dataError) && (
          <div
            className="mb-3 flex shrink-0 items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800"
            role="alert"
          >
            <CircleAlert size={15} className="mt-0.5 shrink-0" />
            <div className="min-w-0 flex-1">
              {authError || dataError}
            </div>
          </div>
        )}

        {/* Autofit Filter & View Mode Toolbar */}
        <section className="mb-3 shrink-0 flex flex-col gap-2 rounded-xl border border-slate-200/80 bg-white p-2.5 shadow-sm sm:mb-4 sm:flex-row sm:items-center sm:justify-between sm:rounded-2xl sm:p-3">
          <div className="flex flex-1 flex-wrap items-center gap-2">
            {/* Search Input */}
            <div className="relative min-w-[160px] flex-1 sm:max-w-xs">
              <Search
                size={13}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search location or keyword…"
                className="h-8 w-full rounded-lg border border-slate-200 bg-slate-50/50 pl-8 pr-7 text-xs text-slate-800 placeholder-slate-400 outline-none transition focus:border-slate-900 focus:bg-white sm:h-9"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X size={12} />
                </button>
              )}
            </div>

            {/* Status Filter */}
            <select
              aria-label="Filter by status"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="status-select h-8 min-w-[120px] rounded-lg border border-slate-200 bg-slate-50/50 pl-3 pr-8 text-xs font-semibold text-slate-700 outline-none transition focus:border-slate-900 focus:bg-white sm:h-9 sm:min-w-[130px]"
            >
              <option value="all">All Statuses</option>
              <option value="reported">Reported</option>
              <option value="in_progress">In Progress</option>
              <option value="resolved">Resolved</option>
            </select>

            {/* Category Filter */}
            <select
              aria-label="Filter by category"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="status-select h-8 min-w-[135px] rounded-lg border border-slate-200 bg-slate-50/50 pl-3 pr-8 text-xs font-semibold text-slate-700 outline-none transition focus:border-slate-900 focus:bg-white sm:h-9 sm:min-w-[145px]"
            >
              <option value="all">All Categories</option>
              {CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {CATEGORY_LABELS[cat] || cat}
                </option>
              ))}
            </select>
          </div>

          {/* View Mode Toggle (Responsive Autofit) */}
          <div className="flex items-center justify-end">
            <div className="flex rounded-lg border border-slate-200 bg-slate-100/70 p-0.5">
              <button
                type="button"
                onClick={() => setViewMode("split")}
                className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition sm:px-2.5 ${
                  viewMode === "split"
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                }`}
                title="Split View"
              >
                <Layers size={13} />
                <span>Split</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode("map")}
                className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition sm:px-2.5 ${
                  viewMode === "map"
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                }`}
                title="Map View"
              >
                <MapIcon size={13} />
                <span>Map</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode("list")}
                className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition sm:px-2.5 ${
                  viewMode === "list"
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                }`}
                title="Feed View"
              >
                <ListFilter size={13} />
                <span>Feed</span>
              </button>
            </div>
          </div>
        </section>

        {/* Dynamic Autofit Workspace Grid */}
        <div
          className={`grid flex-1 min-h-0 w-full gap-3 sm:gap-4 ${
            viewMode === "split"
              ? "grid-cols-1 lg:grid-cols-[minmax(0,1.3fr)_minmax(360px,1fr)]"
              : "grid-cols-1"
          }`}
        >
          {/* Map Section */}
          {viewMode !== "list" && (
            <div
              className={`flex flex-col rounded-xl border border-slate-200/80 bg-white p-2.5 shadow-sm sm:rounded-2xl sm:p-3.5 ${
                viewMode === "map"
                  ? "h-[65vh] lg:h-full lg:min-h-0"
                  : viewMode === "split"
                    ? "h-[36vh] min-h-[260px] lg:h-full lg:min-h-0"
                    : "h-full"
              }`}
            >
              <div className="mb-2 flex items-center justify-between px-1">
                <div className="flex items-center gap-1.5">
                  <h2 className="text-xs font-semibold text-slate-900">
                    Live Map
                  </h2>
                  <span className="rounded-full bg-slate-100 px-2 py-0.2 text-[10px] font-medium text-slate-600">
                    {filteredIssues.length} pins
                  </span>
                </div>
                <div className="flex items-center gap-2 text-[10px] text-slate-400 sm:text-[11px] sm:gap-2.5">
                  <span className="flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-500" /> Reported
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-blue-600" /> In Progress
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-red-500" /> Urgent
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Resolved
                  </span>
                </div>
              </div>

              <div className="flex-1 min-h-0 overflow-hidden rounded-lg sm:rounded-xl">
                <IssueMap
                  issues={filteredIssues}
                  selectedId={selectedId}
                  onSelect={(id) => setSelectedId(id)}
                />
              </div>
            </div>
          )}

          {/* Feed / Reports Section */}
          {viewMode !== "map" && (
            <div className="flex flex-col h-full min-h-0 rounded-xl border border-slate-200/80 bg-white p-3 shadow-sm sm:rounded-2xl sm:p-4">
              <div className="mb-2.5 flex items-center justify-between">
                <div>
                  <h2 className="text-xs font-semibold text-slate-900">
                    Report Feed
                  </h2>
                  <p className="text-[10px] text-slate-500 sm:text-[11px]">
                    {filteredIssues.length} {filteredIssues.length === 1 ? "report" : "reports"}
                  </p>
                </div>

                {selectedId && (
                  <button
                    type="button"
                    onClick={() => setSelectedId(null)}
                    className="text-xs font-medium text-blue-600 hover:text-blue-800"
                  >
                    Clear selection
                  </button>
                )}
              </div>

              {/* Selected Issue Preview Card */}
              {selectedIssue && (
                <div className="mb-3 shrink-0 rounded-xl border border-blue-200/80 bg-blue-50/40 p-3">
                  <div className="flex items-start justify-between gap-1.5">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm">
                        {CATEGORY_ICONS[selectedIssue.category] || "📌"}
                      </span>
                      <span className="text-xs font-bold text-slate-900">
                        {CATEGORY_LABELS[selectedIssue.category] || "Civic Issue"}
                      </span>
                      <span
                        className={`rounded px-1.5 py-0.2 text-[9px] font-semibold uppercase sm:text-[10px] ${
                          selectedIssue.status === "resolved"
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        {selectedIssue.status}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedId(null)}
                      className="text-slate-400 hover:text-slate-600"
                    >
                      <X size={13} />
                    </button>
                  </div>

                  <div className="mt-2 flex items-start gap-2.5 sm:gap-3">
                    <img
                      src={selectedIssue.imageUrl}
                      alt={selectedIssue.category}
                      className="h-14 w-14 shrink-0 rounded-lg object-cover border border-slate-200"
                    />
                    <div className="min-w-0 flex-1 text-xs">
                      <p className="line-clamp-3 text-slate-700 leading-relaxed">
                        {selectedIssue.description}
                      </p>
                      <div className="mt-1.5 flex items-center justify-between gap-1 text-[10px] text-slate-500 sm:text-[11px]">
                        <span className="truncate">{selectedIssue.address}</span>
                        <button
                          type="button"
                          onClick={() => handleCopyLocation(selectedIssue.address, selectedIssue.id)}
                          className="flex shrink-0 items-center gap-1 text-blue-600 hover:text-blue-800 font-medium"
                          title="Copy address"
                        >
                          <Copy size={11} />
                          {copiedId === selectedIssue.id ? "Copied" : "Copy"}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Scrollable list of cards autofitted to container height */}
              <div className="flex-1 min-h-0 overflow-y-auto pr-1 flex flex-col gap-2 sm:gap-2.5">
                {isLoading ? (
                  <div className="flex min-h-[180px] flex-col items-center justify-center text-center text-xs text-slate-400">
                    <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-200 border-t-slate-800" />
                    <p className="mt-2">Loading reports…</p>
                  </div>
                ) : filteredIssues.length === 0 ? (
                  <div className="flex min-h-[180px] flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/60 p-4 text-center">
                    <div className="grid h-9 w-9 place-items-center rounded-full bg-slate-100 text-slate-400">
                      <MapPin size={16} />
                    </div>
                    <p className="mt-2 text-xs font-semibold text-slate-800">
                      No matching reports
                    </p>
                    <p className="mt-0.5 text-[11px] text-slate-500 max-w-xs">
                      Adjust your filters or query to view more issues.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setFilter("all");
                        setCategoryFilter("all");
                        setSearchQuery("");
                      }}
                      className="mt-2.5 text-xs font-semibold text-blue-600 hover:text-blue-800"
                    >
                      Reset filters
                    </button>
                  </div>
                ) : (
                  filteredIssues.map((issue) => (
                    <IssueCard
                      key={issue.id}
                      issue={issue}
                      selected={selectedId === issue.id}
                      canManage={isAdmin}
                      onSelect={setSelectedId}
                      onStatusChange={updateStatus}
                      onDelete={deleteIssue}
                      saving={savingStatusId === issue.id}
                      deleting={deletingIssueId === issue.id}
                    />
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Compact Autofit Footer */}
      <footer className="shrink-0 border-t border-slate-200/80 bg-white py-2.5 text-[11px] text-slate-500">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-1 px-3 sm:flex-row sm:px-6 lg:px-8">
          <p>© {new Date().getFullYear()} CampusFix · Civic Operations</p>
          <p className="flex items-center gap-1 text-slate-400">
            <ShieldCheck size={12} />
            Verified GPS coordinates embedded
          </p>
        </div>
      </footer>

      {/* Toast Notification */}
      {notice && (
        <div
          className="fixed bottom-4 left-1/2 z-[1200] flex -translate-x-1/2 items-center gap-2 rounded-xl bg-slate-900 px-3.5 py-2 text-xs font-medium text-white shadow-lg"
          role="status"
        >
          <Check size={13} className="text-emerald-400" />
          <span>{notice}</span>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => setNotice("")}
            className="ml-1 text-slate-400 hover:text-white"
          >
            <X size={12} />
          </button>
        </div>
      )}

      {/* Report Modal */}
      {isReportOpen && user && (
        <ReportIssueModal
          user={user}
          onClose={() => setIsReportOpen(false)}
          onCreated={handleIssueCreated}
        />
      )}
    </div>
  );
}
