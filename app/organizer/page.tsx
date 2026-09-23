"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { signInWithEmailAndPassword } from "firebase/auth";
import { useState } from "react";
import { auth } from "../../lib/firebase";

export default function OrganizerLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const router = useRouter();

  async function handleLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!email.trim() || !password.trim()) {
      setError("Enter your email and password to continue.");
      return;
    }

    setIsSubmitting(true);

    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
      router.push("/organizer/dashboard");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unable to sign in with the provided credentials.";

      setError(
        message.includes("auth/")
          ? "Organizer login is not configured yet. Add your Firebase credentials in the environment file and try again."
          : message,
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#04130f] px-4 py-10 text-white">
      <div className="grid w-full max-w-6xl overflow-hidden rounded-[30px] border border-slate-700 bg-slate-950/70 shadow-2xl shadow-emerald-500/10 backdrop-blur-md lg:grid-cols-2">
        <div className="flex flex-col justify-between bg-linear-to-br from-emerald-500/15 via-slate-950 to-slate-950 p-8 md:p-10">
          <div>
            <Link href="/" className="inline-flex items-center gap-3 text-sm font-medium text-emerald-200">
              <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-emerald-400/15 text-lg ring-1 ring-emerald-400/20">
                P
              </span>
              Return to PKL Core
            </Link>

            <h1 className="mt-10 text-4xl font-black tracking-tight text-white md:text-5xl">
              Control your tournament operations with confidence.
            </h1>
            <p className="mt-4 max-w-md text-base leading-7 text-slate-300">
              Manage registrations, assign courts, monitor live games, and keep your pickleball players informed from the same system.
            </p>
          </div>

          <div className="mt-10 rounded-3xl border border-slate-700/80 bg-slate-900/60 p-5">
            <p className="text-xs uppercase tracking-[0.22em] text-emerald-300">platform overview</p>
            <ul className="mt-4 space-y-3 text-sm text-slate-200">
              <li>• Tournament creation and bracket setup</li>
              <li>• Team entries, waitlists, and player tracking</li>
              <li>• Match updates, standings, and reporting tools</li>
            </ul>
          </div>
        </div>

        <div className="flex items-center justify-center p-6 md:p-10">
          <div className="w-full max-w-md rounded-[26px] border border-slate-700 bg-slate-900/70 p-6 shadow-xl shadow-slate-950/60">
            <div className="mb-6">
              <p className="text-xs uppercase tracking-[0.22em] text-emerald-300">organizer login</p>
              <h2 className="mt-2 text-3xl font-bold text-white">Welcome back</h2>
            </div>

            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label htmlFor="organizer-email" className="mb-2 block text-sm text-slate-300">
                  Email
                </label>
                <input
                  id="organizer-email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-base text-white outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20"
                  placeholder="organizer@club.com"
                  autoComplete="email"
                />
              </div>

              <div>
                <label htmlFor="organizer-password" className="mb-2 block text-sm text-slate-300">
                  Password
                </label>
                <input
                  id="organizer-password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-base text-white outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20"
                  placeholder="••••••••"
                  autoComplete="current-password"
                />
              </div>

              {error ? (
                <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                  {error}
                </div>
              ) : null}

              <button
                type="submit"
                disabled={isSubmitting}
                className="flex w-full items-center justify-center rounded-2xl bg-emerald-400 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isSubmitting ? "Signing in..." : "Sign in"}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
