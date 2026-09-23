"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { signInWithEmailAndPassword } from "firebase/auth";
import { useState } from "react";
import { auth } from "../lib/firebase";

const featureCards = [
  {
    title: "Tournament control center",
    description:
      "Create brackets, assign courts, manage registrations, and publish draw updates from one streamlined dashboard.",
  },
  {
    title: "Live match operations",
    description:
      "Track scores, manage match flow, and keep players and staff aligned with a clear event timeline.",
  },
  {
    title: "Club-ready reporting",
    description:
      "Monitor attendance, standings, and tournament metrics so staff can make smarter decisions in real time.",
  },
];

const stats = [
  { value: "100%", label: "event visibility" },
  { value: "24/7", label: "organizer access" },
  { value: "4-step", label: "registration flow" },
  { value: "1 platform", label: "for everything" },
];

export default function HomePage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

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
          ? "Organizer login is not configured yet. Add your Firebase credentials to enable sign-in."
          : message,
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen text-white">
      <header className="mx-auto flex w-full max-w-7xl items-center justify-between px-6 py-6 lg:px-10">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-400/20 text-lg font-bold text-emerald-300 ring-1 ring-emerald-400/30">
            P
          </div>
          <div>
            <p className="text-lg font-semibold tracking-[0.22em] text-emerald-300">PKL CORE</p>
          </div>
        </div>

        <div className="hidden items-center gap-8 text-sm text-slate-200 md:flex">
          <Link href="#features">Features</Link>
          <Link href="#workflow">Workflow</Link>
          <Link href="#about">About</Link>
        </div>

        <Link
          href="/organizer"
          className="inline-flex items-center justify-center rounded-full border border-emerald-400/40 bg-emerald-400/10 px-4 py-2 text-sm font-medium text-emerald-200 transition hover:border-emerald-300 hover:bg-emerald-400/20"
        >
          Organizer login
        </Link>
      </header>

      <main className="mx-auto w-full max-w-7xl px-6 pb-20 pt-10 lg:px-10">
        <section className="grid gap-10 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
          <div>
            <div className="mb-6 inline-flex items-center rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.2em] text-emerald-200">
              tournament operations platform
            </div>

            <h1 className="max-w-xl text-5xl font-black leading-none tracking-tight text-white md:text-6xl">
              Run better pickleball events from one control center.
            </h1>

            <p className="mt-6 max-w-xl text-lg leading-8 text-slate-300">
              PKL Core is a modern tournament manager built for clubs, leagues, and community organizers who need a cleaner way to manage registrations, brackets, court flow, and match results without spreadsheet chaos.
            </p>

            <div className="mt-8 flex flex-wrap gap-4">
              <Link
                href="/organizer"
                className="rounded-full bg-emerald-400 px-6 py-3 text-sm font-semibold text-slate-950 shadow-lg shadow-emerald-400/30 transition hover:scale-[1.02]"
              >
                Open organizer login
              </Link>
              <Link
                href="#features"
                className="rounded-full border border-slate-600 bg-slate-900/60 px-6 py-3 text-sm font-semibold text-slate-100 transition hover:border-slate-400"
              >
                Explore features
              </Link>
            </div>

            <div className="mt-10 grid max-w-xl gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {stats.map((stat) => (
                <div key={stat.label} className="rounded-2xl border border-slate-700/70 bg-slate-950/45 p-4">
                  <div className="text-2xl font-bold text-emerald-300">{stat.value}</div>
                  <div className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-400">{stat.label}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[28px] border border-slate-700/80 bg-slate-950/70 p-6 shadow-2xl shadow-emerald-500/10 backdrop-blur-sm">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-slate-400">event access</p>
                <h2 className="mt-2 text-2xl font-bold text-white">Welcome back</h2>
              </div>
              <div className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-200">
                Secure login
              </div>
            </div>

            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label htmlFor="email" className="mb-2 block text-sm text-slate-300">
                  Email address
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="w-full rounded-2xl border border-slate-700 bg-slate-900/80 px-4 py-3 text-base text-white outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/30"
                  placeholder="organizer@club.com"
                  autoComplete="email"
                />
              </div>

              <div>
                <label htmlFor="password" className="mb-2 block text-sm text-slate-300">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="w-full rounded-2xl border border-slate-700 bg-slate-900/80 px-4 py-3 text-base text-white outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/30"
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
                {isSubmitting ? "Signing in..." : "Sign in to dashboard"}
              </button>
            </form>

            <div className="mt-5 flex items-center justify-between gap-3 text-xs text-slate-400">
              <span>Need help getting started?</span>
              <Link href="/organizer" className="font-medium text-emerald-300">
                Use organizer portal
              </Link>
            </div>
          </div>
        </section>

        <section id="features" className="mt-24">
          <div className="mb-10 max-w-2xl">
            <p className="text-xs uppercase tracking-[0.24em] text-emerald-300">why teams choose pkl core</p>
            <h2 className="mt-3 text-3xl font-bold text-white md:text-4xl">Purpose-built for modern pickleball tournaments</h2>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            {featureCards.map((feature) => (
              <div key={feature.title} className="rounded-3xl border border-slate-700/80 bg-slate-950/35 p-6">
                <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-400/15 text-xl text-emerald-300 ring-1 ring-emerald-400/20">
                  ✦
                </div>
                <h3 className="text-xl font-semibold text-white">{feature.title}</h3>
                <p className="mt-3 text-base leading-7 text-slate-300">{feature.description}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="workflow" className="mt-24 rounded-[32px] border border-slate-700/80 bg-slate-950/40 p-8 md:p-10">
          <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-emerald-300">how it works</p>
              <h2 className="mt-3 text-3xl font-bold text-white md:text-4xl">From registration to podium in a few simple steps</h2>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              {[
                ["01", "Create tournament", "Set event details, format, start times, and number of divisions."],
                ["02", "Manage entries", "Capture teams, player data, and waitlist activity with a clear registration flow."],
                ["03", "Run the event", "Update brackets, score matches, and publish standings from your live dashboard."],
              ].map(([step, title, description]) => (
                <div key={step} className="rounded-3xl border border-slate-700 bg-slate-900/60 p-5">
                  <div className="text-sm font-bold uppercase tracking-[0.2em] text-emerald-300">{step}</div>
                  <h3 className="mt-4 text-lg font-semibold text-white">{title}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-300">{description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="about" className="mt-24 pb-10">
          <div className="rounded-[30px] border border-emerald-400/20 bg-gradient-to-r from-emerald-500/10 via-slate-950/80 to-sky-500/10 p-8 md:p-10">
            <p className="text-xs uppercase tracking-[0.24em] text-emerald-300">about pkl core</p>
            <h2 className="mt-3 max-w-3xl text-3xl font-bold text-white md:text-4xl">
              PKL Core gives organizing teams a cleaner way to manage the full tournament lifecycle.
            </h2>
            <p className="mt-5 max-w-3xl text-lg leading-8 text-slate-300">
              Whether you are running a local club event, a league weekend, or a multi-division tournament, the system keeps registration details, match operations, and reporting in one shareable workspace.
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}
