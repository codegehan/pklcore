"use client";

import React, { useState, useEffect } from "react";
import { useParams, useSearchParams } from "next/navigation";
import {
  collection,
  getDocs,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

export interface Group {
  name: string;
  teams: string[];
}

export interface Match {
  id?: string;
  categoryId?: string;
  categoryName?: string;
  group?: string;
  stageName?: string;
  roundIndex?: number;
  matchIndex?: number;
  teamA: string;
  teamB: string;
  scoreA: number | null;
  scoreB: number | null;
  court: number | null;
  slot: number | null;
  isComplete: boolean;
}

export interface Category {
  id: string;
  name: string;
  type?: "single" | "double" | "roundrobin";
  teamNames?: string[];
  bracketCount?: number;
  topAdvance?: number;
  knockoutStart?: string;
  matchupStrategy?: "cross" | "adjacent";
  bracketGroups?: { name: string; members: string[] }[];
}

export interface Tournament {
  id: string;
  name: string;
  courtsCount?: number;
}

export interface TeamStanding {
  team: string;
  group: string;
  played: number;
  won: number;
  lost: number;
  drawn: number;
  pointsFor: number;
  pointsAgainst: number;
  diff: number;
  points: number;
}

function calculateStandings(
  groups: { name: string; members: string[] }[],
  rrMatches: Match[]
): Record<string, TeamStanding[]> {
  const standings: Record<string, TeamStanding[]> = {};

  groups.forEach((g) => {
    const teamMap: Record<string, TeamStanding> = {};

    g.members.forEach((team) => {
      teamMap[team] = {
        team,
        group: g.name,
        played: 0,
        won: 0,
        lost: 0,
        drawn: 0,
        pointsFor: 0,
        pointsAgainst: 0,
        diff: 0,
        points: 0,
      };
    });

    rrMatches
      .filter((m) => m.group === g.name && m.isComplete)
      .forEach((m) => {
        const sA = m.scoreA ?? 0;
        const sB = m.scoreB ?? 0;

        if (teamMap[m.teamA] && teamMap[m.teamB]) {
          const tA = teamMap[m.teamA];
          const tB = teamMap[m.teamB];

          tA.played += 1;
          tB.played += 1;

          tA.pointsFor += sA;
          tA.pointsAgainst += sB;
          tB.pointsFor += sB;
          tB.pointsAgainst += sA;

          if (sA > sB) {
            tA.won += 1;
            tA.points += 3;
            tB.lost += 1;
          } else if (sB > sA) {
            tB.won += 1;
            tB.points += 3;
            tA.lost += 1;
          } else {
            tA.drawn += 1;
            tB.drawn += 1;
            tA.points += 1;
            tB.points += 1;
          }

          tA.diff = tA.pointsFor - tA.pointsAgainst;
          tB.diff = tB.pointsFor - tB.pointsAgainst;
        }
      });

    standings[g.name] = Object.values(teamMap).sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if (b.diff !== a.diff) return b.diff - a.diff;
      return b.pointsFor - a.pointsFor;
    });
  });

  return standings;
}

