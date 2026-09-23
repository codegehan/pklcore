"use client";

import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { db } from "../../../lib/firebase";

type EliminationRound = "64" | "32" | "16" | "quarter" | "semi" | "final";

type Category = {
  id: string;
  name: string;
  type: "single" | "double" | "roundrobin";
  topAdvance: number;
  bracketCount: number;
  startingRound: EliminationRound;
  pointsToWin: number;
  winByTwo: boolean;
  autoAssignCourtsOverride: boolean;
};

const defaultCategories: Category[] = [
  {
    id: "cat-1",
    name: "Open",
    type: "single",
    topAdvance: 1,
    bracketCount: 1,
    startingRound: "16",
    pointsToWin: 11,
    winByTwo: true,
    autoAssignCourtsOverride: true,
  },
];

export default function CreateTournament() {
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [courtsCount, setCourtsCount] = useState(3);
  const [autoAssignCourts, setAutoAssignCourts] = useState(true);
  const [enableThirdPlaceMatch, setEnableThirdPlaceMatch] = useState(true);
  const [categories, setCategories] = useState<Category[]>(defaultCategories);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const router = useRouter();

  function updateCategory(index: number, patch: Partial<Category>) {
    setCategories((current) =>
      current.map((category, categoryIndex) =>
        categoryIndex === index ? { ...category, ...patch } : category
      )
    );
  }

  function addCategory() {
    setCategories((current) => [
      ...current,
      {
        id: `cat-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        name: "New Category",
        type: "single",
        topAdvance: 1,
        bracketCount: 1,
        startingRound: "16",
        pointsToWin: 11,
        winByTwo: true,
        autoAssignCourtsOverride: autoAssignCourts,
      },
    ]);
  }

  function removeCategory(index: number) {
    setCategories((current) =>
      current.filter((_, categoryIndex) => categoryIndex !== index)
    );
  }

  async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!name.trim() || !location.trim()) {
      setError("Tournament name and location are required.");
      return;
    }

    if (!Number.isFinite(courtsCount) || courtsCount < 1) {
      setError("Please set at least 1 court for the tournament.");
      return;
    }

    if (categories.length === 0) {
      setError("Add at least one category.");
      return;
    }

    setIsSubmitting(true);

    try {
      const docRef = await addDoc(collection(db, "tournaments"), {
        name: name.trim(),
        location: location.trim(),
        courtsCount: Number(courtsCount),
        autoAssignCourts: Boolean(autoAssignCourts),
        enableThirdPlaceMatch: Boolean(enableThirdPlaceMatch),
        createdAt: serverTimestamp(),
      });

      for (const category of categories) {
        await addDoc(collection(db, "tournaments", docRef.id, "categories"), {
          name: category.name.trim() || "New Category",
          type: category.type,
          topAdvance: category.topAdvance,
          bracketCount: Math.max(1, Math.min(26, Number(category.bracketCount) || 1)),
          startingRound: category.startingRound,
          pointsToWin: category.pointsToWin,
          winByTwo: category.winByTwo,
          autoAssignCourtsOverride: category.autoAssignCourtsOverride,
          teamNames: [],
        });
      }

      router.push(`/organizer/tournament/${docRef.id}`);
    } catch (createError) {
      const message =
        createError instanceof Error
          ? createError.message
          : "Unable to create tournament.";
      setError(
        message.includes("apiKey") || message.includes("auth/")
          ? "Add Firebase environment variables before creating tournaments."
          : message
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#04130f] px-4 py-8 text-white md:px-8">
      <div className="mx-auto max-w-5xl">
        <header className="mb-8 flex flex-col gap-4 rounded-[28px] border border-slate-700 bg-slate-950/70 p-6 shadow-xl shadow-emerald-500/10 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-emerald-300">
              New Event
            </p>
            <h1 className="mt-2 text-3xl font-black text-white md:text-4xl">
              Create Tournament
            </h1>
          </div>

          <Link
            href="/organizer/dashboard"
            className="inline-flex items-center justify-center rounded-full border border-slate-600 bg-slate-900/70 px-5 py-3 text-sm font-medium text-slate-100 transition hover:border-slate-400"
          >
            Back to dashboard
          </Link>
        </header>

        <form
          onSubmit={handleCreate}
          className="space-y-8 rounded-[30px] border border-slate-700 bg-slate-950/70 p-5 md:p-8"
        >
          {/* General Tournament Configuration */}
          <div className="space-y-4">
            <h2 className="text-lg font-bold text-emerald-300 uppercase tracking-wider text-xs">
              General Info & Scheduling
            </h2>
            <div className="grid gap-5 md:grid-cols-3">
              <label className="block md:col-span-2">
                <span className="mb-2 block text-sm text-slate-300">
                  Tournament name
                </span>
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  className="w-full rounded-2xl border border-slate-700 bg-slate-900/80 px-4 py-3 text-base text-white outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20"
                  placeholder="Spring Smash Open"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm text-slate-300">
                  Available courts
                </span>
                <input
                  type="number"
                  min={1}
                  value={courtsCount}
                  onChange={(event) =>
                    setCourtsCount(Number(event.target.value) || 1)
                  }
                  className="w-full rounded-2xl border border-slate-700 bg-slate-900/80 px-4 py-3 text-base text-white outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20"
                />
              </label>

              <label className="block md:col-span-3">
                <span className="mb-2 block text-sm text-slate-300">Location</span>
                <input
                  value={location}
                  onChange={(event) => setLocation(event.target.value)}
                  className="w-full rounded-2xl border border-slate-700 bg-slate-900/80 px-4 py-3 text-base text-white outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20"
                  placeholder="Riverside Pickleball Club"
                />
              </label>
            </div>

            {/* Global Options */}
            <div className="grid gap-4 pt-2 md:grid-cols-2">
              {/* Auto Assign Toggle */}
              <div className="flex items-center justify-between rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
                <div>
                  <div className="text-sm font-semibold text-white">
                    Auto-Assign Courts
                  </div>
                  <div className="text-xs text-slate-400">
                    Automatically queue next available court when match finishes
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setAutoAssignCourts(!autoAssignCourts)}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    autoAssignCourts ? "bg-emerald-400" : "bg-slate-700"
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-slate-950 shadow ring-0 transition duration-200 ease-in-out ${
                      autoAssignCourts ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>

              {/* 3rd Place Match Toggle */}
              <div className="flex items-center justify-between rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
                <div>
                  <div className="text-sm font-semibold text-white">
                    3rd Place Playoff
                  </div>
                  <div className="text-xs text-slate-400">
                    Include bronze medal match for semi-final losers
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setEnableThirdPlaceMatch(!enableThirdPlaceMatch)
                  }
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    enableThirdPlaceMatch ? "bg-emerald-400" : "bg-slate-700"
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-slate-950 shadow ring-0 transition duration-200 ease-in-out ${
                      enableThirdPlaceMatch ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>

          {error ? (
            <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
              {error}
            </div>
          ) : null}

          {/* Categories Setup */}
          <div>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-bold text-white">Categories</h2>
              <button
                type="button"
                onClick={addCategory}
                className="rounded-full border border-emerald-400/40 bg-emerald-400/10 px-4 py-2 text-sm font-medium text-emerald-200 transition hover:bg-emerald-400/15"
              >
                + Add category
              </button>
            </div>

            <div className="space-y-5">
              {categories.map((category, index) => (
                <div
                  key={category.id}
                  className="rounded-3xl border border-slate-700 bg-slate-900/40 p-4 md:p-6 space-y-4"
                >
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                    {/* Name */}
                    <label className="block">
                      <span className="mb-2 block text-xs font-semibold text-slate-300 uppercase">
                        Category Name
                      </span>
                      <input
                        value={category.name}
                        onChange={(event) =>
                          updateCategory(index, { name: event.target.value })
                        }
                        className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-white outline-none transition focus:border-emerald-400"
                      />
                    </label>

                    {/* Format */}
                    <label className="block">
                      <span className="mb-2 block text-xs font-semibold text-slate-300 uppercase">
                        Format
                      </span>
                      <select
                        value={category.type}
                        onChange={(event) =>
                          updateCategory(index, {
                            type: event.target.value as Category["type"],
                          })
                        }
                        className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-white outline-none transition focus:border-emerald-400"
                      >
                        <option value="single">Single elimination</option>
                        <option value="double">Double elimination</option>
                        <option value="roundrobin">Round robin</option>
                      </select>
                    </label>

                    {/* Target Elimination Round */}
                    <label className="block">
                      <span className="mb-2 block text-xs font-semibold text-slate-300 uppercase">
                        Starting Round Stage
                      </span>
                      <select
                        value={category.startingRound}
                        onChange={(event) =>
                          updateCategory(index, {
                            startingRound: event.target.value as EliminationRound,
                          })
                        }
                        className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-white outline-none transition focus:border-emerald-400"
                      >
                        <option value="64">Round of 64</option>
                        <option value="32">Round of 32</option>
                        <option value="16">Round of 16</option>
                        <option value="quarter">Quarterfinals</option>
                        <option value="semi">Semifinals</option>
                        <option value="final">Finals</option>
                      </select>
                    </label>

                    {/* Target Score */}
                    <label className="block">
                      <span className="mb-2 block text-xs font-semibold text-slate-300 uppercase">
                        Points To Win
                      </span>
                      <select
                        value={category.pointsToWin}
                        onChange={(event) =>
                          updateCategory(index, {
                            pointsToWin: Number(event.target.value),
                          })
                        }
                        className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-white outline-none transition focus:border-emerald-400"
                      >
                        <option value={11}>11 Points</option>
                        <option value={15}>15 Points</option>
                        <option value={21}>21 Points</option>
                      </select>
                    </label>
                  </div>

                  {/* Secondary Parameters */}
                  <div className="grid gap-4 pt-2 md:grid-cols-3 border-t border-slate-800/80">
                    <label className="block">
                      <span className="mb-1 block text-xs text-slate-400">
                        Groups (Round Robin)
                      </span>
                      <input
                        type="number"
                        min={1}
                        max={26}
                        disabled={category.type !== "roundrobin"}
                        value={category.bracketCount}
                        onChange={(event) =>
                          updateCategory(index, {
                            bracketCount: Math.max(
                              1,
                              Math.min(26, Number(event.target.value) || 1)
                            ),
                          })
                        }
                        className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none disabled:opacity-40"
                      />
                    </label>

                    <label className="block">
                      <span className="mb-1 block text-xs text-slate-400">
                        Top Advance Per Group
                      </span>
                      <input
                        type="number"
                        min={1}
                        disabled={category.type !== "roundrobin"}
                        value={category.topAdvance}
                        onChange={(event) =>
                          updateCategory(index, {
                            topAdvance: Number(event.target.value) || 1,
                          })
                        }
                        className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none disabled:opacity-40"
                      />
                    </label>

                    <div className="flex items-center justify-between pt-4">
                      <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300">
                        <input
                          type="checkbox"
                          checked={category.winByTwo}
                          onChange={(e) =>
                            updateCategory(index, { winByTwo: e.target.checked })
                          }
                          className="rounded border-slate-700 bg-slate-950 text-emerald-400 focus:ring-0"
                        />
                        Win by 2 points
                      </label>

                      {categories.length > 1 ? (
                        <button
                          type="button"
                          onClick={() => removeCategory(index)}
                          className="text-xs text-rose-400 transition hover:text-rose-300"
                        >
                          Remove
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="inline-flex w-full md:w-auto items-center justify-center rounded-full bg-emerald-400 px-8 py-3.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isSubmitting ? "Creating Tournament..." : "Create Tournament"}
          </button>
        </form>
      </div>
    </div>
  );
}