"use client";

import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation } from "convex/react";
import { api } from "convex/_generated/api";
import type { Id } from "convex/_generated/dataModel";
import { useAuth } from "~/lib/auth-context";
import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { Loader2, ArrowLeft, Scissors, UserPlus, CheckCircle2, Clock } from "lucide-react";
import { toast } from "sonner";
import { useState, useEffect } from "react";
import Link from "next/link";

export default function RosterEvolutionPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const seasonId = (params?.seasonId as string) || "";

  const [selectedArtistForCut, setSelectedArtistForCut] = useState<Id<"artists"> | null>(null);
  const [showCutConfirmDialog, setShowCutConfirmDialog] = useState(false);
  const [isCutting, setIsCutting] = useState(false);
  const [draftArtistName, setDraftArtistName] = useState("");
  const [isDrafting, setIsDrafting] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  // Commissioner cut-for-player state
  const [commissionerCutPlayerId, setCommissionerCutPlayerId] = useState<Id<"season_players"> | null>(null);
  const [commissionerSelectedArtist, setCommissionerSelectedArtist] = useState<Id<"artists"> | null>(null);
  const [showCommissionerCutConfirm, setShowCommissionerCutConfirm] = useState(false);
  const [isCommissionerCutting, setIsCommissionerCutting] = useState(false);
  // Prompt selection state
  const [selectedPromptId, setSelectedPromptId] = useState<Id<"draft_prompts"> | null>(null);
  const [showPromptConfirm, setShowPromptConfirm] = useState(false);
  const [isSelectingPrompt, setIsSelectingPrompt] = useState(false);
  // Commissioner draft-for-player state
  const [commissionerDraftArtistName, setCommissionerDraftArtistName] = useState("");
  const [isCommissionerDrafting, setIsCommissionerDrafting] = useState(false);
  // Week advance confirmation state
  const [showAdvanceWeekConfirm, setShowAdvanceWeekConfirm] = useState(false);
  // Pool draft state
  const [selectedPoolArtist, setSelectedPoolArtist] = useState<Id<"artists"> | null>(null);
  const [showPoolDraftConfirm, setShowPoolDraftConfirm] = useState(false);
  const [isPoolDrafting, setIsPoolDrafting] = useState(false);

  const season = useQuery(api.seasons.getSeason, {
    seasonId: seasonId as Id<"seasons">,
  });

  const currentWeek = season?.currentWeek ?? 1;

  const evolutionState = useQuery(api.rosterEvolution.getRosterEvolutionState, {
    seasonId: seasonId as Id<"seasons">,
    weekNumber: currentWeek,
  });

  const cutStatus = useQuery(api.rosterEvolution.getCutStatus, {
    seasonId: seasonId as Id<"seasons">,
    weekNumber: currentWeek,
  });

  // Get current user's season player ID
  const seasonPlayers = useQuery(api.seasons.getSeasonPlayers, {
    seasonId: seasonId as Id<"seasons">,
  });

  const currentSeasonPlayer = seasonPlayers?.find(
    (p) => p.userId === user?.id
  );

  const playerRoster = useQuery(
    api.rosterEvolution.getPlayerRosterForCutting,
    currentSeasonPlayer
      ? { seasonPlayerId: currentSeasonPlayer._id as Id<"season_players"> }
      : "skip"
  );

  // Commissioner: get roster for selected player to cut for
  const commissionerPlayerRoster = useQuery(
    api.rosterEvolution.getPlayerRosterForCutting,
    commissionerCutPlayerId
      ? { seasonPlayerId: commissionerCutPlayerId }
      : "skip"
  );

  // Available prompts for prompt selection phase
  const availablePrompts = useQuery(
    api.rosterEvolution.getAvailableRedraftPrompts,
    { seasonId: seasonId as Id<"seasons"> }
  );

  // All rosters for reference during redraft
  const allPlayersRosters = useQuery(api.dashboard.getAllPlayersRosters, {
    seasonId: seasonId as Id<"seasons">,
  });

  // Pool artists for reference during redraft
  const poolArtists = useQuery(api.pool.getPoolArtists, {
    seasonId: seasonId as Id<"seasons">,
  });

  const initializeEvolutionMutation = useMutation(api.rosterEvolution.initializeGrowthWeekEvolution);
  const cutArtistMutation = useMutation(api.rosterEvolution.cutArtist);
  const draftArtistMutation = useMutation(api.rosterEvolution.draftArtist);
  const selectPromptMutation = useMutation(api.rosterEvolution.selectRedraftPrompt);
  const completeEvolutionMutation = useMutation(api.rosterEvolution.completeRosterEvolution);
  const draftFromPoolMutation = useMutation(api.rosterEvolution.draftFromPoolPhase);

  const isCommissioner = season && user && season.league.commissioner.id === user.id;

  // Initialize evolution if not already started
  const handleInitializeEvolution = async () => {
    if (!user) return;
    setIsInitializing(true);
    try {
      await initializeEvolutionMutation({
        seasonId: seasonId as Id<"seasons">,
        weekNumber: currentWeek,
      });
      toast.success("Roster evolution initialized!");
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Failed to initialize";
      toast.error(errorMsg);
    } finally {
      setIsInitializing(false);
    }
  };

  // Handle cutting an artist
  const handleConfirmCut = async () => {
    if (!user || !selectedArtistForCut || !currentSeasonPlayer) return;
    setIsCutting(true);
    try {
      await cutArtistMutation({
        seasonId: seasonId as Id<"seasons">,
        weekNumber: currentWeek,
        artistId: selectedArtistForCut,
        seasonPlayerId: currentSeasonPlayer._id as Id<"season_players">,
      });
      toast.success("Artist cut successfully!");
      setShowCutConfirmDialog(false);
      setSelectedArtistForCut(null);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Failed to cut artist";
      toast.error(errorMsg);
    } finally {
      setIsCutting(false);
    }
  };

  // Commissioner: handle cutting for another player
  const handleCommissionerCut = async () => {
    if (!user || !commissionerSelectedArtist || !commissionerCutPlayerId) return;
    setIsCommissionerCutting(true);
    try {
      await cutArtistMutation({
        seasonId: seasonId as Id<"seasons">,
        weekNumber: currentWeek,
        artistId: commissionerSelectedArtist,
        seasonPlayerId: commissionerCutPlayerId,
      });
      const playerName = seasonPlayers?.find(p => p._id === commissionerCutPlayerId)?.labelName;
      toast.success(`Cut completed for ${playerName}!`);
      setShowCommissionerCutConfirm(false);
      setCommissionerSelectedArtist(null);
      setCommissionerCutPlayerId(null); // Reset player selection after cut
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Failed to cut artist";
      toast.error(errorMsg);
    } finally {
      setIsCommissionerCutting(false);
    }
  };

  // Handle selecting a redraft prompt
  const handleSelectPrompt = async () => {
    if (!user || !selectedPromptId) return;
    setIsSelectingPrompt(true);
    try {
      const result = await selectPromptMutation({
        seasonId: seasonId as Id<"seasons">,
        weekNumber: currentWeek,
        promptId: selectedPromptId,
        requestingUserId: user.id as Id<"users">,
      });
      toast.success(`Prompt selected: ${result.promptText}`);
      setShowPromptConfirm(false);
      setSelectedPromptId(null);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Failed to select prompt";
      toast.error(errorMsg);
    } finally {
      setIsSelectingPrompt(false);
    }
  };

  // Handle drafting an artist
  const handleDraftArtist = async () => {
    if (!user || !draftArtistName.trim() || !currentSeasonPlayer) return;
    setIsDrafting(true);
    try {
      await draftArtistMutation({
        seasonId: seasonId as Id<"seasons">,
        weekNumber: currentWeek,
        artistName: draftArtistName.trim(),
        seasonPlayerId: currentSeasonPlayer._id as Id<"season_players">,
      });
      toast.success(`Drafted ${draftArtistName}!`);
      setDraftArtistName("");
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Failed to draft artist";
      toast.error(errorMsg);
    } finally {
      setIsDrafting(false);
    }
  };

  // Handle commissioner drafting on behalf of the current player
  const handleCommissionerDraft = async () => {
    if (!user || !commissionerDraftArtistName.trim() || !evolutionState?.currentRedraftPlayer) return;
    setIsCommissionerDrafting(true);
    try {
      const currentPlayerId = evolutionState.redraftOrder[evolutionState.currentRedraftIndex];
      const playerName = evolutionState.currentRedraftPlayer.labelName;
      await draftArtistMutation({
        seasonId: seasonId as Id<"seasons">,
        weekNumber: currentWeek,
        artistName: commissionerDraftArtistName.trim(),
        seasonPlayerId: currentPlayerId as Id<"season_players">,
      });
      toast.success(`Drafted ${commissionerDraftArtistName} for ${playerName}!`);
      setCommissionerDraftArtistName("");
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Failed to draft artist";
      toast.error(errorMsg);
    } finally {
      setIsCommissionerDrafting(false);
    }
  };

  // Handle pool draft pick
  const handlePoolDraft = async () => {
    if (!user || !selectedPoolArtist || !currentSeasonPlayer) return;
    setIsPoolDrafting(true);
    try {
      await draftFromPoolMutation({
        seasonId: seasonId as Id<"seasons">,
        weekNumber: currentWeek,
        artistId: selectedPoolArtist,
        seasonPlayerId: currentSeasonPlayer._id as Id<"season_players">,
      });
      const artistName = poolArtists?.find((a) => a.artistId === selectedPoolArtist)?.artist?.name;
      toast.success(`Drafted ${artistName} from the pool!`);
      setSelectedPoolArtist(null);
      setShowPoolDraftConfirm(false);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Failed to draft from pool";
      toast.error(errorMsg);
    } finally {
      setIsPoolDrafting(false);
    }
  };

  // Handle completing evolution
  const handleCompleteEvolution = async () => {
    if (!user) return;
    setIsCompleting(true);
    try {
      await completeEvolutionMutation({
        seasonId: seasonId as Id<"seasons">,
        weekNumber: currentWeek,
        requesterId: user.id as Id<"users">,
      });
      toast.success("Roster evolution complete!");
      router.push(`/seasons/${seasonId}`);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Failed to complete";
      toast.error(errorMsg);
    } finally {
      setIsCompleting(false);
    }
  };

  // Check if current player has completed their cut
  const currentPlayerCutStatus = cutStatus?.cuts.find(
    (c) => c.seasonPlayerId === currentSeasonPlayer?._id
  );
  const hasCompletedCut = currentPlayerCutStatus?.completed ?? false;

  // Check if current player is the prompt picker (last place)
  const isPromptPicker =
    evolutionState?.promptPickerId?.toString() === currentSeasonPlayer?._id?.toString();

  // Check if it's current player's turn to draft
  const isMyTurnToDraft =
    evolutionState?.currentPhase === "REDRAFT" &&
    evolutionState.redraftOrder[evolutionState.currentRedraftIndex]?.toString() ===
    currentSeasonPlayer?._id?.toString();

  // Check if it's current player's turn for pool draft
  const isMyTurnForPoolDraft =
    evolutionState?.currentPhase === "POOL_DRAFT" &&
    evolutionState.poolDraftOrder[evolutionState.currentPoolDraftIndex]?.toString() ===
    currentSeasonPlayer?._id?.toString();

  // Get selected pool artist details
  const selectedPoolArtistDetails = poolArtists?.find(
    (a) => a.artistId === selectedPoolArtist
  );

  // Get prompt picker player info
  const promptPickerPlayer = seasonPlayers?.find(
    (p) => p._id.toString() === evolutionState?.promptPickerId?.toString()
  );

  // Get selected prompt details
  const selectedPromptDetails = availablePrompts?.allOpenPrompts.find(
    (p) => p._id === selectedPromptId
  );

  // Find selected artist details for confirmation dialog
  const selectedArtist = playerRoster?.find(
    (r) => r.artist?._id === selectedArtistForCut
  );

  if (!season || !seasonPlayers) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  // If not in ROSTER_EVOLUTION phase
  if (season.currentPhase !== "ROSTER_EVOLUTION") {
    return (
      <div className="min-h-screen bg-gray-50 p-4">
        <div className="max-w-2xl mx-auto text-center py-12">
          <h1 className="text-2xl font-bold mb-4">Roster Evolution</h1>
          <p className="text-gray-500 mb-6">
            Roster evolution is not currently active. The season is in the{" "}
            <span className="font-medium">{season.currentPhase}</span> phase.
          </p>
          <Button asChild variant="outline">
            <Link href={`/seasons/${seasonId}`}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Dashboard
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  // If evolution not initialized yet
  if (!evolutionState) {
    return (
      <div className="min-h-screen bg-gray-50 p-4">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center gap-3 mb-6">
            <Link
              href={`/seasons/${seasonId}`}
              className="p-1.5 hover:bg-gray-200 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <h1 className="text-2xl font-bold">Week {currentWeek} — Roster Evolution</h1>
          </div>

          {isCommissioner ? (
            <Card className="p-6 text-center">
              <h2 className="text-lg font-semibold mb-2">Initialize Roster Evolution</h2>
              <p className="text-gray-500 mb-4">
                Start the roster evolution process for Week {currentWeek}.
              </p>
              <Button
                onClick={handleInitializeEvolution}
                disabled={isInitializing}
              >
                {isInitializing ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Initializing...
                  </>
                ) : (
                  "Start Roster Evolution"
                )}
              </Button>
            </Card>
          ) : (
            <Card className="p-6 text-center">
              <p className="text-gray-500">
                Waiting for commissioner to start roster evolution...
              </p>
            </Card>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Link
            href={`/seasons/${seasonId}`}
            className="p-1.5 hover:bg-gray-200 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="flex-1">
            <h1 className="text-2xl font-bold">
              Week {currentWeek} — Roster Evolution
            </h1>
            <p className="text-sm text-gray-500">
              {evolutionState.weekType === "CHAOS" ? "Chaos Week" : "Growth Week"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`px-3 py-1 rounded-full text-sm font-medium ${evolutionState.currentPhase === "SELF_CUT"
                ? "bg-red-100 text-red-700"
                : evolutionState.currentPhase === "PROMPT_SELECTION"
                  ? "bg-purple-100 text-purple-700"
                  : evolutionState.currentPhase === "REDRAFT"
                    ? "bg-green-100 text-green-700"
                    : evolutionState.currentPhase === "POOL_DRAFT"
                      ? "bg-blue-100 text-blue-700"
                      : evolutionState.currentPhase === "COMPLETE"
                        ? "bg-gray-100 text-gray-700"
                        : "bg-gray-100 text-gray-700"
                }`}
            >
              {evolutionState.currentPhase === "SELF_CUT"
                ? "✂️ Cuts"
                : evolutionState.currentPhase === "PROMPT_SELECTION"
                  ? "🎯 Prompt Selection"
                  : evolutionState.currentPhase === "REDRAFT"
                    ? "📝 Redraft"
                    : evolutionState.currentPhase === "POOL_DRAFT"
                      ? "🎱 Pool Draft"
                      : evolutionState.currentPhase === "COMPLETE"
                        ? "✅ Complete"
                        : evolutionState.currentPhase}
            </span>
          </div>
        </div>

        {/* Phase Progress */}
        <div className="flex items-center gap-2 mb-6">
          <div className="flex-1 flex flex-col items-center gap-1">
            <div
              className={`w-full h-2 rounded-full ${evolutionState.currentPhase === "SELF_CUT" ||
                evolutionState.currentPhase === "PROMPT_SELECTION" ||
                evolutionState.currentPhase === "REDRAFT" ||
                evolutionState.currentPhase === "POOL_DRAFT" ||
                evolutionState.currentPhase === "COMPLETE"
                ? "bg-red-500"
                : "bg-gray-200"
                }`}
            />
            <span className="text-xs text-gray-500">Cut {evolutionState.cutsRequired[0]?.selfCutCount ?? 1}</span>
          </div>
          <div className="flex-1 flex flex-col items-center gap-1">
            <div
              className={`w-full h-2 rounded-full ${evolutionState.currentPhase === "PROMPT_SELECTION" ||
                evolutionState.currentPhase === "REDRAFT" ||
                evolutionState.currentPhase === "POOL_DRAFT" ||
                evolutionState.currentPhase === "COMPLETE"
                ? "bg-purple-500"
                : "bg-gray-200"
                }`}
            />
            <span className="text-xs text-gray-500">Pick Prompt</span>
          </div>
          <div className="flex-1 flex flex-col items-center gap-1">
            <div
              className={`w-full h-2 rounded-full ${evolutionState.currentPhase === "REDRAFT" ||
                evolutionState.currentPhase === "POOL_DRAFT" ||
                evolutionState.currentPhase === "COMPLETE"
                ? "bg-green-500"
                : "bg-gray-200"
                }`}
            />
            <span className="text-xs text-gray-500">Redraft {evolutionState.redraftsPerPlayer}</span>
          </div>
          {evolutionState.includesPoolDraft && (
            <div className="flex-1 flex flex-col items-center gap-1">
              <div
                className={`w-full h-2 rounded-full ${evolutionState.currentPhase === "POOL_DRAFT" ||
                  evolutionState.currentPhase === "COMPLETE"
                  ? "bg-blue-500"
                  : "bg-gray-200"
                  }`}
              />
              <span className="text-xs text-gray-500">Pool Pick</span>
            </div>
          )}
          <div className="flex-1 flex flex-col items-center gap-1">
            <div
              className={`w-full h-2 rounded-full ${evolutionState.currentPhase === "COMPLETE"
                ? "bg-gray-500"
                : "bg-gray-200"
                }`}
            />
            <span className="text-xs text-gray-500">Done</span>
          </div>
        </div>

        {/* SELF_CUT Phase */}
        {evolutionState.currentPhase === "SELF_CUT" && (
          <div className="space-y-4">
            {/* Cut Status */}
            <Card className="p-4">
              <h2 className="font-semibold mb-3 flex items-center gap-2">
                <Scissors className="w-4 h-4 text-red-600" />
                Cut Status
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {cutStatus?.cuts.map((cut) => (
                  <div
                    key={cut.seasonPlayerId}
                    className={`p-2 rounded-lg text-center ${cut.completed
                      ? "bg-green-50 border border-green-200"
                      : "bg-gray-50 border border-gray-200"
                      }`}
                  >
                    <p className="text-sm font-medium truncate">
                      {cut.player?.labelName}
                    </p>
                    <p className="text-xs text-gray-500">
                      {cut.completed ? (
                        <span className="text-green-600 flex items-center justify-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> Done
                        </span>
                      ) : (
                        <span className="text-gray-400 flex items-center justify-center gap-1">
                          <Clock className="w-3 h-3" /> Pending
                        </span>
                      )}
                    </p>
                  </div>
                ))}
              </div>
            </Card>

            {/* Your Cut Section */}
            {!hasCompletedCut && playerRoster && (
              <Card className="p-4">
                <h2 className="font-semibold mb-3">
                  Select {currentPlayerCutStatus?.selfCutCount ?? 1} Artist to Cut
                </h2>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {playerRoster.map((entry) => (
                    <button
                      key={entry._id}
                      onClick={() => {
                        setSelectedArtistForCut(entry.artist?._id ?? null);
                        setShowCutConfirmDialog(true);
                      }}
                      className={`p-3 rounded-lg border-2 text-left transition-all hover:border-red-400 hover:bg-red-50 ${selectedArtistForCut === entry.artist?._id
                        ? "border-red-500 bg-red-50"
                        : "border-gray-200"
                        }`}
                    >
                      <p className="font-medium text-sm truncate">
                        {entry.artist?.name ?? "Unknown"}
                      </p>
                    </button>
                  ))}
                </div>
              </Card>
            )}

            {/* Already Cut */}
            {hasCompletedCut && (
              <Card className="p-6 text-center bg-green-50 border-green-200">
                <CheckCircle2 className="w-8 h-8 text-green-600 mx-auto mb-2" />
                <p className="font-medium text-green-800">You've completed your cut!</p>
                <p className="text-sm text-green-600">Waiting for other players...</p>
              </Card>
            )}

            {/* Commissioner: Cut for Other Players */}
            {isCommissioner && (
              <Card className="p-4 border-2 border-amber-300 bg-amber-50">
                <h2 className="font-semibold mb-3 text-amber-900">🛡️ Commissioner: Cut for Player</h2>
                <p className="text-sm text-amber-700 mb-4">
                  Select a player who hasn't completed their cut, then choose which artist to cut.
                </p>

                {/* Player Selection */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-amber-800 mb-2">
                    Select Player
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {cutStatus?.cuts
                      .filter((cut) => !cut.completed)
                      .map((cut) => (
                        <button
                          key={cut.seasonPlayerId}
                          onClick={() => {
                            setCommissionerCutPlayerId(cut.seasonPlayerId as Id<"season_players">);
                            setCommissionerSelectedArtist(null);
                          }}
                          className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${commissionerCutPlayerId === cut.seasonPlayerId
                            ? "bg-amber-600 text-white"
                            : "bg-white border border-amber-300 text-amber-800 hover:bg-amber-100"
                            }`}
                        >
                          {cut.player?.labelName}
                        </button>
                      ))}
                    {cutStatus?.cuts.filter((c) => !c.completed).length === 0 && (
                      <p className="text-sm text-amber-600 italic">All players have completed their cuts.</p>
                    )}
                  </div>
                </div>

                {/* Artist Selection for Selected Player */}
                {commissionerCutPlayerId && commissionerPlayerRoster && (
                  <div>
                    <label className="block text-sm font-medium text-amber-800 mb-2">
                      Select Artist to Cut for {seasonPlayers?.find(p => p._id === commissionerCutPlayerId)?.labelName}
                    </label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {commissionerPlayerRoster.map((entry) => (
                        <button
                          key={entry._id}
                          onClick={() => {
                            setCommissionerSelectedArtist(entry.artist?._id ?? null);
                            setShowCommissionerCutConfirm(true);
                          }}
                          className="p-3 rounded-lg border-2 text-left transition-all hover:border-red-400 hover:bg-red-50 border-gray-200"
                        >
                          <p className="font-medium text-sm truncate">
                            {entry.artist?.name ?? "Unknown"}
                          </p>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </Card>
            )}
          </div>
        )}

        {/* PROMPT_SELECTION Phase */}
        {evolutionState.currentPhase === "PROMPT_SELECTION" && (
          <div className="space-y-4">
            {/* Prompt Picker Info */}
            <Card className="p-4 bg-purple-50 border-purple-200">
              <h2 className="font-semibold mb-2 text-purple-900">
                🎯 Select Redraft Prompt
              </h2>
              <p className="text-sm text-purple-700">
                {currentSeasonPlayer?._id.toString() === evolutionState?.promptPickerId?.toString() ? (
                  <>
                    <span className="font-medium">Since you came in last this week, you get to choose the prompt!</span>{" "}
                    Select one from the board below — all players will draft artists matching it.
                  </>
                ) : promptPickerPlayer ? (
                  <>
                    <span className="font-medium">{promptPickerPlayer.labelName}</span> (last place this week) is selecting the prompt.
                    All players will draft artists matching their choice.
                  </>
                ) : (
                  "Select a prompt from the board below. All players will draft artists matching this prompt."
                )}
              </p>
            </Card>

            {/* Jeopardy Board */}
            {availablePrompts && availablePrompts.categories.length > 0 ? (
              <Card className="p-6">
                <h3 className="text-xl font-bold mb-4">Draft Prompt Board</h3>
                <div className="grid gap-2" style={{
                  gridTemplateColumns: `repeat(${availablePrompts.categories.length}, 1fr)`
                }}>
                  {/* Category Headers */}
                  {availablePrompts.categories.map((category: any) => (
                    <div key={category.id} className="font-bold text-center p-3 bg-gray-200 rounded-lg">
                      {category.title}
                    </div>
                  ))}

                  {/* Prompts Grid - Show prompts in rows */}
                  {Array.from({ length: 5 }).map((_, rowIndex) => (
                    availablePrompts.categories.map((category: any) => {
                      const prompt = category.prompts[rowIndex];
                      if (!prompt) return <div key={`${category.id}-${rowIndex}`} className="p-3"></div>;

                      const promptStatus = prompt.status || 'OPEN';
                      const isOpen = promptStatus === 'OPEN';
                      const isRetired = promptStatus === 'RETIRED' || promptStatus === 'SELECTED';
                      const isSelected = selectedPromptId === prompt._id;
                      const canSelect =
                        isOpen &&
                        ((currentSeasonPlayer?._id.toString() === evolutionState?.promptPickerId?.toString()) ||
                          isCommissioner);

                      return (
                        <button
                          key={prompt._id}
                          onClick={() => {
                            if (canSelect) {
                              setSelectedPromptId(prompt._id as Id<"draft_prompts">);
                              setShowPromptConfirm(true);
                            }
                          }}
                          disabled={!canSelect || isSelectingPrompt || isRetired}
                          className={`p-3 rounded-lg border-2 text-xs font-medium transition-all aspect-square flex flex-col items-center justify-center text-center ${isRetired
                            ? "bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed line-through opacity-50"
                            : isSelected
                              ? "bg-purple-600 text-white border-purple-700"
                              : canSelect
                                ? "bg-blue-50 border-blue-300 hover:bg-blue-100 cursor-pointer"
                                : "bg-gray-50 border-gray-300 cursor-not-allowed opacity-60"
                            }`}
                        >
                          <span className="line-clamp-3">{prompt.text}</span>
                        </button>
                      );
                    })
                  ))}
                </div>
              </Card>
            ) : (
              <Card className="p-6 text-center">
                <p className="text-gray-500">No available prompts found. Please set up a draft board first.</p>
              </Card>
            )}

            {/* Waiting message for non-prompt-picker players */}
            {currentSeasonPlayer?._id.toString() !== evolutionState?.promptPickerId?.toString() && !isCommissioner && (
              <Card className="p-6 text-center bg-gray-50">
                <Clock className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                <p className="text-gray-600">
                  Waiting for <span className="font-medium">{promptPickerPlayer?.labelName}</span> to select a prompt...
                </p>
              </Card>
            )}
          </div>
        )}

        {/* REDRAFT Phase */}
        {evolutionState.currentPhase === "REDRAFT" && (
          <div className="space-y-4">
            {/* Selected Prompt */}
            {evolutionState.selectedPrompt && (
              <Card className="p-4 bg-purple-50 border-purple-200">
                <p className="text-xs text-purple-600 font-medium uppercase tracking-wide mb-1">
                  This Week's Redraft Prompt
                </p>
                <p className="text-lg font-semibold text-purple-900">
                  {evolutionState.selectedPrompt.text}
                </p>
              </Card>
            )}

            {/* Draft Order */}
            <Card className="p-4">
              <h2 className="font-semibold mb-3 flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-green-600" />
                Redraft Order (Round {evolutionState.redraftRound})
              </h2>
              <div className="flex items-center gap-2 overflow-x-auto pb-2">
                {evolutionState.redraftOrder.map((playerId, index) => {
                  const playerName = evolutionState.players[playerId.toString()]?.labelName ?? "Player";
                  const isCurrent = index === evolutionState.currentRedraftIndex;
                  return (
                    <div
                      key={playerId}
                      className={`flex-shrink-0 px-3 py-2 rounded-lg text-sm ${isCurrent
                        ? "bg-green-600 text-white font-semibold"
                        : "bg-gray-100 text-gray-600"
                        }`}
                    >
                      {index + 1}. {playerName}
                    </div>
                  );
                })}
              </div>
            </Card>

            {/* Your Turn to Draft */}
            {isMyTurnToDraft && (
              <Card className="p-4 border-2 border-green-400 bg-green-50">
                <h2 className="font-semibold mb-3 text-green-800">Your Turn to Draft!</h2>
                <div className="flex gap-2">
                  <Input
                    placeholder="Enter artist name..."
                    value={draftArtistName}
                    onChange={(e) => setDraftArtistName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && draftArtistName.trim()) {
                        handleDraftArtist();
                      }
                    }}
                    disabled={isDrafting}
                  />
                  <Button
                    onClick={handleDraftArtist}
                    disabled={isDrafting || !draftArtistName.trim()}
                  >
                    {isDrafting ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      "Draft"
                    )}
                  </Button>
                </div>
              </Card>
            )}

            {/* Waiting for other player (non-commissioner) */}
            {!isMyTurnToDraft && !isCommissioner && (
              <Card className="p-6 text-center">
                <Clock className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                <p className="font-medium text-gray-600">
                  Waiting for {evolutionState.currentRedraftPlayer?.labelName ?? "..."} to draft
                </p>
              </Card>
            )}

            {/* Commissioner can draft on behalf of current player */}
            {!isMyTurnToDraft && isCommissioner && (
              <Card className="p-4 border-2 border-orange-300 bg-orange-50">
                <h2 className="font-semibold mb-2 text-orange-800">
                  {evolutionState.currentRedraftPlayer?.labelName ?? "..."}'s Turn
                </h2>
                <p className="text-sm text-orange-700 mb-3">
                  Draft on their behalf:
                </p>
                <div className="flex gap-2">
                  <Input
                    placeholder="Enter artist name..."
                    value={commissionerDraftArtistName}
                    onChange={(e) => setCommissionerDraftArtistName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && commissionerDraftArtistName.trim()) {
                        handleCommissionerDraft();
                      }
                    }}
                    disabled={isCommissionerDrafting}
                  />
                  <Button
                    onClick={handleCommissionerDraft}
                    disabled={isCommissionerDrafting || !commissionerDraftArtistName.trim()}
                    className="bg-orange-600 hover:bg-orange-700"
                  >
                    {isCommissionerDrafting ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      "Draft"
                    )}
                  </Button>
                </div>
              </Card>
            )}

            {/* Reference: All Rosters & Pool (Off-Limits) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
              {/* All Player Rosters */}
              <Card className="p-4">
                <h3 className="font-semibold text-sm mb-3 text-gray-700">
                  All Rosters (Off-Limits)
                </h3>
                <div className="space-y-3 max-h-80 overflow-y-auto">
                  {allPlayersRosters?.map((player) => (
                    <div key={player._id} className="border-b border-gray-100 pb-2 last:border-0">
                      <p className="text-xs font-medium text-gray-900 mb-1">{player.labelName}</p>
                      <div className="flex flex-wrap gap-1">
                        {player.roster
                          .filter((a) => a.status === 'ACTIVE')
                          .map((artist) => (
                            <span
                              key={artist._id}
                              className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded"
                            >
                              {artist.artistName}
                            </span>
                          ))}
                      </div>
                    </div>
                  ))}
                </div>
              </Card>

              {/* Pool Artists */}
              <Card className="p-4">
                <h3 className="font-semibold text-sm mb-3 text-gray-700">
                  The Pool ({poolArtists?.length ?? 0} artists)
                </h3>
                {poolArtists && poolArtists.length > 0 ? (
                  <div className="flex flex-wrap gap-1 max-h-80 overflow-y-auto">
                    {poolArtists.map((poolEntry) => (
                      <span
                        key={poolEntry._id}
                        className="text-xs bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded"
                      >
                        {poolEntry.artist?.name ?? "Unknown"}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-gray-400 italic">No artists in the pool yet</p>
                )}
              </Card>
            </div>
          </div>
        )}

        {/* POOL_DRAFT Phase */}
        {evolutionState.currentPhase === "POOL_DRAFT" && (
          <div className="space-y-4">
            {/* Header */}
            <Card className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold">
                  🎱 Pool Draft — {evolutionState.currentPoolDraftPlayer?.labelName}&apos;s Pick
                </h2>
                <span className="text-sm text-gray-500">
                  Pick {evolutionState.currentPoolDraftIndex + 1} of {evolutionState.poolDraftOrder.length}
                </span>
              </div>

              {/* Draft Order */}
              <div className="flex gap-2 flex-wrap mb-4">
                {evolutionState.poolDraftOrder.map((playerId, idx) => {
                  const player = Object.values(evolutionState.players).find(
                    (p) => p?._id?.toString() === playerId?.toString()
                  );
                  const isCurrent = idx === evolutionState.currentPoolDraftIndex;
                  const isComplete = idx < evolutionState.currentPoolDraftIndex;
                  return (
                    <span
                      key={playerId ?? idx}
                      className={`px-3 py-1 rounded text-sm font-medium ${
                        isCurrent
                          ? "bg-blue-600 text-white"
                          : isComplete
                            ? "bg-green-100 text-green-700"
                            : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {idx + 1}. {player?.labelName ?? "Unknown"}
                      {isComplete && " ✓"}
                    </span>
                  );
                })}
              </div>

              {/* Current picker message */}
              {isMyTurnForPoolDraft ? (
                <p className="text-blue-600 font-medium">
                  It&apos;s your turn! Select an artist from the pool below.
                </p>
              ) : (
                <p className="text-gray-500">
                  Waiting for {evolutionState.currentPoolDraftPlayer?.labelName} to make their pick...
                </p>
              )}
            </Card>

            {/* Pool Artist Grid */}
            <Card className="p-6">
              <h3 className="font-semibold text-lg mb-4">
                Available Pool Artists ({poolArtists?.length ?? 0})
              </h3>
              {poolArtists && poolArtists.length > 0 ? (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  {poolArtists.map((poolEntry) => {
                    const isSelected = selectedPoolArtist === poolEntry.artistId;
                    const canSelect = isMyTurnForPoolDraft || isCommissioner;
                    return (
                      <button
                        key={poolEntry._id}
                        onClick={() => {
                          if (canSelect) {
                            setSelectedPoolArtist(poolEntry.artistId);
                            setShowPoolDraftConfirm(true);
                          }
                        }}
                        disabled={!canSelect}
                        className={`p-3 rounded-lg border text-left transition-all ${
                          isSelected
                            ? "border-blue-500 bg-blue-50 ring-2 ring-blue-200"
                            : canSelect
                              ? "border-gray-200 hover:border-blue-300 hover:bg-gray-50 cursor-pointer"
                              : "border-gray-200 bg-gray-50 opacity-60 cursor-not-allowed"
                        }`}
                      >
                        <p className="font-medium text-gray-900 truncate">
                          {poolEntry.artist?.name ?? "Unknown"}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">
                          Cut from {poolEntry.cutFromPlayer?.labelName ?? "Unknown"} (Week {poolEntry.enteredPoolWeek})
                        </p>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <p>No artists available in the pool.</p>
                </div>
              )}
            </Card>

            {/* Commissioner override message */}
            {isCommissioner && !isMyTurnForPoolDraft && (
              <p className="text-sm text-gray-500 text-center">
                As commissioner, you can draft on behalf of the current picker.
              </p>
            )}
          </div>
        )}

        {/* Pool Draft Confirmation Dialog */}
        <Dialog open={showPoolDraftConfirm} onOpenChange={setShowPoolDraftConfirm}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Confirm Pool Draft</DialogTitle>
              <DialogDescription>
                {isMyTurnForPoolDraft
                  ? `You are drafting "${selectedPoolArtistDetails?.artist?.name}" from the pool.`
                  : `You are drafting "${selectedPoolArtistDetails?.artist?.name}" on behalf of ${evolutionState.currentPoolDraftPlayer?.labelName}.`}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setShowPoolDraftConfirm(false);
                  setSelectedPoolArtist(null);
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={handlePoolDraft}
                disabled={isPoolDrafting}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {isPoolDrafting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    Drafting...
                  </>
                ) : (
                  "Confirm Draft"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* COMPLETE Phase */}
        {evolutionState.currentPhase === "COMPLETE" && (
          <div className="space-y-4">
            <Card className="p-6 text-center bg-green-50 border-green-200">
              <CheckCircle2 className="w-12 h-12 text-green-600 mx-auto mb-3" />
              <h2 className="text-xl font-bold text-green-800 mb-2">
                Roster Evolution Complete!
              </h2>
              <p className="text-green-600 mb-4">
                All cuts and redrafts have been completed for Week {currentWeek}.
              </p>
              {isCommissioner && (
                <Button
                  onClick={() => setShowAdvanceWeekConfirm(true)}
                  disabled={isCompleting}
                  className="bg-green-600 hover:bg-green-700"
                >
                  Continue to Next Week →
                </Button>
              )}
            </Card>

            {/* All Rosters Grid */}
            {allPlayersRosters && (
              <div className="overflow-x-auto">
                <div
                  className="grid gap-2"
                  style={{
                    gridTemplateColumns: `repeat(${allPlayersRosters.length}, minmax(180px, 1fr))`,
                  }}
                >
                  {allPlayersRosters.map((player) => (
                    <div
                      key={player._id}
                      className="bg-white rounded border border-gray-200 overflow-hidden flex flex-col"
                    >
                      {/* Player Header */}
                      <div className="bg-indigo-50 border-b border-gray-200 p-2">
                        <h2 className="font-bold text-sm text-gray-900 truncate">
                          {player.labelName}
                        </h2>
                        <p className="text-xs text-gray-600 truncate">{player.displayName}</p>
                        <div className="flex items-center justify-between text-xs text-gray-500 mt-1">
                          <span>{player.roster.filter(a => a.status === 'ACTIVE').length} active</span>
                          <span className="font-semibold text-indigo-600">{player.totalPoints}pts</span>
                        </div>
                      </div>

                      {/* Artist List */}
                      <div className="flex-1 flex flex-col divide-y divide-gray-100">
                        {player.roster.map((artist) => {
                          const isCutThisWeek = artist.cutAtWeek === currentWeek;
                          const isNew = artist.acquiredAtWeek === currentWeek && (artist.acquiredVia === 'POOL' || artist.acquiredVia === 'DRAFT');

                          return (
                            <div
                              key={artist._id}
                              className={`p-2 flex items-center justify-between gap-2 ${isCutThisWeek ? 'bg-red-50 opacity-60' : ''
                                }`}
                            >
                              <p className={`text-xs font-medium truncate flex-1 ${isCutThisWeek ? 'text-red-600 line-through' : 'text-gray-900'
                                }`}>
                                {artist.artistName}
                              </p>
                              <div className="flex gap-1 flex-shrink-0">
                                {isCutThisWeek && (
                                  <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700">
                                    Cut
                                  </span>
                                )}
                                {isNew && (
                                  <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700">
                                    New
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Cut Confirmation Dialog */}
      <Dialog open={showCutConfirmDialog} onOpenChange={setShowCutConfirmDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Cut</DialogTitle>
            <DialogDescription>
              Are you sure you want to cut{" "}
              <span className="font-semibold">{selectedArtist?.artist?.name}</span>?
              They will enter the Pool and can be drafted by any player.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              onClick={() => setShowCutConfirmDialog(false)}
              variant="outline"
              disabled={isCutting}
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirmCut}
              variant="destructive"
              disabled={isCutting}
            >
              {isCutting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Cutting...
                </>
              ) : (
                <>
                  <Scissors className="w-4 h-4 mr-2" />
                  Cut Artist
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Commissioner Cut Confirmation Dialog */}
      <Dialog open={showCommissionerCutConfirm} onOpenChange={setShowCommissionerCutConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Commissioner: Confirm Cut</DialogTitle>
            <DialogDescription>
              Cut{" "}
              <span className="font-semibold">
                {commissionerPlayerRoster?.find(r => r.artist?._id === commissionerSelectedArtist)?.artist?.name}
              </span>{" "}
              from{" "}
              <span className="font-semibold">
                {seasonPlayers?.find(p => p._id === commissionerCutPlayerId)?.labelName}
              </span>'s roster?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              onClick={() => setShowCommissionerCutConfirm(false)}
              variant="outline"
              disabled={isCommissionerCutting}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCommissionerCut}
              variant="destructive"
              disabled={isCommissionerCutting}
            >
              {isCommissionerCutting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Cutting...
                </>
              ) : (
                <>
                  <Scissors className="w-4 h-4 mr-2" />
                  Cut Artist
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Prompt Selection Confirmation Dialog */}
      <Dialog open={showPromptConfirm} onOpenChange={setShowPromptConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Prompt Selection</DialogTitle>
            <DialogDescription>
              Select this prompt for the redraft phase?
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="p-4 bg-purple-50 border border-purple-200 rounded-lg">
              <p className="font-semibold text-purple-900">
                {availablePrompts?.allOpenPrompts.find(p => p._id === selectedPromptId)?.text}
              </p>
            </div>
            <p className="text-sm text-gray-600 mt-4">
              All players will draft artists matching this prompt during the redraft phase.
            </p>
          </div>
          <DialogFooter>
            <Button
              onClick={() => setShowPromptConfirm(false)}
              variant="outline"
              disabled={isSelectingPrompt}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSelectPrompt}
              disabled={isSelectingPrompt}
              className="bg-purple-600 hover:bg-purple-700"
            >
              {isSelectingPrompt ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Selecting...
                </>
              ) : (
                "Select Prompt"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Advance to Next Week Confirmation Dialog */}
      <Dialog open={showAdvanceWeekConfirm} onOpenChange={setShowAdvanceWeekConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Continue to Next Week?</DialogTitle>
            <DialogDescription>
              This will advance the season to Week {currentWeek + 1} and begin challenge selection.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-gray-600">
              Once you continue, Week {currentWeek} roster evolution will be finalized and cannot be changed.
            </p>
          </div>
          <DialogFooter>
            <Button
              onClick={() => setShowAdvanceWeekConfirm(false)}
              variant="outline"
              disabled={isCompleting}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                setShowAdvanceWeekConfirm(false);
                handleCompleteEvolution();
              }}
              disabled={isCompleting}
              className="bg-green-600 hover:bg-green-700"
            >
              {isCompleting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Advancing...
                </>
              ) : (
                "Continue to Week " + (currentWeek + 1)
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

