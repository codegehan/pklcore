"use client";

import React, { useState, useEffect } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  doc,
  getDoc,
  getDocs,
  collection,
  onSnapshot,
  writeBatch,
  updateDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

// ==========================================
// TYPES & INTERFACES
// ==========================================

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
  roundIndex?: number; // 0: Quarterfinals/First Round, 1: Semifinals, 2: Finals, etc.
  matchIndex?: number; // Match position index in the given round
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
  publicViewKey?: string;
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

// ==========================================
// HELPER FUNCTIONS
// ==========================================

function friendlyError(defaultMsg: string, err: unknown): string {
  if (err instanceof Error && err.message) {
    return `${defaultMsg} (${err.message})`;
  }
  return defaultMsg;
}

function buildGroups(teams: string[], groupCount: number): Group[] {
  const count = groupCount > 0 ? groupCount : 1;
  const groups: Group[] = Array.from({ length: count }, (_, i) => ({
    name: `Group ${String.fromCharCode(65 + i)}`,
    teams: [],
  }));

  teams.forEach((team, index) => {
    groups[index % count].teams.push(team);
  });

  return groups;
}

function buildRoundRobinMatchesByGroup(
  groups: Group[],
  categoryId: string,
  categoryName: string
): Match[] {
  const matches: Match[] = [];

  groups.forEach((group) => {
    const teams = group.teams;
    for (let i = 0; i < teams.length; i++) {
      for (let j = i + 1; j < teams.length; j++) {
        const swapSide = Math.random() < 0.5;
        matches.push({
          categoryId,
          categoryName,
          group: group.name,
          teamA: swapSide ? teams[j] : teams[i],
          teamB: swapSide ? teams[i] : teams[j],
          scoreA: null,
          scoreB: null,
          court: null,
          slot: null,
          isComplete: false,
        });
      }
    }
  });

  return matches;
}

function buildMatchList(
  teams: string[],
  type: string,
  categoryId: string,
  categoryName: string
): Match[] {
  const matches: Match[] = [];
  for (let i = 0; i < teams.length; i += 2) {
    if (teams[i + 1]) {
      const swapSide = Math.random() < 0.5;
      matches.push({
        categoryId,
        categoryName,
        stageName: type === "single" ? "Single Elimination" : "Double Elimination",
        teamA: swapSide ? teams[i + 1] : teams[i],
        teamB: swapSide ? teams[i] : teams[i + 1],
        scoreA: null,
        scoreB: null,
        court: null,
        slot: null,
        isComplete: false,
      });
    }
  }
  return matches;
}

