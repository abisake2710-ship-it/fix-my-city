"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft, CheckCircle2, CircleAlert, LoaderCircle, LogOut, ShieldCheck } from "lucide-react";
import {
  getFirebaseAuth,
  isAdminUser,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOutFirebase,
} from "../lib/firebase";

export default function AdminLogin() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    let unsubscribe;
    try {
      unsubscribe = onAuthStateChanged(getFirebaseAuth(), (user) => {
        if (!user || user.isAnonymous) {
          if (active) {
            setIsAdmin(false);
            setAdminEmail("");
            setIsCheckingSession(false);
          }
          return;
        }

        isAdminUser(user)
          .then((authorized) => {
            if (!active) return;
            setIsAdmin(authorized);
            setAdminEmail(authorized ? user.email || "" : "");
            setIsCheckingSession(false);
          })
          .catch((sessionError) => {
            console.error("Session verification error:", sessionError);
            if (!active) return;
            setError("Could not verify administrator access. Check network connectivity.");
            setIsCheckingSession(false);
          });
      });
    } catch (sessionError) {
      console.error("Auth init error:", sessionError);
      setError("Firebase configuration error.");
      setIsCheckingSession(false);
    }

    return () => {
      active = false;
      unsubscribe?.();
    };
  }, []);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const { user } = await signInWithEmailAndPassword(
        getFirebaseAuth(),
        email,
        password,
      );
      if (!(await isAdminUser(user))) {
        signOutFirebase();
        setError("This account is not authorized as an administrator.");
        return;
      }

      router.push("/");
    } catch (signInError) {
      console.error("Sign-in error:", signInError);
      setError(signInError.message || "Failed to sign in.");
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleSignOut() {
    signOutFirebase();
    setError("");
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900">
      {/* Top Navigation */}
      <header className="border-b border-slate-200/80 bg-white px-4 py-4 sm:px-6">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600 transition hover:text-slate-900"
          >
            <ArrowLeft size={15} />
            Back to Incident Feed
          </Link>
          <span className="text-xs font-medium text-slate-400">CampusFix Dispatch Admin</span>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex flex-1 items-center justify-center p-3 sm:p-4">
        <div className="w-full max-w-md rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-8">
          <div className="mb-6 flex h-11 w-11 items-center justify-center rounded-xl bg-slate-900 text-white shadow-sm">
            <ShieldCheck size={22} />
          </div>

          {isCheckingSession ? (
            <div className="flex items-center gap-2.5 py-8 text-xs font-medium text-slate-500" role="status">
              <LoaderCircle className="animate-spin text-slate-700" size={16} />
              Verifying administrative session…
            </div>
          ) : isAdmin ? (
            <div>
              <div className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700">
                <CheckCircle2 size={12} />
                Authenticated Admin
              </div>
              <h1 className="mt-3 text-xl font-bold tracking-tight text-slate-900">
                Welcome back
              </h1>
              <p className="mt-1 text-xs text-slate-500">
                Logged in as <span className="font-semibold text-slate-700">{adminEmail}</span>. You have permissions to update status and manage dispatch items.
              </p>

              <div className="mt-6 flex flex-col gap-2 sm:flex-row">
                <Link
                  href="/"
                  className="inline-flex h-10 flex-1 items-center justify-center rounded-xl bg-slate-900 text-xs font-semibold text-white transition hover:bg-slate-800"
                >
                  Manage Reports
                </Link>
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-slate-200 px-4 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
                >
                  <LogOut size={14} />
                  Sign Out
                </button>
              </div>
            </div>
          ) : (
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900">
                Administrator Sign In
              </h1>
              <p className="mt-1 text-xs text-slate-500">
                Sign in with authorized staff credentials to manage community reports.
              </p>

              <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Staff Email
                  </label>
                  <input
                    type="email"
                    required
                    autoComplete="username"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="staff@campus.edu"
                    className="mt-1.5 h-10 w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 text-xs text-slate-900 outline-none transition focus:border-slate-900 focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Password
                  </label>
                  <input
                    type="password"
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="mt-1.5 h-10 w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 text-xs text-slate-900 outline-none transition focus:border-slate-900 focus:bg-white"
                  />
                </div>

                {error && (
                  <div
                    className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-2.5 text-xs text-red-700"
                    role="alert"
                  >
                    <CircleAlert size={15} className="mt-0.5 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-slate-900 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
                >
                  {isSubmitting ? (
                    <LoaderCircle className="animate-spin" size={15} />
                  ) : null}
                  {isSubmitting ? "Authenticating…" : "Sign In to Dispatch"}
                </button>
              </form>
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200/80 py-4 text-center text-[11px] text-slate-400">
        CampusFix · Secure Administrative Portal
      </footer>
    </div>
  );
}
