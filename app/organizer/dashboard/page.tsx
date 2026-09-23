"use client";

import Link from "next/link";
import {
  collection,
  doc,
  getDocs,
  orderBy,
  query,
  writeBatch,
} from "firebase/firestore";
import { useEffect, useState } from "react";
import { db } from "../../../lib/firebase";

type Tournament = {
  id: string;
  name: string;
  location?: string;
  createdAt?: unknown;
};

// ==========================================
// RANDOM PAIRING GENERATOR MODAL COMPONENT
// ==========================================

function RandomPairingModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const [namesInput, setNamesInput] = useState<string>("");
  const [namesList, setNamesList] = useState<string[]>([]);
  
  // Group-based exclusions: array of sets/arrays of names that cannot pair with each other
  const [exclusionGroups, setExclusionGroups] = useState<string[][]>([]);
  const [selectedForGroup, setSelectedForGroup] = useState<string[]>([]);

  const [generatedPairs, setGeneratedPairs] = useState<[string, string][]>([]);
  const [unpairedPlayer, setUnpairedPlayer] = useState<string | null>(null);
  const [pairingError, setPairingError] = useState<string | null>(null);
  const [isShuffling, setIsShuffling] = useState<boolean>(false);

  // Parse names whenever text changes
  const handleParseNames = (text: string) => {
    setNamesInput(text);
    const parsed = text
      .split(/[\n,]+/)
      .map((n) => n.trim())
      .filter((n) => n.length > 0);

    const uniqueNames = Array.from(new Set(parsed));
    setNamesList(uniqueNames);

    // Filter out group members that no longer exist
    setExclusionGroups((prevGroups) =>
      prevGroups
        .map((group) => group.filter((name) => uniqueNames.includes(name)))
        .filter((group) => group.length >= 2)
    );
    setSelectedForGroup((prev) => prev.filter((name) => uniqueNames.includes(name)));
  };

  const togglePlayerForGroup = (name: string) => {
    setSelectedForGroup((prev) =>
      prev.includes(name) ? prev.filter((p) => p !== name) : [...prev, name]
    );
  };

  const handleAddExclusionGroup = () => {
    if (selectedForGroup.length < 2) {
      setPairingError("Please select at least 2 players to create a restriction group.");
      return;
    }

    setExclusionGroups((prev) => [...prev, selectedForGroup]);
    setSelectedForGroup([]);
    setPairingError(null);
  };

  const handleRemoveExclusionGroup = (index: number) => {
    setExclusionGroups((prev) => prev.filter((_, i) => i !== index));
  };

  // Check if two players are forbidden from pairing
  const isForbidden = (p1: string, p2: string) => {
    return exclusionGroups.some(
      (group) => group.includes(p1) && group.includes(p2)
    );
  };

  // Randomized Pairing Algorithm with Backtracking and Shuffle Loading State
  const generateRandomPairs = () => {
    setPairingError(null);
    setGeneratedPairs([]);
    setUnpairedPlayer(null);

    if (namesList.length < 2) {
      setPairingError("Please enter at least 2 names to generate pairings.");
      return;
    }

    setIsShuffling(true);

    setTimeout(() => {
      const shuffle = <T,>(array: T[]): T[] => {
        const arr = [...array];
        for (let i = arr.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
      };

      const pairs: [string, string][] = [];

      const solve = (remaining: string[]): boolean => {
        if (remaining.length === 0) return true;

        const first = remaining[0];
        const rest = remaining.slice(1);
        const shuffledRest = shuffle(rest);

        for (const partner of shuffledRest) {
          if (!isForbidden(first, partner)) {
            pairs.push([first, partner]);
            const nextRemaining = rest.filter((p) => p !== partner);
            if (solve(nextRemaining)) {
              return true;
            }
            pairs.pop(); // Backtrack
          }
        }
        return false;
      };

      let success = false;
      let pool = shuffle(namesList);
      let leftover: string | null = null;

      for (let attempt = 0; attempt < 25; attempt++) {
        pairs.length = 0;
        pool = shuffle(namesList);
        leftover = null;

        if (pool.length % 2 !== 0) {
          leftover = pool.pop()!;
        }

        if (solve(pool)) {
          success = true;
          break;
        }
      }

      if (!success) {
        setPairingError(
          "Could not generate valid pairings with the active restriction tags. Try removing or tweaking some group tags."
        );
      } else {
        setGeneratedPairs(pairs);
        setUnpairedPlayer(leftover);
      }

      setIsShuffling(false);
    }, 600);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full max-w-4xl rounded-3xl border border-slate-700/80 bg-slate-900 p-6 shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto text-white">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300">
              Randomizer Tool
            </p>
            <h2 className="text-2xl font-bold text-white mt-0.5">
              Random Pairing Generator
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-700 bg-slate-800 p-2 text-slate-400 hover:bg-slate-700 hover:text-white transition"
          >
            ✕
          </button>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Left Column - Inputs & Tagging */}
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Enter Names (separated by comma or newline)
              </label>
              <textarea
                rows={4}
                placeholder={`Player 1, Player 2, Player 3\nPlayer 4\nPlayer 5, Player 6`}
                value={namesInput}
                onChange={(e) => handleParseNames(e.target.value)}
                className="w-full rounded-xl border border-slate-700/80 bg-slate-950 p-3 text-xs text-white placeholder-slate-500 focus:border-emerald-400 focus:outline-none"
              />
              <div className="mt-1 flex justify-between text-[11px] text-slate-400">
                <span>Parsed Players: {namesList.length}</span>
                {namesList.length % 2 !== 0 && namesList.length > 0 && (
                  <span className="text-amber-400">Odd count (1 will stay solo)</span>
                )}
              </div>
            </div>

            {/* Tag Players that Cannot be Teammates */}
            {namesList.length >= 2 && (
              <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4 space-y-3">
                <div className="flex justify-between items-center">
                  <h4 className="text-xs font-bold text-emerald-300 uppercase tracking-wider">
                    Tag Cannot-Pair Group
                  </h4>
                  <span className="text-[10px] text-slate-400">
                    Selected: {selectedForGroup.length}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 leading-tight">
                  Click to tag multiple players who cannot be paired with each other (e.g. Player 1, 2, 3, 4, 5).
                </p>

                {/* Player Tag Chips */}
                <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto p-1 bg-slate-900/50 rounded-xl border border-slate-800">
                  {namesList.map((name) => {
                    const isSelected = selectedForGroup.includes(name);
                    return (
                      <button
                        key={name}
                        type="button"
                        onClick={() => togglePlayerForGroup(name)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition ${
                          isSelected
                            ? "bg-rose-500/20 border-rose-500/50 text-rose-300"
                            : "bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700"
                        }`}
                      >
                        {isSelected ? "⛔ " : "+ "}
                        {name}
                      </button>
                    );
                  })}
                </div>

                <button
                  type="button"
                  onClick={handleAddExclusionGroup}
                  disabled={selectedForGroup.length < 2}
                  className="w-full rounded-lg bg-slate-800 border border-slate-700 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-700 disabled:opacity-40 transition"
                >
                  Add Tagged Group Restriction
                </button>

                {/* Active Restriction Rules */}
                {exclusionGroups.length > 0 && (
                  <div className="space-y-1.5 pt-2 border-t border-slate-800/80">
                    <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
                      Active Restrictions
                    </span>
                    <div className="max-h-28 overflow-y-auto space-y-1 pr-1">
                      {exclusionGroups.map((group, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs border border-rose-500/20 text-rose-300"
                        >
                          <span className="truncate pr-2">
                            ⛔ Cannot Pair: <strong className="text-white">{group.join(", ")}</strong>
                          </span>
                          <button
                            type="button"
                            onClick={() => handleRemoveExclusionGroup(idx)}
                            className="text-rose-400 hover:text-rose-200 font-bold px-1"
                          >
                            &times;
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            <button
              type="button"
              onClick={generateRandomPairs}
              disabled={namesList.length < 2 || isShuffling}
              className="w-full rounded-xl bg-emerald-400 py-3 text-xs font-bold text-slate-950 hover:bg-emerald-300 disabled:opacity-50 transition active:scale-95 shadow-lg shadow-emerald-500/10 flex items-center justify-center gap-2"
            >
              {isShuffling ? (
                <>
                  <svg
                    className="h-4 w-4 animate-spin text-slate-950"
                    viewBox="0 0 24 24"
                    fill="none"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                  </svg>
                  <span>Shuffling &amp; Pairing...</span>
                </>
              ) : (
                <span>🎲 Generate Random Pairings</span>
              )}
            </button>
          </div>

          {/* Right Column - Results */}
          <div className="flex flex-col justify-between rounded-2xl border border-slate-800 bg-slate-950/60 p-4 space-y-4">
            <div>
              <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider border-b border-slate-800 pb-2">
                Generated Pairings ({generatedPairs.length})
              </h3>

              {pairingError && (
                <div className="mt-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
                  {pairingError}
                </div>
              )}

              {isShuffling ? (
                <div className="py-16 flex flex-col items-center justify-center space-y-3">
                  <div className="relative flex h-10 w-10 items-center justify-center">
                    <div className="absolute h-full w-full animate-ping rounded-full bg-emerald-400/20" />
                    <span className="animate-spin text-2xl">🎲</span>
                  </div>
                  <p className="text-xs font-medium text-emerald-300 animate-pulse">
                    Shuffling teams...
                  </p>
                </div>
              ) : generatedPairs.length === 0 && !pairingError ? (
                <div className="py-16 text-center text-xs text-slate-500 italic">
                  Enter names and click "Generate Random Pairings" to see results.
                </div>
              ) : (
                <div className="mt-3 space-y-2 max-h-80 overflow-y-auto pr-1">
                  {generatedPairs.map(([p1, p2], idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between rounded-xl bg-slate-900 border border-slate-800 p-2.5 text-xs text-slate-200 animate-in fade-in slide-in-from-bottom-2 duration-300"
                      style={{ animationDelay: `${idx * 60}ms` }}
                    >
                      <span className="font-semibold text-emerald-400">Team {idx + 1}</span>
                      <span className="font-medium text-white">
                        {p1} <span className="text-slate-500">&amp;</span> {p2}
                      </span>
                    </div>
                  ))}

                  {unpairedPlayer && (
                    <div
                      className="rounded-xl bg-amber-500/10 border border-amber-500/30 p-2.5 text-xs text-amber-300 flex justify-between items-center animate-in fade-in slide-in-from-bottom-2 duration-300"
                      style={{ animationDelay: `${generatedPairs.length * 60}ms` }}
                    >
                      <span className="font-semibold">Unpaired (Solo)</span>
                      <span className="font-medium">{unpairedPlayer}</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {generatedPairs.length > 0 && !isShuffling && (
              <div className="pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    const formatted = generatedPairs
                      .map(([p1, p2]) => `${p1} / ${p2}`)
                      .join("\n");
                    navigator.clipboard.writeText(formatted);
                    alert("Copied formatted pairs to clipboard!");
                  }}
                  className="w-full rounded-xl bg-slate-800 hover:bg-slate-700 text-emerald-300 text-xs font-semibold py-2 transition"
                >
                  📋 Copy Formatted Teams List
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// MAIN DASHBOARD COMPONENT
// ==========================================

export default function Dashboard() {
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [tournamentToDelete, setTournamentToDelete] = useState<Tournament | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPairingModalOpen, setIsPairingModalOpen] = useState<boolean>(false);

  async function loadTournaments() {
    setIsLoading(true);
    try {
      const q = query(
        collection(db, "tournaments"),
        orderBy("createdAt", "desc" as any)
      );
      const snap = await getDocs(q);
      setTournaments(
        snap.docs.map((docItem) => ({
          id: docItem.id,
          ...(docItem.data() as any),
        }))
      );
      setError(null);
    } catch (loadError) {
      const message =
        loadError instanceof Error
          ? loadError.message
          : "Unable to load tournaments.";
      setError(
        message.includes("auth/") || message.includes("apiKey")
          ? "Add your Firebase environment variables to load organizer data."
          : message
      );
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadTournaments();
  }, []);

  async function confirmDeleteTournament() {
    if (!tournamentToDelete) return;
    const tournamentId = tournamentToDelete.id;

    setDeletingId(tournamentId);

    try {
      const categorySnapshot = await getDocs(
        collection(db, "tournaments", tournamentId, "categories")
      );
      const batch = writeBatch(db);

      for (const categoryDoc of categorySnapshot.docs) {
        const categoryMatches = await getDocs(
          collection(
            db,
            "tournaments",
            tournamentId,
            "categories",
            categoryDoc.id,
            "matches"
          )
        );

        for (const matchDoc of categoryMatches.docs) {
          batch.delete(
            doc(
              db,
              "tournaments",
              tournamentId,
              "categories",
              categoryDoc.id,
              "matches",
              matchDoc.id
            )
          );
        }

        batch.delete(
          doc(db, "tournaments", tournamentId, "categories", categoryDoc.id)
        );
      }

      batch.delete(doc(db, "tournaments", tournamentId));
      await batch.commit();
      setTournamentToDelete(null);
      await loadTournaments();
    } catch (deleteError) {
      const message =
        deleteError instanceof Error
          ? deleteError.message
          : "Unable to delete tournament.";
      setError(
        message.includes("auth/") || message.includes("apiKey")
          ? "Add your Firebase environment variables to delete a tournament."
          : message
      );
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="min-h-screen bg-[#04130f] px-4 py-8 text-white md:px-8">
      <div className="mx-auto max-w-6xl space-y-8">
        {/* Header */}
        <header className="flex flex-col gap-4 rounded-3xl border border-slate-700/80 bg-slate-950/70 p-6 shadow-xl shadow-emerald-500/10 backdrop-blur-md md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-emerald-300">
              Organizer Panel
            </p>
            <h1 className="mt-1 text-3xl font-black text-white md:text-4xl">
              Tournament Dashboard
            </h1>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setIsPairingModalOpen(true)}
              className="inline-flex items-center justify-center rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-3 text-sm font-semibold text-emerald-300 transition hover:bg-emerald-400/20 active:scale-95"
            >
              🎲 Random Pairings Generator
            </button>

            <Link
              href="/organizer/create"
              className="inline-flex items-center justify-center rounded-xl bg-emerald-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300 active:scale-95"
            >
              + Create Tournament
            </Link>
          </div>
        </header>

        {/* Overview Stats */}
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            {
              label: "Live Events",
              value: isLoading ? "..." : tournaments.length.toString(),
            },
            { label: "Schedules", value: "Ready" },
            { label: "Courts", value: "Flexible" },
            { label: "Status", value: "Online" },
          ].map((item) => (
            <div
              key={item.label}
              className="rounded-2xl border border-slate-700/60 bg-slate-950/55 p-5 backdrop-blur-sm"
            >
              <div className="text-xs font-medium uppercase tracking-[0.2em] text-slate-400">
                {item.label}
              </div>
              <div className="mt-2 text-2xl font-bold text-white">{item.value}</div>
            </div>
          ))}
        </section>

        {/* Error Notification */}
        {error ? (
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">
            {error}
          </div>
        ) : null}

        {/* Main Tournaments Section */}
        <section className="rounded-3xl border border-slate-700/80 bg-slate-950/65 p-5 md:p-6 backdrop-blur-md">
          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-xl font-bold text-white">Your Tournaments</h2>
            <span className="text-sm font-medium text-slate-400">
              {isLoading ? "Loading..." : `${tournaments.length} total`}
            </span>
          </div>

          {isLoading ? (
            /* Skeleton Loading State */
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {[1, 2, 3].map((key) => (
                <div
                  key={key}
                  className="animate-pulse rounded-2xl border border-slate-800 bg-slate-900/60 p-5 space-y-4"
                >
                  <div className="flex justify-between items-center">
                    <div className="h-3 w-1/4 rounded bg-slate-800" />
                    <div className="h-5 w-16 rounded-full bg-slate-800" />
                  </div>
                  <div className="h-6 w-3/4 rounded bg-slate-800" />
                  <div className="space-y-2 pt-2">
                    <div className="h-3 w-full rounded bg-slate-800" />
                    <div className="h-3 w-full rounded bg-slate-800" />
                  </div>
                  <div className="flex justify-between items-center pt-3 border-t border-slate-800/80">
                    <div className="h-8 w-24 rounded-lg bg-slate-800" />
                    <div className="h-8 w-8 rounded-lg bg-slate-800" />
                  </div>
                </div>
              ))}
            </div>
          ) : tournaments.length === 0 ? (
            /* Empty State */
            <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-900/40 p-12 text-center">
              <p className="text-lg font-semibold text-white">No tournaments yet</p>
              <p className="mt-1 text-sm text-slate-400">
                Create your first event to start managing brackets, teams, and matches.
              </p>
            </div>
          ) : (
            /* Tournament Cards Grid */
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {tournaments.map((tournament) => (
                <div
                  key={tournament.id}
                  className="flex flex-col justify-between rounded-2xl border border-slate-700/80 bg-gradient-to-br from-slate-900 to-slate-950 p-5 transition hover:border-emerald-400/40 hover:shadow-lg hover:shadow-emerald-500/10"
                >
                  <div>
                    <div className="flex items-start justify-between gap-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300">
                        Event
                      </p>
                      <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.2em] text-emerald-200">
                        Active
                      </span>
                    </div>

                    <h3 className="mt-2 text-xl font-bold text-white leading-tight">
                      {tournament.name}
                    </h3>

                    <div className="mt-5 space-y-2 text-sm text-slate-300">
                      <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                        <span className="text-slate-400">Location</span>
                        <span className="font-medium text-slate-200">
                          {tournament.location || "TBD"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                        <span className="text-slate-400">Format</span>
                        <span className="font-medium text-slate-200">
                          Bracket + Play
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Actions Bar */}
                  <div className="mt-6 flex items-center justify-between gap-2 border-t border-slate-800/80 pt-4">
                    <Link
                      href={`/organizer/tournament/${tournament.id}`}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-slate-800 px-3.5 py-2 text-xs font-semibold text-emerald-300 transition hover:bg-emerald-400 hover:text-slate-950"
                    >
                      <span>Manage Event</span>
                      <svg
                        className="h-3.5 w-3.5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2.5}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3"
                        />
                      </svg>
                    </Link>

                    <button
                      type="button"
                      title="Remove tournament"
                      onClick={() => setTournamentToDelete(tournament)}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-rose-500/20 bg-rose-500/10 text-rose-300 transition hover:border-rose-500/40 hover:bg-rose-500/20"
                    >
                      <svg
                        className="h-4 w-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
                        />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* PAIRING RANDOMIZER MODAL */}
      <RandomPairingModal
        isOpen={isPairingModalOpen}
        onClose={() => setIsPairingModalOpen(false)}
      />

      {/* Delete Confirmation Modal */}
      {tournamentToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl shadow-rose-950/20 space-y-5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-500/10 text-rose-400 border border-rose-500/20">
                <svg
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
                  />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Delete Tournament</h3>
                <p className="text-xs text-slate-400">This action cannot be undone.</p>
              </div>
            </div>

            <p className="text-sm text-slate-300 leading-relaxed">
              Are you sure you want to delete <span className="font-semibold text-white">"{tournamentToDelete.name}"</span>? All associated category data, brackets, and match histories will be permanently removed.
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                disabled={Boolean(deletingId)}
                onClick={() => setTournamentToDelete(null)}
                className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-2.5 text-xs font-semibold text-slate-300 transition hover:bg-slate-700 hover:text-white disabled:opacity-50"
              >
                Cancel
              </button>

              <button
                type="button"
                disabled={Boolean(deletingId)}
                onClick={() => void confirmDeleteTournament()}
                className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-rose-500 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {deletingId ? (
                  <>
                    <svg
                      className="h-3.5 w-3.5 animate-spin text-white"
                      viewBox="0 0 24 24"
                      fill="none"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                      />
                    </svg>
                    Deleting...
                  </>
                ) : (
                  "Delete Tournament"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}