export default function PublicTournamentViewPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const key = params?.key as string;

  const initialTab =
    (searchParams?.get("tab") as "brackets" | "standings" | "matches") || "standings";

  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [matches, setMatches] = useState<Record<string, Match[]>>({});
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<"brackets" | "standings" | "matches">(initialTab);
  const [activeMatchStage, setActiveMatchStage] = useState<string>("Round Robin");
  const [activeStandingsCatId, setActiveStandingsCatId] = useState<string>("");

  useEffect(() => {
    if (!key) return;

    let unsubCategories: (() => void) | null = null;
    const unsubMatchListeners: Record<string, () => void> = {};

    async function initPublicView() {
      setLoading(true);
      try {
        const tournamentQuery = query(
          collection(db, "tournaments"),
          where("publicViewKey", "==", key)
        );

        const tournamentSnap = await getDocs(tournamentQuery);
        if (tournamentSnap.empty) {
          setError("Tournament not found.");
          setLoading(false);
          return;
        }

        const tDoc = tournamentSnap.docs[0];
        const tournamentId = tDoc.id;

        setTournament({ id: tournamentId, ...tDoc.data() } as Tournament);

        unsubCategories = onSnapshot(
          collection(db, "tournaments", tournamentId, "categories"),
          (catSnap) => {
            const loadedCategories: Category[] = [];

            catSnap.docs.forEach((catDoc) => {
              const catData = { id: catDoc.id, ...catDoc.data() } as Category;
              loadedCategories.push(catData);

              if (!unsubMatchListeners[catDoc.id]) {
                unsubMatchListeners[catDoc.id] = onSnapshot(
                  collection(db, "tournaments", tournamentId, "categories", catDoc.id, "matches"),
                  (mSnap) => {
                    const catMatches = mSnap.docs.map((m) => {
                      const data = m.data() as Match;
                      return {
                        id: m.id,
                        categoryId: catDoc.id,
                        categoryName: catData.name,
                        ...data,
                      };
                    });

                    setMatches((prev) => ({
                      ...prev,
                      [catDoc.id]: catMatches,
                    }));
                  }
                );
              }
            });

            setCategories(loadedCategories);
            if (loadedCategories.length > 0 && !activeStandingsCatId) {
              setActiveStandingsCatId(loadedCategories[0].id);
            }
            setLoading(false);
          },
          () => {
            setError("Failed to fetch updates.");
            setLoading(false);
          }
        );
      } catch {
        setError("Error loading tournament details.");
        setLoading(false);
      }
    }

    initPublicView();

    return () => {
      if (unsubCategories) unsubCategories();
      Object.values(unsubMatchListeners).forEach((unsub) => unsub());
    };
  }, [key]);

  useEffect(() => {
    if (categories.length > 0 && !activeStandingsCatId) {
      setActiveStandingsCatId(categories[0].id);
    }
  }, [categories, activeStandingsCatId]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-white">
        <p className="animate-pulse text-sm font-medium text-slate-400">Loading Live Tournament...</p>
      </div>
    );
  }

  if (error || !tournament) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 text-white p-4">
        <p className="text-rose-400 font-bold mb-2">{error || "Tournament Unavailable"}</p>
        <p className="text-xs text-slate-500">Please check the link and try again.</p>
      </div>
    );
  }

  const allTournamentMatches: Match[] = Object.values(matches)
    .flat()
    .filter((m) => {
      const isTeamATBD =
        !m.teamA ||
        m.teamA === "TBD" ||
        m.teamA.toLowerCase().includes("1st ") ||
        m.teamA.toLowerCase().includes("2nd ");
      const isTeamBTBD =
        !m.teamB ||
        m.teamB === "TBD" ||
        m.teamB.toLowerCase().includes("1st ") ||
        m.teamB.toLowerCase().includes("2nd ");
      return !isTeamATBD && !isTeamBTBD;
    })
    .sort((a, b) => {
      if (a.isComplete !== b.isComplete) return a.isComplete ? 1 : -1;
      if ((a.slot ?? 0) !== (b.slot ?? 0)) return (a.slot ?? 0) - (b.slot ?? 0);
      return (a.court ?? 0) - (b.court ?? 0);
    });

  const knockoutStageNames: string[] = [];
  allTournamentMatches.forEach((m) => {
    if (m.stageName && !knockoutStageNames.includes(m.stageName)) {
      knockoutStageNames.push(m.stageName);
    }
  });

  const matchStageTabs = ["Round Robin", ...knockoutStageNames];

  const displayedMatches = allTournamentMatches.filter((m) => {
    if (activeMatchStage === "Round Robin") return Boolean(m.group);
    return m.stageName?.toLowerCase() === activeMatchStage.toLowerCase();
  });

  const courtsCount = tournament.courtsCount || 4;
  const courtsArray = Array.from({ length: courtsCount }, (_, i) => i + 1);

  const currentCourtMatches: Record<number, Match | undefined> = {};
  courtsArray.forEach((courtNum) => {
    const pendingCourtMatches = allTournamentMatches.filter(
      (m) => m.court === courtNum && !m.isComplete
    );
    if (pendingCourtMatches.length > 0) {
      pendingCourtMatches.sort((a, b) => (a.slot ?? 0) - (b.slot ?? 0));
      currentCourtMatches[courtNum] = pendingCourtMatches[0];
    }
  });

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-6">
      <header className="mb-6 flex flex-col md:flex-row md:items-center md:justify-between border-b border-slate-800 pb-4 gap-4">
        <div>
          <span className="text-[10px] uppercase font-bold tracking-widest text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
            Public Live Viewer
          </span>
          <h1 className="text-2xl md:text-3xl font-bold text-white mt-1">{tournament.name}</h1>
        </div>

        <nav className="flex items-center gap-2">
          {(["standings", "brackets", "matches"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-1.5 text-xs md:text-sm font-medium rounded-lg capitalize transition ${
                activeTab === tab
                  ? "bg-emerald-500 text-slate-950 font-semibold"
                  : "bg-slate-900 text-slate-300 hover:bg-slate-800"
              }`}
            >
              {tab}
            </button>
          ))}
        </nav>
      </header>

      <section className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
            Courts Live Status
          </h2>
          <span className="text-xs text-slate-400">Real-time match updates</span>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {courtsArray.map((courtNum) => {
            const activeMatch = currentCourtMatches[courtNum];

            return (
              <div
                key={courtNum}
                className={`rounded-xl border p-4 transition-all ${
                  activeMatch
                    ? "bg-slate-900 border-emerald-500/40 shadow-lg shadow-emerald-950/20"
                    : "bg-slate-900/40 border-slate-800/80"
                }`}
              >
                <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-3">
                  <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider">
                    Court {courtNum}
                  </span>
                  {activeMatch ? (
                    <span className="text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full">
                      Slot {activeMatch.slot ?? 1}
                    </span>
                  ) : (
                    <span className="text-[10px] text-slate-500">Available</span>
                  )}
                </div>

                {activeMatch ? (
                  <div className="space-y-2">
                    <p className="text-[10px] text-slate-400 uppercase font-medium">
                      {activeMatch.categoryName || "Category"} &bull; {activeMatch.group || activeMatch.stageName}
                    </p>

                    <div className="flex items-center justify-between bg-slate-950 px-3 py-2 rounded-lg border border-slate-800 text-xs font-semibold text-white">
                      <span className="truncate">{activeMatch.teamA}</span>
                      <span className="text-emerald-400 font-mono">{activeMatch.scoreA ?? "0"}</span>
                    </div>

                    <div className="text-center text-[10px] font-bold text-slate-500 my-0.5">VS</div>

                    <div className="flex items-center justify-between bg-slate-950 px-3 py-2 rounded-lg border border-slate-800 text-xs font-semibold text-white">
                      <span className="truncate">{activeMatch.teamB}</span>
                      <span className="text-emerald-400 font-mono">{activeMatch.scoreB ?? "0"}</span>
                    </div>
                  </div>
                ) : (
                  <div className="py-6 text-center text-xs text-slate-500 italic">
                    No active match
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {activeTab === "matches" && (
        <section className="space-y-4">
          <div className="border-b border-slate-800 pb-3 flex flex-col md:flex-row md:items-center justify-between gap-3">
            <h2 className="text-lg font-bold text-white">Schedule & Scores</h2>

            <div className="flex flex-wrap items-center gap-2">
              {matchStageTabs.map((stage) => (
                <button
                  key={stage}
                  onClick={() => setActiveMatchStage(stage)}
                  className={`px-3 py-1.5 text-xs rounded-lg font-semibold transition ${
                    activeMatchStage === stage
                      ? "bg-emerald-500 text-slate-950 font-bold shadow"
                      : "bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800"
                  }`}
                >
                  {stage}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {displayedMatches.map((m) => (
              <div
                key={`${m.categoryId}_${m.id}`}
                className={`rounded-xl border p-3 space-y-3 transition ${
                  m.isComplete ? "bg-slate-900/30 border-slate-800/80" : "bg-slate-900/90 border-slate-700/80"
                }`}
              >
                <div className="flex items-center justify-between text-[11px] font-semibold text-slate-400 border-b border-slate-800 pb-2">
                  <span className="text-emerald-400">
                    Court {m.court ?? 1} &bull; Slot {m.slot ?? 1}
                  </span>
                  <span className="text-slate-400 truncate max-w-[120px]">
                    {m.group || m.stageName || m.categoryName}
                  </span>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs font-semibold">
                    <span className="text-slate-100 truncate flex-1 pr-2">{m.teamA}</span>
                    <span className="w-10 text-center bg-slate-950 border border-slate-800 py-1 rounded text-emerald-400 font-bold font-mono">
                      {m.scoreA ?? "-"}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs font-semibold">
                    <span className="text-slate-100 truncate flex-1 pr-2">{m.teamB}</span>
                    <span className="w-10 text-center bg-slate-950 border border-slate-800 py-1 rounded text-emerald-400 font-bold font-mono">
                      {m.scoreB ?? "-"}
                    </span>
                  </div>
                </div>

                <div className="pt-1 flex items-center justify-between">
                  <span
                    className={`px-2 py-0.5 text-[10px] font-semibold rounded-full border ${
                      m.isComplete
                        ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                        : "bg-amber-500/10 text-amber-400 border-amber-500/20"
                    }`}
                  >
                    {m.isComplete ? "Completed" : "In Progress"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {activeTab === "brackets" && (
        <section className="space-y-8">
          {categories.map((category) => {
            const catMatches = matches[category.id] || [];
            const knockoutMatches = catMatches.filter((m) => Boolean(m.stageName));

            const roundsMap: Record<number, Match[]> = {};
            knockoutMatches.forEach((m) => {
              const r = m.roundIndex ?? 0;
              if (!roundsMap[r]) roundsMap[r] = [];
              roundsMap[r].push(m);
            });

            const sortedRounds = Object.keys(roundsMap)
              .map(Number)
              .sort((a, b) => a - b);

            return (
              <div key={category.id} className="rounded-xl border border-slate-800 bg-slate-900/40 p-5 overflow-x-auto">
                <h2 className="text-xl font-bold text-white mb-4 border-b border-slate-800 pb-2">
                  {category.name} Bracket
                </h2>

                {sortedRounds.length > 0 ? (
                  <div className="flex items-center gap-8 min-w-[700px] py-4">
                    {sortedRounds.map((rIndex) => {
                      const roundMatches = roundsMap[rIndex];
                      const stageTitle = roundMatches[0]?.stageName || `Round ${rIndex + 1}`;

                      return (
                        <div key={rIndex} className="flex-1 min-w-[200px] flex flex-col gap-6">
                          <div className="text-center font-bold text-xs uppercase tracking-wider text-emerald-400 bg-slate-950/80 py-1 rounded border border-slate-800">
                            {stageTitle}
                          </div>

                          <div className="flex flex-col justify-around h-full gap-6">
                            {roundMatches.map((m) => {
                              const isWinnerA =
                                m.isComplete && m.scoreA !== null && m.scoreB !== null && m.scoreA > m.scoreB;
                              const isWinnerB =
                                m.isComplete && m.scoreA !== null && m.scoreB !== null && m.scoreB > m.scoreA;

                              return (
                                <div key={m.id} className="rounded-lg border border-slate-800 bg-slate-950 p-3 shadow-lg space-y-1">
                                  <div className={`flex justify-between items-center text-xs px-2 py-1 rounded ${isWinnerA ? "bg-emerald-500/20 text-emerald-300 font-bold" : "text-slate-200"}`}>
                                    <span className="truncate max-w-[130px]">{m.teamA}</span>
                                    <span className="font-mono">{m.scoreA ?? "-"}</span>
                                  </div>
                                  <div className={`flex justify-between items-center text-xs px-2 py-1 rounded ${isWinnerB ? "bg-emerald-500/20 text-emerald-300 font-bold" : "text-slate-200"}`}>
                                    <span className="truncate max-w-[130px]">{m.teamB}</span>
                                    <span className="font-mono">{m.scoreB ?? "-"}</span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-slate-500 italic">Knockout bracket not generated yet.</p>
                )}
              </div>
            );
          })}
        </section>
      )}

      {activeTab === "standings" && (
        <section className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-800 pb-3 gap-3">
            <h2 className="text-lg font-bold text-white">Group Standings</h2>

            <div className="flex flex-wrap items-center gap-2">
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setActiveStandingsCatId(cat.id)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
                    activeStandingsCatId === cat.id
                      ? "bg-emerald-500 text-slate-950 font-bold shadow"
                      : "bg-slate-900 text-slate-400 hover:bg-slate-800 hover:text-white"
                  }`}
                >
                  {cat.name}
                </button>
              ))}
            </div>
          </div>

          {categories
            .filter((cat) => !activeStandingsCatId || cat.id === activeStandingsCatId)
            .map((category) => {
              const catMatches = matches[category.id] || [];
              const rrMatches = catMatches.filter((m) => Boolean(m.group));
              const groups = category.bracketGroups ?? [];
              const standingsByGroup = calculateStandings(groups, rrMatches);

              return (
                <div key={category.id} className="rounded-xl border border-slate-800 bg-slate-900/40 p-5 space-y-4">
                  <h3 className="text-xl font-bold text-white border-b border-slate-800 pb-2">{category.name}</h3>

                  <div className="grid gap-6 md:grid-cols-2">
                    {Object.entries(standingsByGroup).map(([groupName, table]) => (
                      <div key={groupName} className="space-y-2">
                        <h4 className="text-xs font-bold text-emerald-400 uppercase tracking-wider">{groupName}</h4>
                        <div className="overflow-x-auto rounded-lg border border-slate-800">
                          <table className="w-full text-left text-xs text-slate-300">
                            <thead className="bg-slate-950 text-slate-400 text-[10px] uppercase">
                              <tr>
                                <th className="p-2">Rank</th>
                                <th className="p-2">Team</th>
                                <th className="p-2 text-center">P</th>
                                <th className="p-2 text-center">W</th>
                                <th className="p-2 text-center">L</th>
                                <th className="p-2 text-center font-bold text-emerald-400">PTS</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800/60 bg-slate-900/60">
                              {table.map((row, idx) => (
                                <tr key={row.team}>
                                  <td className="p-2 font-semibold text-slate-400">{idx + 1}</td>
                                  <td className="p-2 font-semibold text-white">{row.team}</td>
                                  <td className="p-2 text-center">{row.played}</td>
                                  <td className="p-2 text-center text-emerald-400">{row.won}</td>
                                  <td className="p-2 text-center text-rose-400">{row.lost}</td>
                                  <td className="p-2 text-center font-bold text-emerald-400">{row.points}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
        </section>
      )}
    </div>
  );
}