function assignSlotsAndCourtsInterleaved(
  categories: Category[],
  matchesMap: Record<string, Match[]>,
  courtsCount: number
): Record<string, Match[]> {
  const courtTotal = courtsCount > 0 ? courtsCount : 4;
  const queues: Match[][] = [];

  categories.forEach((cat) => {
    const catMatches = matchesMap[cat.id] || [];
    const groupedMap: Record<string, Match[]> = {};

    catMatches.forEach((m) => {
      const groupKey = m.group ? `${cat.id}_${m.group}` : `${cat.id}_${m.stageName || "default"}`;
      if (!groupedMap[groupKey]) groupedMap[groupKey] = [];
      groupedMap[groupKey].push(m);
    });

    Object.values(groupedMap).forEach((q) => {
      if (q.length > 0) queues.push([...q]);
    });
  });

  const scheduledMatchesMap: Record<string, Match[]> = {};
  categories.forEach((c) => (scheduledMatchesMap[c.id] = []));

  let currentSlot = 1;
  let currentCourt = 1;

  while (queues.some((q) => q.length > 0)) {
    let matchesInSlot = 0;

    for (let i = 0; i < queues.length; i++) {
      if (queues[i].length > 0) {
        const matchToAssign = queues[i].shift()!;
        matchToAssign.slot = currentSlot;
        matchToAssign.court = currentCourt;

        if (matchToAssign.categoryId && scheduledMatchesMap[matchToAssign.categoryId]) {
          scheduledMatchesMap[matchToAssign.categoryId].push(matchToAssign);
        }

        matchesInSlot++;
        currentCourt++;

        if (currentCourt > courtTotal) {
          currentCourt = 1;
          currentSlot++;
        }
      }
    }

    if (matchesInSlot > 0 && currentCourt !== 1) {
      currentSlot++;
      currentCourt = 1;
    }
  }

  return scheduledMatchesMap;
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

function generateKnockoutBracketPlaceholders(
  knockoutStart: string,
  matchupStrategy: "cross" | "adjacent" = "cross",
  bracketGroups: { name: string; members: string[] }[],
  rrMatches: Match[],
  topAdvance: number,
  categoryId: string,
  categoryName: string
): Match[] {
  const standingsByGroup = calculateStandings(bracketGroups, rrMatches);
  const groupKeys = Object.keys(standingsByGroup).sort();
  const numGroups = groupKeys.length;

  const groupStandings: Record<string, TeamStanding[]> = {};
  groupKeys.forEach((gKey) => {
    groupStandings[gKey] = standingsByGroup[gKey].slice(0, topAdvance);
  });

  const initialFirstRoundPairs: { teamA: string; teamB: string }[] = [];

  if (numGroups > 0) {
    if (matchupStrategy === "adjacent") {
      for (let i = 0; i < numGroups; i += 2) {
        if (i + 1 < numGroups) {
          const gA = groupKeys[i];
          const gB = groupKeys[i + 1];

          const tA1 = groupStandings[gA]?.[0]?.team || `1st ${gA}`;
          const tA2 = groupStandings[gA]?.[1]?.team || `2nd ${gA}`;
          const tB1 = groupStandings[gB]?.[0]?.team || `1st ${gB}`;
          const tB2 = groupStandings[gB]?.[1]?.team || `2nd ${gB}`;

          initialFirstRoundPairs.push({ teamA: tA1, teamB: tB2 });
          initialFirstRoundPairs.push({ teamA: tB1, teamB: tA2 });
        }
      }
    } else {
      for (let i = 0; i < Math.floor(numGroups / 2); i++) {
        const gA = groupKeys[i];
        const gB = groupKeys[numGroups - 1 - i];

        const tA1 = groupStandings[gA]?.[0]?.team || `1st ${gA}`;
        const tA2 = groupStandings[gA]?.[1]?.team || `2nd ${gA}`;
        const tB1 = groupStandings[gB]?.[0]?.team || `1st ${gB}`;
        const tB2 = groupStandings[gB]?.[1]?.team || `2nd ${gB}`;

        initialFirstRoundPairs.push({ teamA: tA1, teamB: tB2 });
        initialFirstRoundPairs.push({ teamA: tB1, teamB: tA2 });
      }
    }
  }

  if (initialFirstRoundPairs.length === 0) {
    const qualifiedTeams: string[] = [];
    Object.values(groupStandings).forEach((list) => {
      list.forEach((item) => qualifiedTeams.push(item.team));
    });
    for (let i = 0; i < qualifiedTeams.length; i += 2) {
      initialFirstRoundPairs.push({
        teamA: qualifiedTeams[i] || "TBD",
        teamB: qualifiedTeams[i + 1] || "TBD",
      });
    }
  }

  const knockoutMatches: Match[] = [];
  const numFirstRoundMatches = initialFirstRoundPairs.length;

  let numRounds = Math.ceil(Math.log2(numFirstRoundMatches + 1));
  if (knockoutStart === "finals") numRounds = 1;
  else if (knockoutStart === "semifinals") numRounds = Math.max(numRounds, 2);
  else if (knockoutStart === "quarterfinals") numRounds = Math.max(numRounds, 3);

  const getStageName = (rIndex: number, totalRounds: number) => {
    const reverseIndex = totalRounds - 1 - rIndex;
    if (reverseIndex === 0) return "Finals";
    if (reverseIndex === 1) return "Semifinals";
    if (reverseIndex === 2) return "Quarterfinals";
    return `Round of ${Math.pow(2, reverseIndex + 1)}`;
  };

  let matchesInRound = numFirstRoundMatches;

  for (let r = 0; r < numRounds; r++) {
    const stageName = getStageName(r, numRounds);

    for (let m = 0; m < matchesInRound; m++) {
      if (r === 0) {
        const pair = initialFirstRoundPairs[m];
        knockoutMatches.push({
          categoryId,
          categoryName,
          stageName,
          roundIndex: r,
          matchIndex: m,
          teamA: pair.teamA,
          teamB: pair.teamB,
          scoreA: null,
          scoreB: null,
          court: null,
          slot: null,
          isComplete: false,
        });
      } else {
        knockoutMatches.push({
          categoryId,
          categoryName,
          stageName,
          roundIndex: r,
          matchIndex: m,
          teamA: "TBD",
          teamB: "TBD",
          scoreA: null,
          scoreB: null,
          court: null,
          slot: null,
          isComplete: false,
        });
      }
    }
    matchesInRound = Math.floor(matchesInRound / 2);
    if (matchesInRound < 1) matchesInRound = 1;
  }

  return knockoutMatches;
}

function updateKnockoutBracketProgression(allMatches: Match[]): Match[] {
  const matchesCopy = [...allMatches];
  const knockoutMatches = matchesCopy.filter((m) => m.roundIndex !== undefined);

  if (knockoutMatches.length === 0) return matchesCopy;

  const maxRound = Math.max(...knockoutMatches.map((m) => m.roundIndex ?? 0));

  for (let r = 0; r < maxRound; r++) {
    const currentRoundMatches = knockoutMatches.filter((m) => m.roundIndex === r);
    const nextRoundMatches = knockoutMatches.filter((m) => m.roundIndex === r + 1);

    currentRoundMatches.forEach((m, idx) => {
      let winner = "TBD";
      if (m.isComplete && m.scoreA !== null && m.scoreB !== null) {
        if (m.scoreA > m.scoreB) winner = m.teamA;
        else if (m.scoreB > m.scoreA) winner = m.teamB;
      }

      const nextMatchIndex = Math.floor(idx / 2);
      const isTeamA = idx % 2 === 0;
      const targetNextMatch = nextRoundMatches.find((nm) => nm.matchIndex === nextMatchIndex);

      if (targetNextMatch) {
        if (isTeamA) targetNextMatch.teamA = winner;
        else targetNextMatch.teamB = winner;
      }
    });
  }

  return matchesCopy;
}

// ==========================================
// MAIN COMPONENT
// ==========================================

export default function TournamentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const id = params?.id as string;

  const initialTab =
    (searchParams?.get("tab") as "categories" | "brackets" | "standings" | "matches") || "categories";

  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [matches, setMatches] = useState<Record<string, Match[]>>({});

  const [loading, setLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [savingMatchId, setSavingMatchId] = useState<string | null>(null);
  const [savedMatchId, setSavedMatchId] = useState<string | null>(null);
  const [isGeneratingAll, setIsGeneratingAll] = useState<boolean>(false);
  const [rebuildingCategoryId, setRebuildingCategoryId] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<"categories" | "brackets" | "standings" | "matches">(
    initialTab
  );

  // MATCHES SUB-TAB STAGE SELECTOR (Round Robin by default)
  const [activeMatchStage, setActiveMatchStage] = useState<string>("Round Robin");

  // STANDINGS CATEGORY TAB SELECTOR
  const [activeStandingsCatId, setActiveStandingsCatId] = useState<string>("");

  // SHARE MODAL STATE
  const [isShareModalOpen, setIsShareModalOpen] = useState<boolean>(false);
  const [copiedLink, setCopiedLink] = useState<boolean>(false);

  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!error && !notice) return;

    const timer = setTimeout(() => {
      setError(null);
      setNotice(null);
    }, 3000);

    return () => clearTimeout(timer);
  }, [error, notice]);

  const [newTeamBatchInput, setNewTeamBatchInput] = useState<Record<string, string>>({});
  const [showKnockoutIncompleteError, setShowKnockoutIncompleteError] = useState<boolean>(false);

  // Local draft scores for match score updates
  const [localScores, setLocalScores] = useState<
    Record<string, { scoreA: string; scoreB: string }>
  >({});

  // Real-Time Listeners for Firestore Data
  useEffect(() => {
    if (!id) return;

    let unsubCategories: (() => void) | null = null;
    const unsubMatchListeners: Record<string, () => void> = {};

    async function initTournamentRealtime() {
      setLoading(true);
      try {
        const tDoc = await getDoc(doc(db, "tournaments", id));
        if (!tDoc.exists()) {
          setError("Tournament not found.");
          setLoading(false);
          return;
        }

        setTournament({ id: tDoc.id, ...tDoc.data() } as Tournament);

        // Listen to categories subcollection in real time
        unsubCategories = onSnapshot(
          collection(db, "tournaments", id, "categories"),
          (catSnap) => {
            const loadedCategories: Category[] = [];

            catSnap.docs.forEach((catDoc) => {
              const catData = {
                id: catDoc.id,
                ...catDoc.data(),
                knockoutStart: catDoc.data().knockoutStart ?? "quarterfinals",
                matchupStrategy: catDoc.data().matchupStrategy ?? "cross",
                bracketCount: catDoc.data().bracketCount ?? 1,
                topAdvance: catDoc.data().topAdvance ?? 2,
              } as Category;
              loadedCategories.push(catData);

              // Set real-time listener for matches of each category
              if (!unsubMatchListeners[catDoc.id]) {
                unsubMatchListeners[catDoc.id] = onSnapshot(
                  collection(db, "tournaments", id, "categories", catDoc.id, "matches"),
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

                    const updatedProgression = updateKnockoutBracketProgression(catMatches);

                    setMatches((prev) => ({
                      ...prev,
                      [catDoc.id]: updatedProgression,
                    }));

                    setLocalScores((prev) => {
                      const draft = { ...prev };
                      catMatches.forEach((m) => {
                        if (m.id && !draft[m.id]) {
                          draft[m.id] = {
                            scoreA:
                              m.scoreA !== null && m.scoreA !== undefined ? String(m.scoreA) : "",
                            scoreB:
                              m.scoreB !== null && m.scoreB !== undefined ? String(m.scoreB) : "",
                          };
                        }
                      });
                      return draft;
                    });
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
          (err) => {
            setError(friendlyError("Failed to listen to tournament categories.", err));
            setLoading(false);
          }
        );
      } catch (err) {
        setError(friendlyError("Failed to fetch tournament details.", err));
        setLoading(false);
      }
    }

    initTournamentRealtime();

    return () => {
      if (unsubCategories) unsubCategories();
      Object.values(unsubMatchListeners).forEach((unsub) => unsub());
    };
  }, [id]);

  // TEAM MANAGEMENT FUNCTIONS

  async function handleAddBatchTeams(categoryId: string) {
    const rawInput = newTeamBatchInput[categoryId]?.trim();
    if (!rawInput) return;

    const parsedTeams = rawInput
      .split(/[\n,]+/)
      .map((t) => t.trim())
      .filter((t) => t.length > 0);

    if (parsedTeams.length === 0) return;

    const category = categories.find((c) => c.id === categoryId);
    if (!category) return;

    const updatedTeams = [...(category.teamNames ?? []), ...parsedTeams];

    try {
      setIsSaving(true);
      const catRef = doc(db, "tournaments", id, "categories", categoryId);
      await updateDoc(catRef, { teamNames: updatedTeams });

      setNewTeamBatchInput((prev) => ({ ...prev, [categoryId]: "" }));
      setNotice(`Added ${parsedTeams.length} team(s) to ${category.name}.`);
      setError(null);
    } catch (err) {
      setError(friendlyError("Failed to add batch teams.", err));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleRemoveTeam(categoryId: string, teamIndex: number) {
    const category = categories.find((c) => c.id === categoryId);
    if (!category) return;

    const currentTeams = [...(category.teamNames ?? [])];
    const removedName = currentTeams.splice(teamIndex, 1)[0];

    try {
      setIsSaving(true);
      const catRef = doc(db, "tournaments", id, "categories", categoryId);
      await updateDoc(catRef, { teamNames: currentTeams });

      setNotice(`Removed team "${removedName}" from ${category.name}.`);
      setError(null);
    } catch (err) {
      setError(friendlyError("Failed to remove team.", err));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleCategoryFieldChange(
    categoryId: string,
    field: keyof Category,
    value: any
  ) {
    try {
      const catRef = doc(db, "tournaments", id, "categories", categoryId);
      await updateDoc(catRef, { [field]: value });
    } catch (err) {
      setError(friendlyError("Failed to update category setting.", err));
    }
  }

  // GENERAL MATCH GENERATION

async function generateAllMatches() {
  if (categories.length === 0) {
    setError("No categories found to generate matches.");
    return;
  }

  for (const cat of categories) {
    const teams = cat.teamNames ?? [];
    if (teams.length < 2) {
      setError(
        `Cannot generate matches: Category "${cat.name}" needs at least 2 teams added.`
      );
      return;
    }

    if ((cat.type ?? "single") === "roundrobin") {
      const normalizedBracketCount = cat.bracketCount ?? 1;
      const normalizedTopAdvance = cat.topAdvance ?? 2;
      const normalizedKnockoutStart = cat.knockoutStart ?? "quarterfinals";
      const normalizedMatchupStrategy = cat.matchupStrategy ?? "cross";

      if (!normalizedBracketCount || normalizedBracketCount < 1) {
        setError(
          `Cannot generate matches: Category "${cat.name}" requires at least 1 group configured.`
        );
        return;
      }
      if (!normalizedTopAdvance || normalizedTopAdvance < 1) {
        setError(
          `Cannot generate matches: Category "${cat.name}" requires top advance count specified.`
        );
        return;
      }

      cat.knockoutStart = normalizedKnockoutStart;
      cat.matchupStrategy = normalizedMatchupStrategy;
    }
  }

  setIsGeneratingAll(true);
  setError(null);
  setNotice(null);

  try {
    const newMatchesMap: Record<string, Match[]> = {};
    const updatedCategoriesList: Category[] = [];
    const batch = writeBatch(db);

    for (const cat of categories) {
      const teamList = cat.teamNames ?? [];
      const catType = cat.type ?? "single";

      const rawGroups = buildGroups(teamList, cat.bracketCount ?? 1);
      const generatedGroups = rawGroups.map((group) => ({
        name: group.name,
        members: group.teams,
      }));

      let catGeneratedMatches: Match[] = [];

      if (catType === "roundrobin") {
        // Build Round Robin matches
        const rrMatches = buildRoundRobinMatchesByGroup(rawGroups, cat.id, cat.name);

        // Automatically build Knockout Bracket Placeholders from category setup
        const knockoutMatches = generateKnockoutBracketPlaceholders(
          cat.knockoutStart ?? "quarterfinals",
          cat.matchupStrategy ?? "cross",
          generatedGroups,
          rrMatches,
          cat.topAdvance ?? 2,
          cat.id,
          cat.name
        );

        catGeneratedMatches = [...rrMatches, ...knockoutMatches];
      } else {
        catGeneratedMatches = buildMatchList(teamList, catType, cat.id, cat.name);
      }

      newMatchesMap[cat.id] = catGeneratedMatches;
      updatedCategoriesList.push({ ...cat, bracketGroups: generatedGroups });

      const categoryRef = doc(db, "tournaments", id, "categories", cat.id);
      batch.update(categoryRef, { bracketGroups: generatedGroups });

      const existingMatchesSnap = await getDocs(
        collection(db, "tournaments", id, "categories", cat.id, "matches")
      );
      existingMatchesSnap.docs.forEach((mDoc) => {
        batch.delete(mDoc.ref);
      });
    }

    const courtsCount = tournament?.courtsCount ?? 4;
    const scheduledMatchesMap = assignSlotsAndCourtsInterleaved(
      updatedCategoriesList,
      newMatchesMap,
      courtsCount
    );

    const newDraftScores: Record<string, { scoreA: string; scoreB: string }> = {};

    for (const cat of updatedCategoriesList) {
      const catMatches = scheduledMatchesMap[cat.id] || [];
      const matchesColRef = collection(db, "tournaments", id, "categories", cat.id, "matches");

      for (const m of catMatches) {
        const matchRef = m.id ? doc(matchesColRef, m.id) : doc(matchesColRef);
        m.id = matchRef.id;
        newDraftScores[m.id] = { scoreA: "", scoreB: "" };
        batch.set(matchRef, {
          group: m.group || null,
          stageName: m.stageName || null,
          roundIndex: m.roundIndex ?? null,
          matchIndex: m.matchIndex ?? null,
          teamA: m.teamA,
          teamB: m.teamB,
          scoreA: m.scoreA,
          scoreB: m.scoreB,
          court: m.court,
          slot: m.slot,
          isComplete: m.isComplete,
        });
      }
    }

    await batch.commit();
    setNotice("Successfully generated all matches across all categories!");
  } catch (genError) {
    setError(friendlyError("Failed to generate tournament matches.", genError));
  } finally {
    setIsGeneratingAll(false);
  }
}

  // KNOCKOUT STAGE GENERATION

  async function generateKnockoutStageForCategory(category: Category) {
    const categoryMatches = matches[category.id] || [];
    const rrMatches = categoryMatches.filter((m) => Boolean(m.group));

    if (rrMatches.length === 0) {
      setError("Please generate Round Robin matches first.");
      return;
    }

    const allRRComplete = rrMatches.every((m) => Boolean(m.isComplete));

    if (!allRRComplete) {
      setShowKnockoutIncompleteError(true);
      return;
    }

    setRebuildingCategoryId(category.id);

    try {
      const rawGroups = category.bracketGroups?.length
        ? category.bracketGroups
        : buildGroups(category.teamNames ?? [], category.bracketCount ?? 1).map((g) => ({
            name: g.name,
            members: g.teams,
          }));

      const knockoutMatches = generateKnockoutBracketPlaceholders(
        category.knockoutStart ?? "quarterfinals",
        category.matchupStrategy ?? "cross",
        rawGroups,
        rrMatches,
        category.topAdvance ?? 2,
        category.id,
        category.name
      );

      const batch = writeBatch(db);
      const existingKnockouts = categoryMatches.filter((m) => Boolean(m.stageName));

      for (const oldMatch of existingKnockouts) {
        if (oldMatch.id) {
          batch.delete(
            doc(db, "tournaments", id, "categories", category.id, "matches", oldMatch.id)
          );
        }
      }

      const updatedCategoryMatches = [...rrMatches, ...knockoutMatches];
      const unassignedMatchesMap = { ...matches, [category.id]: updatedCategoryMatches };
      const courtsCount = tournament?.courtsCount ?? 4;
      const scheduledMatchesMap = assignSlotsAndCourtsInterleaved(
        categories,
        unassignedMatchesMap,
        courtsCount
      );

      for (const cat of categories) {
        const catMatches = scheduledMatchesMap[cat.id] || [];
        const matchesColRef = collection(db, "tournaments", id, "categories", cat.id, "matches");

        for (const m of catMatches) {
          const matchRef = m.id ? doc(matchesColRef, m.id) : doc(matchesColRef);
          m.id = matchRef.id;
          batch.set(matchRef, {
            group: m.group || null,
            stageName: m.stageName || null,
            roundIndex: m.roundIndex ?? null,
            matchIndex: m.matchIndex ?? null,
            teamA: m.teamA,
            teamB: m.teamB,
            scoreA: m.scoreA,
            scoreB: m.scoreB,
            court: m.court,
            slot: m.slot,
            isComplete: m.isComplete,
          });
        }
      }

      await batch.commit();

      setNotice(`Knockout stage successfully generated for ${category.name}!`);
      setError(null);
    } catch (err) {
      setError(friendlyError("Failed to generate knockout stage.", err));
    } finally {
      setRebuildingCategoryId(null);
    }
  }

  // SCORE SAVE FUNCTIONALITY

  function handleLocalScoreInputChange(matchId: string, team: "A" | "B", val: string) {
    setLocalScores((prev) => ({
      ...prev,
      [matchId]: {
        ...prev[matchId],
        [team === "A" ? "scoreA" : "scoreB"]: val,
      },
    }));
  }

  async function handleSaveScore(categoryId: string, matchId: string) {
    const matchScores = localScores[matchId];
    const rawA = matchScores?.scoreA;
    const rawB = matchScores?.scoreB;

    const valA = rawA !== "" && rawA !== undefined ? Number(rawA) : null;
    const valB = rawB !== "" && rawB !== undefined ? Number(rawB) : null;
    const isComplete = valA !== null && valB !== null && !isNaN(valA) && !isNaN(valB);

    setSavingMatchId(matchId);
    setSavedMatchId(null);
    setError(null);

    try {
      const matchRef = doc(db, "tournaments", id, "categories", categoryId, "matches", matchId);
      await updateDoc(matchRef, {
        scoreA: valA,
        scoreB: valB,
        isComplete,
      });

      const updatedCategoryMatches = (matches[categoryId] || []).map((m) =>
        m.id === matchId ? { ...m, scoreA: valA, scoreB: valB, isComplete } : m
      );

      const progressedMatches = updateKnockoutBracketProgression(updatedCategoryMatches);

      const batch = writeBatch(db);
      progressedMatches
        .filter((m) => m.stageName)
        .forEach((m) => {
          if (m.id) {
            batch.update(doc(db, "tournaments", id, "categories", categoryId, "matches", m.id), {
              teamA: m.teamA,
              teamB: m.teamB,
            });
          }
        });
      await batch.commit();

      setSavedMatchId(matchId);
      setTimeout(() => setSavedMatchId(null), 3000);
    } catch (err) {
      setError(friendlyError("Failed to save score.", err));
    } finally {
      setSavingMatchId(null);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-white">
        <p className="animate-pulse text-sm font-medium text-slate-400">Loading Tournament...</p>
      </div>
    );
  }

  // Filter out incomplete/placeholder teams
  const allTournamentMatches: Match[] = Object.values(matches)
  .flat()
  .sort((a, b) => {
    if (a.isComplete !== b.isComplete) {
      return a.isComplete ? 1 : -1;
    }
    if ((a.slot ?? 0) !== (b.slot ?? 0)) return (a.slot ?? 0) - (b.slot ?? 0);
    return (a.court ?? 0) - (b.court ?? 0);
  });

  // Unique ordered list of Knockout Stage Names
  const knockoutStageNames: string[] = [];
  allTournamentMatches.forEach((m) => {
    if (m.stageName && !knockoutStageNames.includes(m.stageName)) {
      knockoutStageNames.push(m.stageName);
    }
  });

  // Sort knockout stages logically (Quarterfinals -> Semifinals -> Finals)
  knockoutStageNames.sort((a, b) => {
    const orderScore = (name: string) => {
      const lower = name.toLowerCase();
      if (lower.includes("quarter")) return 1;
      if (lower.includes("semi")) return 2;
      if (lower.includes("final")) return 3;
      return 0;
    };
    return orderScore(a) - orderScore(b);
  });

  // Available stage tabs: Always includes "Round Robin", followed by generated Knockout Stages
  const matchStageTabs = ["Round Robin", ...knockoutStageNames];

  // Filter matches based on the selected stage tab
  const displayedMatches = allTournamentMatches.filter((m) => {
    if (activeMatchStage === "Round Robin") {
      return Boolean(m.group);
    }
    return m.stageName?.toLowerCase() === activeMatchStage.toLowerCase();
  });

  // Compute Courts layout based on tournament court count
  const courtsCount = tournament?.courtsCount || 4;
  const courtsArray = Array.from({ length: courtsCount }, (_, i) => i + 1);

  // Active playing matches per court (pending matches with current lowest slot number)
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

  const publicViewerPath = `/view/${tournament?.publicViewKey || id}`;
  const viewerShareUrl =
    typeof window !== "undefined" ? `${window.location.origin}${publicViewerPath}` : publicViewerPath;

  const copyShareUrl = () => {
    navigator.clipboard.writeText(viewerShareUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-6">
      <header className="mb-6 flex flex-col md:flex-row md:items-center md:justify-between border-b border-slate-800 pb-4 gap-4">
        <div>
          <button
            onClick={() => router.back()}
            className="text-xs text-emerald-400 hover:underline mb-2 inline-block"
          >
            &larr; Back
          </button>
          <h1 className="text-2xl md:text-3xl font-bold text-white">{tournament?.name}</h1>
        </div>

        <nav className="flex flex-wrap items-center gap-2">
          {(["categories", "brackets", "standings", "matches"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-1.5 md:px-4 md:py-2 text-xs md:text-sm font-medium rounded-lg capitalize transition ${
                activeTab === tab
                  ? "bg-emerald-500 text-slate-950 font-semibold"
                  : "bg-slate-900 text-slate-300 hover:bg-slate-800"
              }`}
            >
              {tab}
            </button>
          ))}

          {/* Shareable Link Button for Viewers */}
          <button
            onClick={() => setIsShareModalOpen(true)}
            className="px-3 py-1.5 md:py-2 text-xs font-semibold text-slate-950 bg-emerald-400 hover:bg-emerald-300 rounded-lg transition flex items-center gap-1.5 shadow"
          >
            <span>🔗 Share Viewer Link</span>
          </button>

          {/* New Tab Opener */}
          <a
            href={`/organizer/tournament/${id}?tab=matches`}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-1.5 md:py-2 text-xs text-emerald-400 hover:text-emerald-300 bg-slate-900 hover:bg-slate-800 rounded-lg border border-emerald-500/30 transition flex items-center gap-1"
            title="Open Matches schedule in a new browser tab"
          >
            <span>Matches Tab ↗</span>
          </a>
        </nav>
      </header>

      {/* Dynamic Courts Section displaying currently active matches per court */}
      <section className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
            Courts Live Status ({courtsCount} Courts)
          </h2>
          <span className="text-xs text-slate-400">Currently playing pairs</span>
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
                      {activeMatch.categoryName || "Category"} &bull;{" "}
                      {activeMatch.group || activeMatch.stageName}
                    </p>

                    <div className="flex items-center justify-between bg-slate-950 px-3 py-2 rounded-lg border border-slate-800 text-xs font-semibold text-white">
                      <span className="truncate">{activeMatch.teamA}</span>
                      <span className="text-emerald-400 font-mono">
                        {activeMatch.scoreA ?? "0"}
                      </span>
                    </div>

                    <div className="text-center text-[10px] font-bold text-slate-500 my-0.5">VS</div>

                    <div className="flex items-center justify-between bg-slate-950 px-3 py-2 rounded-lg border border-slate-800 text-xs font-semibold text-white">
                      <span className="truncate">{activeMatch.teamB}</span>
                      <span className="text-emerald-400 font-mono">
                        {activeMatch.scoreB ?? "0"}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="py-6 text-center text-xs text-slate-500 italic">
                    No active match on Court {courtNum}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Notifications */}
      {error && (
        <div className="mb-4 rounded-lg bg-rose-500/10 border border-rose-500/30 p-3 text-xs text-rose-400">
          {error}
        </div>
      )}
      {notice && (
        <div className="mb-4 rounded-lg bg-emerald-500/10 border border-emerald-500/30 p-3 text-xs text-emerald-400">
          {notice}
        </div>
      )}

      {/* TAB 1: CATEGORIES & TEAMS SETUP */}
      {activeTab === "categories" && (
        <section className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
            <div>
              <h2 className="text-lg font-bold text-white">Categories & Teams</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Ensure teams and stage configurations are complete before generating matches.
              </p>
            </div>
            <button
              onClick={generateAllMatches}
              disabled={isGeneratingAll || isSaving}
              className="bg-emerald-500 text-slate-950 font-bold px-4 py-2 rounded-xl text-xs hover:bg-emerald-400 transition disabled:opacity-50"
            >
              {isGeneratingAll ? "Generating All Matches..." : "Generate All Matches"}
            </button>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            {categories.map((cat) => {
              const teamList = cat.teamNames ?? [];
              const categoryType = cat.type ?? "single";

              return (
                <div key={cat.id} className="rounded-xl border border-slate-800 bg-slate-900/50 p-5 space-y-4">
                  <div className="flex justify-between items-center border-b border-slate-800 pb-3">
                    <h3 className="text-base font-bold text-white">{cat.name}</h3>
                    <select
                      value={categoryType}
                      onChange={(e) =>
                        handleCategoryFieldChange(cat.id, "type", e.target.value)
                      }
                      className="bg-slate-900 border border-slate-700 text-xs rounded px-2 py-1 text-slate-200"
                    >
                      <option value="single">Single Elimination</option>
                      <option value="double">Double Elimination</option>
                      <option value="roundrobin">Round Robin</option>
                    </select>
                  </div>

                  {categoryType === "roundrobin" && (
                    <div className="grid grid-cols-2 gap-2 bg-slate-950 p-3 rounded-lg border border-slate-800/80 text-xs">
                      <div>
                        <label className="block text-slate-400 mb-1">Groups</label>
                        <input
                          type="number"
                          min={1}
                          value={cat.bracketCount ?? 1}
                          onChange={(e) =>
                            handleCategoryFieldChange(cat.id, "bracketCount", Number(e.target.value))
                          }
                          className="w-full bg-slate-900 border border-slate-700 rounded p-1 text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-400 mb-1">Top Advance / Group</label>
                        <input
                          type="number"
                          min={1}
                          value={cat.topAdvance ?? 2}
                          onChange={(e) =>
                            handleCategoryFieldChange(cat.id, "topAdvance", Number(e.target.value))
                          }
                          className="w-full bg-slate-900 border border-slate-700 rounded p-1 text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-400 mb-1">Knockout Matchup Crossover</label>
                        <select
                          value={cat.matchupStrategy ?? "cross"}
                          onChange={(e) =>
                            handleCategoryFieldChange(cat.id, "matchupStrategy", e.target.value)
                          }
                          className="w-full bg-slate-900 border border-slate-700 rounded p-1 text-white"
                        >
                          <option value="cross">Cross (A vs D, B vs C)</option>
                          <option value="adjacent">Adjacent (A vs B, C vs D)</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-slate-400 mb-1">Knockout Stage Start</label>
                        <select
                          value={cat.knockoutStart ?? "quarterfinals"}
                          onChange={(e) =>
                            handleCategoryFieldChange(cat.id, "knockoutStart", e.target.value)
                          }
                          className="w-full bg-slate-900 border border-slate-700 rounded p-1 text-white"
                        >
                          <option value="finals">Finals</option>
                          <option value="semifinals">Semifinals</option>
                          <option value="quarterfinals">Quarterfinals</option>
                        </select>
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1">
                      Add Teams / Players (Batch)
                    </label>
                    <textarea
                      rows={2}
                      placeholder={`Team A\nTeam B, Team C`}
                      value={newTeamBatchInput[cat.id] || ""}
                      onChange={(e) =>
                        setNewTeamBatchInput((prev) => ({ ...prev, [cat.id]: e.target.value }))
                      }
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-xs text-white focus:border-emerald-500 focus:outline-none resize-y"
                    />
                    <button
                      type="button"
                      onClick={() => handleAddBatchTeams(cat.id)}
                      disabled={isSaving || !newTeamBatchInput[cat.id]?.trim()}
                      className="mt-2 w-full bg-emerald-500 text-slate-950 font-semibold py-1.5 rounded-lg text-xs hover:bg-emerald-400 disabled:opacity-50 transition"
                    >
                      Add Teams
                    </button>
                  </div>

                  <div>
                    <span className="text-xs text-slate-400 block mb-2">
                      Teams Added ({teamList.length})
                    </span>
                    <div className="max-h-36 overflow-y-auto space-y-1 pr-1">
                      {teamList.map((team, index) => (
                        <div
                          key={index}
                          className="flex justify-between items-center bg-slate-950 px-3 py-1 rounded text-xs border border-slate-800/60"
                        >
                          <span className="text-slate-200">{team}</span>
                          <button
                            type="button"
                            onClick={() => handleRemoveTeam(cat.id, index)}
                            disabled={isSaving}
                            className="text-rose-400 hover:text-rose-300 font-bold px-1"
                          >
                            &times;
                          </button>
                        </div>
                      ))}
                      {teamList.length === 0 && (
                        <p className="text-xs italic text-slate-500 py-1">No teams added yet.</p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* TAB 2: BRACKETS & GROUPS */}
      {activeTab === "brackets" && (
        <section className="space-y-8">
          {categories.map((category) => {
            const catMatches = matches[category.id] || [];
            const knockoutMatches = catMatches.filter((m) => Boolean(m.stageName));
            const isRebuilding = rebuildingCategoryId === category.id;

            const roundsMap: Record<number, Match[]> = {};
            knockoutMatches.forEach((m) => {
              const r = m.roundIndex ?? 0;
              if (!roundsMap[r]) roundsMap[r] = [];
              roundsMap[r].push(m);
            });

            const sortedRounds = Object.keys(roundsMap)
              .map(Number)
              .sort((a, b) => a - b);

            const maxRound = sortedRounds.length > 0 ? Math.max(...sortedRounds) : -1;
            const finalsMatch = maxRound >= 0 ? roundsMap[maxRound]?.[0] : null;
            let champion: string | null = null;
            if (finalsMatch && finalsMatch.isComplete && finalsMatch.scoreA !== null && finalsMatch.scoreB !== null) {
              if (finalsMatch.scoreA > finalsMatch.scoreB) champion = finalsMatch.teamA;
              else if (finalsMatch.scoreB > finalsMatch.scoreA) champion = finalsMatch.teamB;
            }

            return (
              <div key={category.id} className="rounded-xl border border-slate-800 bg-slate-900/40 p-5 overflow-x-auto">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between border-b border-slate-800 pb-3 mb-4">
                  <div>
                    <h2 className="text-xl font-bold text-white">{category.name}</h2>
                    <p className="text-xs text-slate-400 uppercase tracking-wider">
                      {category.type} Stage &bull; Strategy: {category.matchupStrategy === "adjacent" ? "Adjacent (A vs B, C vs D)" : "Cross (A vs D, B vs C)"}
                    </p>
                  </div>

                  {category.type === "roundrobin" && (
                    <button
                      type="button"
                      onClick={() => generateKnockoutStageForCategory(category)}
                      disabled={isRebuilding || isSaving}
                      className="mt-3 md:mt-0 rounded-lg bg-emerald-400 px-3 py-1.5 text-xs font-semibold text-slate-950 transition hover:bg-emerald-300 disabled:opacity-70"
                    >
                      {isRebuilding ? "Generating..." : "Generate Knockout Stage"}
                    </button>
                  )}
                </div>

                {category.bracketGroups && category.bracketGroups.length > 0 && (
                  <div className="mb-6">
                    <h3 className="text-xs font-semibold uppercase text-slate-400 mb-3">
                      Groups Summary
                    </h3>
                    <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
                      {category.bracketGroups.map((group) => (
                        <div key={group.name} className="rounded-lg border border-slate-800 bg-slate-950 p-3">
                          <h4 className="text-xs font-bold text-emerald-400 mb-2 border-b border-slate-900 pb-1">
                            {group.name} ({group.members.length} Teams)
                          </h4>
                          <ul className="text-xs text-slate-300 space-y-1">
                            {group.members.map((member, idx) => (
                              <li key={member}>
                                {idx + 1}. {member}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {sortedRounds.length > 0 && (
                  <div>
                    <h3 className="text-xs font-semibold uppercase text-slate-400 mb-4">
                      Knockout Bracket Tree
                    </h3>

                    <div className="flex items-center gap-8 min-w-[700px] py-4 overflow-x-auto">
                      {sortedRounds.map((rIndex) => {
                        const roundMatches = roundsMap[rIndex];
                        const stageTitle = roundMatches[0]?.stageName || `Round ${rIndex + 1}`;

                        return (
                          <div key={rIndex} className="flex-1 min-w-[200px] flex flex-col justify-around gap-6">
                            <div className="text-center font-bold text-xs uppercase tracking-wider text-emerald-400 bg-slate-950/80 py-1 rounded border border-slate-800">
                              {stageTitle}
                            </div>

                            <div className="flex flex-col justify-around h-full gap-6">
                              {roundMatches.map((m) => {
                                const isWinnerA = m.isComplete && m.scoreA !== null && m.scoreB !== null && m.scoreA > m.scoreB;
                                const isWinnerB = m.isComplete && m.scoreA !== null && m.scoreB !== null && m.scoreB > m.scoreA;

                                return (
                                  <div
                                    key={m.id}
                                    className="rounded-lg border border-slate-800 bg-slate-950 p-3 shadow-lg relative flex flex-col justify-between"
                                  >
                                    <div className="text-[9px] uppercase font-bold text-slate-500 mb-1 flex justify-between">
                                      <span>Court {m.court ?? 1}</span>
                                      <span>Slot {m.slot ?? 1}</span>
                                    </div>

                                    <div
                                      className={`flex justify-between items-center text-xs py-1 px-1.5 rounded transition ${
                                        isWinnerA ? "bg-emerald-500/20 text-emerald-300 font-bold" : "text-slate-200"
                                      }`}
                                    >
                                      <span className="truncate max-w-[130px]">{m.teamA}</span>
                                      <span className="font-mono font-bold">{m.scoreA ?? "-"}</span>
                                    </div>

                                    <div
                                      className={`flex justify-between items-center text-xs py-1 px-1.5 rounded transition border-t border-slate-900 mt-1 ${
                                        isWinnerB ? "bg-emerald-500/20 text-emerald-300 font-bold" : "text-slate-200"
                                      }`}
                                    >
                                      <span className="truncate max-w-[130px]">{m.teamB}</span>
                                      <span className="font-mono font-bold">{m.scoreB ?? "-"}</span>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}

                      <div className="flex flex-col items-center justify-center min-w-[180px] p-4 bg-amber-500/10 rounded-xl border border-amber-500/30">
                        <div className="text-3xl mb-1 animate-bounce">👑</div>
                        <div className="text-xs font-bold text-amber-400 uppercase tracking-widest mb-1">
                          Champion
                        </div>
                        <div className="text-sm font-extrabold text-white text-center">
                          {champion ? champion : "TBD"}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </section>
      )}

      {/* TAB 3: STANDINGS DASHBOARD WITH CATEGORY TABS */}
      {activeTab === "standings" && (
        <section className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-800 pb-3 gap-3">
            <div>
              <h2 className="text-lg font-bold text-white">Standings Dashboard</h2>
              <p className="text-xs text-slate-400">View real-time standings per category and group</p>
            </div>

            {/* Category Tabs Selector */}
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
                <div key={category.id} className="rounded-xl border border-slate-800 bg-slate-900/40 p-5 space-y-5">
                  <h3 className="text-xl font-bold text-white border-b border-slate-800 pb-2">
                    {category.name}
                  </h3>

                  {Object.keys(standingsByGroup).length === 0 ? (
                    <p className="text-xs italic text-slate-500">No round robin standings available.</p>
                  ) : (
                    <div className="grid gap-6 md:grid-cols-2">
                      {Object.entries(standingsByGroup).map(([groupName, table]) => (
                        <div key={groupName} className="space-y-2">
                          <div className="flex justify-between items-center">
                            <h4 className="text-xs font-bold text-emerald-400 uppercase tracking-wider">
                              {groupName}
                            </h4>
                            <span className="text-[10px] text-slate-500">
                              {table.length} Teams
                            </span>
                          </div>

                          <div className="overflow-x-auto rounded-lg border border-slate-800">
                            <table className="w-full text-left text-xs text-slate-300">
                              <thead className="bg-slate-950 text-slate-400 text-[10px] uppercase">
                                <tr>
                                  <th className="p-2">Rank</th>
                                  <th className="p-2">Team</th>
                                  <th className="p-2 text-center">P</th>
                                  <th className="p-2 text-center">W</th>
                                  <th className="p-2 text-center">L</th>
                                  <th className="p-2 text-center">D</th>
                                  <th className="p-2 text-center">PF</th>
                                  <th className="p-2 text-center">PA</th>
                                  <th className="p-2 text-center">DIFF</th>
                                  <th className="p-2 text-center font-bold text-emerald-400">PTS</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-800/60 bg-slate-900/60">
                                {table.map((row, idx) => (
                                  <tr key={row.team} className="hover:bg-slate-800/40">
                                    <td className="p-2 font-semibold text-slate-400">{idx + 1}</td>
                                    <td className="p-2 font-semibold text-white">{row.team}</td>
                                    <td className="p-2 text-center">{row.played}</td>
                                    <td className="p-2 text-center text-emerald-400 font-semibold">{row.won}</td>
                                    <td className="p-2 text-center text-rose-400">{row.lost}</td>
                                    <td className="p-2 text-center">{row.drawn}</td>
                                    <td className="p-2 text-center">{row.pointsFor}</td>
                                    <td className="p-2 text-center">{row.pointsAgainst}</td>
                                    <td className="p-2 text-center font-semibold">{row.diff > 0 ? `+${row.diff}` : row.diff}</td>
                                    <td className="p-2 text-center font-bold text-emerald-400">{row.points}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
        </section>
      )}

      {/* TAB 4: UNIFIED MATCHES SCHEDULE WITH INSIDE TABS */}
      {activeTab === "matches" && (
        <section className="space-y-4">
          <div className="border-b border-slate-800 pb-3 flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-white">Matches Schedule</h2>
              <p className="text-xs text-slate-400">
                Simple score manager. Saved scores automatically advance bracket winners dynamically!
              </p>
            </div>

            {/* DYNAMIC STAGE TABS (Round Robin, Quarterfinals, Semifinals, Finals, etc.) */}
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
            {displayedMatches.map((m) => {
              const currentScores = localScores[m.id!] || {
                scoreA: m.scoreA !== null ? String(m.scoreA) : "",
                scoreB: m.scoreB !== null ? String(m.scoreB) : "",
              };

              return (
                <div
                  key={`${m.categoryId}_${m.id}`}
                  className={`rounded-xl border p-3 space-y-3 transition ${
                    m.isComplete
                      ? "bg-slate-900/30 border-slate-800/80"
                      : "bg-slate-900/90 border-slate-700/80 shadow-md"
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
                      <input
                        type="number"
                        placeholder="0"
                        value={currentScores.scoreA}
                        onChange={(e) =>
                          handleLocalScoreInputChange(m.id!, "A", e.target.value)
                        }
                        className="w-12 text-center bg-slate-950 border border-slate-700 rounded py-1 text-xs text-emerald-400 font-bold focus:border-emerald-500 focus:outline-none"
                      />
                    </div>

                    <div className="flex items-center justify-between text-xs font-semibold">
                      <span className="text-slate-100 truncate flex-1 pr-2">{m.teamB}</span>
                      <input
                        type="number"
                        placeholder="0"
                        value={currentScores.scoreB}
                        onChange={(e) =>
                          handleLocalScoreInputChange(m.id!, "B", e.target.value)
                        }
                        className="w-12 text-center bg-slate-950 border border-slate-700 rounded py-1 text-xs text-emerald-400 font-bold focus:border-emerald-500 focus:outline-none"
                      />
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
                      {m.isComplete ? "Completed" : "Pending"}
                    </span>
                    <div className="flex items-center gap-2">
                      {savedMatchId === m.id && (
                        <span className="text-[10px] font-medium text-emerald-400 animate-fade-in">
                          Saved!
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => handleSaveScore(m.categoryId!, m.id!)}
                        disabled={savingMatchId === m.id}
                        className="bg-emerald-500 text-slate-950 font-bold text-xs px-3 py-1 rounded hover:bg-emerald-400 transition disabled:opacity-50"
                      >
                        {savingMatchId === m.id ? "Saving..." : "Save Score"}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}

            {displayedMatches.length === 0 && (
              <div className="col-span-full py-8 text-center text-xs text-slate-500 italic">
                No matches found for this stage.
              </div>
            )}
          </div>
        </section>
      )}

      {/* SHARE VIEWER LINK MODAL */}
      {isShareModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white">Share Viewer Link</h3>
              <button
                type="button"
                onClick={() => setIsShareModalOpen(false)}
                className="text-xs text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Share this live public view with players and spectators. They will see live courts and standings in real-time.
            </p>

            <div className="flex items-center gap-2 bg-slate-950 p-2 rounded-xl border border-slate-800">
              <input
                type="text"
                readOnly
                value={viewerShareUrl}
                className="w-full bg-transparent text-xs text-slate-200 outline-none px-1"
              />
              <button
                type="button"
                onClick={copyShareUrl}
                className="bg-emerald-500 text-slate-950 font-bold text-xs px-3 py-1.5 rounded-lg hover:bg-emerald-400 transition flex-shrink-0"
              >
                {copiedLink ? "Copied!" : "Copy"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Round Robin Incomplete Error Modal */}
      {showKnockoutIncompleteError && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4">
          <div className="w-full max-w-sm rounded-2xl border border-rose-500/40 bg-slate-950 p-5 shadow-2xl">
            <h3 className="text-base font-bold text-white">Cannot Generate Knockout Stage</h3>
            <p className="mt-2 text-xs text-slate-300 leading-relaxed">
              You must finish all Round Robin matches before generating teams for the Knockout stage. Please save all match scores in the Matches tab first.
            </p>

            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => setShowKnockoutIncompleteError(false)}
                className="rounded-lg bg-rose-500 px-4 py-1.5 text-xs font-semibold text-white hover:bg-rose-400"
              >
                Understood
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}