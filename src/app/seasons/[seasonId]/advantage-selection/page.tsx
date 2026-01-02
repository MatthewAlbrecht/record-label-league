'use client';

import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation } from 'convex/react';
import { api } from 'convex/_generated/api';
import type { Id } from 'convex/_generated/dataModel';
import { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '~/components/ui/button';
import { Card } from '~/components/ui/card';
import { useAuth } from '~/lib/auth-context';
import { toast } from 'sonner';
import AdvantageBoard from './components/advantage-board';
import PlayerList from './components/player-list';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog';

export default function AdvantageSelectionPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const seasonId = (params?.seasonId as string) || '';

  // First, check what kind of selection we need
  const pendingSelections = useQuery(api.inventory.getPendingAdvantageSelections, {
    seasonId: seasonId as Id<'seasons'>,
  });

  const season = useQuery(api.seasons.getSeason, {
    seasonId: seasonId as Id<'seasons'>,
  });

  const isCommissioner = season?.league?.commissioner?.id === user?.id;

  // Based on pending selections, determine what to render
  if (pendingSelections === undefined) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  if (!isCommissioner) {
    return (
      <main className="mx-auto max-w-7xl px-4 py-10">
        <p className="text-red-500">Only the commissioner can access this page</p>
        <Button onClick={() => router.push('/')} className="mt-4">
          Back to Dashboard
        </Button>
      </main>
    );
  }

  if (pendingSelections === null) {
    return (
      <main className="mx-auto max-w-7xl px-4 py-10">
        <Card className="p-6 bg-gray-50 border-gray-200">
          <div className="text-center">
            <p className="text-xl font-semibold text-gray-900 mb-3">
              ✅ No Pending Selections
            </p>
            <p className="text-gray-600 mb-6">
              All advantages have been selected. There are no pending selections at this time.
            </p>
            <Button onClick={() => router.push(`/seasons/${seasonId}/results/${season?.currentWeek || 1}`)} variant="outline">
              Back to Results
            </Button>
          </div>
        </Card>
      </main>
    );
  }

  // Render the appropriate selection view
  if (pendingSelections.mode === 'starting') {
    return <StartingAdvantageSelection seasonId={seasonId as Id<'seasons'>} />;
  }

  return (
    <WeeklyAdvantageSelection
      seasonId={seasonId as Id<'seasons'>}
      weekNumber={pendingSelections.weekNumber!}
    />
  );
}

// Component for starting advantage selection (pre-season)
function StartingAdvantageSelection({ seasonId }: { seasonId: Id<'seasons'> }) {
  const router = useRouter();
  const { user } = useAuth();

  const selectionState = useQuery(api.inventory.getAdvantageSelectionState, { seasonId });
  const season = useQuery(api.seasons.getSeason, { seasonId });

  const assignStartingAdvantage = useMutation(api.inventory.assignStartingAdvantage);
  const resetAllAdvantages = useMutation(api.inventory.resetAllStartingAdvantages);
  const startSeason = useMutation(api.seasons.startSeason);

  const [currentPlayerIndex, setCurrentPlayerIndex] = useState(0);
  const [isAssigning, setIsAssigning] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [error, setError] = useState('');
  const [currentRound, setCurrentRound] = useState<{ tier: number; round: number } | null>(null);

  const currentPlayer = selectionState?.players[currentPlayerIndex];
  const config = selectionState?.config || { tier1Count: 2, tier2Count: 1, tier3Count: 0 };

  // Calculate current round based on player progress
  useEffect(() => {
    if (!selectionState) return;

    for (let tier = 1; tier <= 3; tier++) {
      const tierCount = tier === 1 ? config.tier1Count : tier === 2 ? config.tier2Count : config.tier3Count;

      for (let round = 1; round <= tierCount; round++) {
        const allPlayersCompletedRound = selectionState.players.every((player) => {
          const assignment = selectionState.playerAssignments.find(
            (pa) => pa.playerId === player._id
          );
          if (!assignment) return false;
          const tierAdvantages = assignment.assignedAdvantages.filter(a => a.tier === tier);
          return tierAdvantages.length >= round;
        });

        if (!allPlayersCompletedRound) {
          setCurrentRound({ tier, round });
          return;
        }
      }
    }
    setCurrentRound(null);
  }, [selectionState, config]);

  // Set initial player index to first player who needs to select in current round
  useEffect(() => {
    if (!selectionState || !currentRound) return;

    const firstIncompletePlayerIndex = selectionState.players.findIndex((player) => {
      const assignment = selectionState.playerAssignments.find(
        (pa) => pa.playerId === player._id
      );
      if (!assignment) return true;
      const tierAdvantages = assignment.assignedAdvantages.filter(a => a.tier === currentRound.tier);
      return tierAdvantages.length < currentRound.round;
    });

    if (firstIncompletePlayerIndex !== -1) {
      setCurrentPlayerIndex(firstIncompletePlayerIndex);
    }
  }, [currentRound, selectionState]);

  const handleAssignAdvantage = async (advantageCode: string) => {
    if (!currentPlayer || !selectionState || !currentRound) return;

    try {
      setIsAssigning(true);
      setError('');

      await assignStartingAdvantage({
        seasonPlayerId: currentPlayer._id,
        advantageCode,
        requestingUserId: user?.id as Id<'users'>,
      });

      toast.success(`Assigned to ${currentPlayer.labelName}`);

      // Find next player who needs to select in this round
      const nextPlayerIndex = selectionState.players.findIndex((player, index) => {
        if (index <= currentPlayerIndex) return false;
        const assignment = selectionState.playerAssignments.find(
          (pa) => pa.playerId === player._id
        );
        if (!assignment) return true;
        const tierAdvantages = assignment.assignedAdvantages.filter(a => a.tier === currentRound.tier);
        return tierAdvantages.length < currentRound.round;
      });

      if (nextPlayerIndex !== -1) {
        setCurrentPlayerIndex(nextPlayerIndex);
      } else {
        toast.success(`Tier ${currentRound.tier} Round ${currentRound.round} complete!`);
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to assign advantage';
      setError(errorMsg);
      toast.error(errorMsg);
    } finally {
      setIsAssigning(false);
    }
  };

  const handleResetAllAdvantages = async () => {
    try {
      setIsResetting(true);
      setError('');
      await resetAllAdvantages({
        seasonId,
        requestingUserId: user?.id as Id<'users'>,
      });

      toast.success('All starting advantages reset!');
      setShowResetDialog(false);
      setCurrentPlayerIndex(0);
      setCurrentRound({ tier: 1, round: 1 });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to reset advantages';
      setError(errorMsg);
      toast.error(errorMsg);
    } finally {
      setIsResetting(false);
    }
  };

  const handleStartSeason = async () => {
    try {
      setIsStarting(true);
      setError('');
      await startSeason({
        seasonId,
        requesterId: user?.id as Id<'users'>,
      });

      toast.success('Season started! Entering challenge selection...');
      setTimeout(() => {
        router.push(`/seasons/${seasonId}/challenge-select`);
      }, 1000);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to start season';
      setError(errorMsg);
      toast.error(errorMsg);
    } finally {
      setIsStarting(false);
    }
  };

  if (!selectionState) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  const allPlayersAssigned = selectionState.players.every((player) => {
    const assignment = selectionState.playerAssignments.find(
      (pa) => pa.playerId === player._id
    );
    if (!assignment) return false;
    return (
      assignment.tier1Count >= config.tier1Count &&
      assignment.tier2Count >= config.tier2Count &&
      assignment.tier3Count >= config.tier3Count
    );
  });

  return (
    <main className="mx-auto max-w-7xl px-4 py-10">
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="font-semibold text-3xl">{season?.name} - Starting Advantage Selection</h1>
          <p className="mt-2 text-gray-600">
            Assign advantages to each player: {config.tier1Count} Tier 1, {config.tier2Count} Tier 2
            {config.tier3Count > 0 ? `, ${config.tier3Count} Tier 3` : ''}
          </p>
        </div>
        <Button
          onClick={() => setShowResetDialog(true)}
          variant="destructive"
          size="sm"
          className="mt-2"
          disabled={isResetting || isAssigning}
        >
          🔧 Reset All
        </Button>
      </div>

      {error && (
        <div className="mb-6 rounded-lg border border-red-300 bg-red-50 p-4">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="order-first lg:order-last lg:col-span-1">
          <PlayerList
            players={selectionState.players}
            playerAssignments={selectionState.playerAssignments}
            currentPlayerIndex={currentPlayerIndex}
            onSelectPlayer={setCurrentPlayerIndex}
            config={config}
            currentRound={currentRound}
          />
        </div>

        <div className="lg:col-span-3 space-y-6 order-last lg:order-first">
          {currentPlayer && currentRound && (() => {
            const assignment = selectionState.playerAssignments.find(
              (pa) => pa.playerId === currentPlayer._id
            );
            const currentRoundAdvantages = assignment?.assignedAdvantages.filter(a => a.tier === currentRound.tier) || [];
            const currentRoundSelection = currentRoundAdvantages[currentRound.round - 1];

            return (
              <Card className="p-6 bg-gradient-to-r from-yellow-50 to-amber-50 border-2 border-yellow-300">
                <h2 className="text-2xl font-bold text-yellow-900">
                  🎯 Assigning to: {currentPlayer.labelName}
                </h2>
                <p className="text-yellow-800 mt-2">
                  {currentPlayer.user?.displayName || currentPlayer.labelName}, select Tier {currentRound.tier} Round {currentRound.round}
                </p>
                {currentRoundSelection && (
                  <p className="text-yellow-700 mt-2 text-sm">
                    Already selected: {currentRoundSelection.name} ({currentRoundSelection.code})
                  </p>
                )}
              </Card>
            );
          })()}

          {currentRound && currentPlayer && (() => {
            const assignment = selectionState.playerAssignments.find(
              (pa) => pa.playerId === currentPlayer._id
            );
            const currentRoundAdvantages = assignment?.assignedAdvantages.filter(a => a.tier === currentRound.tier) || [];
            const currentRoundSelection = currentRoundAdvantages[currentRound.round - 1];
            const currentSelections = currentRoundSelection ? [currentRoundSelection.code] : [];

            const advantages = currentRound.tier === 1
              ? selectionState.tier1Advantages
              : currentRound.tier === 2
                ? selectionState.tier2Advantages
                : selectionState.tier3Advantages;

            if (!advantages || advantages.length === 0) return null;

            return (
              <AdvantageBoard
                tier={currentRound.tier}
                advantages={advantages}
                maxSelections={1}
                currentSelections={currentSelections}
                onSelectAdvantage={(code: string) => handleAssignAdvantage(code)}
                isLoading={isAssigning}
                disabled={!currentPlayer}
              />
            );
          })()}

          <div className="flex gap-4 justify-between">
            <Button
              onClick={() => setCurrentPlayerIndex(Math.max(0, currentPlayerIndex - 1))}
              variant="outline"
              disabled={currentPlayerIndex === 0 || isAssigning}
            >
              ← Previous Player
            </Button>

            <div className="text-center">
              <p className="text-sm text-gray-600">
                Player {currentPlayerIndex + 1} of {selectionState.players.length}
              </p>
              {currentRound && (
                <p className="text-xs text-gray-500 mt-1">
                  Tier {currentRound.tier} Round {currentRound.round}
                </p>
              )}
            </div>

            <Button
              onClick={() =>
                setCurrentPlayerIndex(Math.min(selectionState.players.length - 1, currentPlayerIndex + 1))
              }
              variant="outline"
              disabled={currentPlayerIndex === selectionState.players.length - 1 || isAssigning}
            >
              Next Player →
            </Button>
          </div>

          {allPlayersAssigned && (
            <Card className="p-6 bg-gradient-to-r from-green-50 to-emerald-50 border-2 border-green-300">
              <div className="text-center">
                <p className="text-2xl font-bold text-green-900 mb-3">
                  ✅ Advantage Selection Complete!
                </p>
                <p className="text-green-800 mb-6">
                  All players have been assigned their starting advantages. Ready to begin the season!
                </p>
                <div className="flex gap-4 justify-center">
                  <Button
                    onClick={handleStartSeason}
                    disabled={isStarting}
                    className="bg-blue-600 hover:bg-blue-700 text-white"
                    size="lg"
                  >
                    {isStarting ? '🚀 Starting Season...' : '🚀 Start Season'}
                  </Button>
                  <Button onClick={() => router.push(`/seasons/${seasonId}`)} variant="outline">
                    Back to Season
                  </Button>
                </div>
              </div>
            </Card>
          )}
        </div>
      </div>

      <Dialog open={showResetDialog} onOpenChange={setShowResetDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset All Advantages?</DialogTitle>
            <DialogDescription>
              This will clear all starting advantages for every player in this season. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setShowResetDialog(false)} variant="outline" disabled={isResetting}>
              Cancel
            </Button>
            <Button
              onClick={handleResetAllAdvantages}
              disabled={isResetting}
              className="bg-red-600 hover:bg-red-700"
            >
              {isResetting ? '⏳ Resetting...' : 'Yes, Reset All'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}

// Component for weekly advantage selection (in-season)
function WeeklyAdvantageSelection({
  seasonId,
  weekNumber,
}: {
  seasonId: Id<'seasons'>;
  weekNumber: number;
}) {
  const router = useRouter();
  const { user } = useAuth();

  const selectionState = useQuery(api.inventory.getWeeklyAdvantageSelectionState, {
    seasonId,
    weekNumber,
  });
  const season = useQuery(api.seasons.getSeason, { seasonId });

  const assignWeeklyAdvantage = useMutation(api.inventory.assignWeeklyAdvantage);

  const [currentPlayerIndex, setCurrentPlayerIndex] = useState(0);
  const [isAssigning, setIsAssigning] = useState(false);
  const [error, setError] = useState('');

  // Find first player with pending awards
  useEffect(() => {
    if (!selectionState) return;

    const firstPlayerWithPending = selectionState.players.findIndex((player) => {
      const assignment = selectionState.playerAssignments.find(
        (pa) => pa.playerId === player._id
      );
      return assignment && 'pendingAwards' in assignment && assignment.pendingAwards.length > 0;
    });

    if (firstPlayerWithPending !== -1) {
      setCurrentPlayerIndex(firstPlayerWithPending);
    }
  }, [selectionState]);

  const currentPlayer = selectionState?.players[currentPlayerIndex];

  const handleAssignAdvantage = async (advantageCode: string, awardId: Id<'advantage_awards'>) => {
    if (!currentPlayer || !selectionState) return;

    try {
      setIsAssigning(true);
      setError('');

      await assignWeeklyAdvantage({
        awardId,
        advantageCode,
        requestingUserId: user?.id as Id<'users'>,
      });

      toast.success(`Assigned ${advantageCode} to ${currentPlayer.labelName}`);

      // Move to next player with pending awards after a short delay (to allow state to update)
      setTimeout(() => {
        const nextPlayerIndex = selectionState.players.findIndex((player, index) => {
          if (index <= currentPlayerIndex) return false;
          const assignment = selectionState.playerAssignments.find(
            (pa) => pa.playerId === player._id
          );
          return assignment && 'pendingAwards' in assignment && assignment.pendingAwards.length > 0;
        });

        if (nextPlayerIndex !== -1) {
          setCurrentPlayerIndex(nextPlayerIndex);
        }
      }, 100);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to assign advantage';
      setError(errorMsg);
      toast.error(errorMsg);
    } finally {
      setIsAssigning(false);
    }
  };

  if (!selectionState) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  // Check if all selections are complete
  const allSelectionsComplete = selectionState.players.every((player) => {
    const assignment = selectionState.playerAssignments.find(
      (pa) => pa.playerId === player._id
    );
    return !assignment || !('pendingAwards' in assignment) || assignment.pendingAwards.length === 0;
  });

  // Get current player's pending awards
  const currentAssignment = selectionState.playerAssignments.find(
    (pa) => pa.playerId === currentPlayer?._id
  );
  const pendingAwards = currentAssignment && 'pendingAwards' in currentAssignment
    ? currentAssignment.pendingAwards
    : [];

  // Current pending award to select
  const currentPendingAward = pendingAwards[0];

  return (
    <main className="mx-auto max-w-7xl px-4 py-10">
      <div className="mb-8">
        <h1 className="font-semibold text-3xl">{season?.name} - Week {weekNumber} Advantage Selection</h1>
        <p className="mt-2 text-gray-600">
          Select advantages for players based on their Week {weekNumber} performance
        </p>
      </div>

      {error && (
        <div className="mb-6 rounded-lg border border-red-300 bg-red-50 p-4">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {allSelectionsComplete ? (
        <Card className="p-6 bg-gradient-to-r from-green-50 to-emerald-50 border-2 border-green-300">
          <div className="text-center">
            <p className="text-2xl font-bold text-green-900 mb-3">
              ✅ Week {weekNumber} Advantage Selection Complete!
            </p>
            <p className="text-green-800 mb-6">
              All players have been assigned their weekly advantages.
            </p>
            <div className="flex gap-4 justify-center">
              <Button
                onClick={() => router.push(`/seasons/${seasonId}/results/${weekNumber}`)}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                View Results
              </Button>
              <Button onClick={() => router.push(`/seasons/${seasonId}`)} variant="outline">
                Back to Season
              </Button>
            </div>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <div className="order-first lg:order-last lg:col-span-1">
            <WeeklyPlayerList
              players={selectionState.players}
              playerAssignments={selectionState.playerAssignments}
              currentPlayerIndex={currentPlayerIndex}
              onSelectPlayer={setCurrentPlayerIndex}
            />
          </div>

          <div className="lg:col-span-3 space-y-6 order-last lg:order-first">
            {currentPlayer && currentPendingAward && (
              <>
                <Card className="p-6 bg-gradient-to-r from-yellow-50 to-amber-50 border-2 border-yellow-300">
                  <h2 className="text-2xl font-bold text-yellow-900">
                    🎯 Assigning to: {currentPlayer.labelName}
                  </h2>
                  <p className="text-yellow-800 mt-2">
                    Select a Tier {currentPendingAward.tier} advantage
                    <span className="ml-2 text-sm">
                      ({currentPendingAward.awardedVia === 'SWEEP' ? '🧹 Sweep' : `🏅 ${getOrdinal(currentPendingAward.placementRank)} place`})
                    </span>
                  </p>
                  {pendingAwards.length > 1 && (
                    <p className="text-yellow-700 mt-1 text-sm">
                      {pendingAwards.length} selections remaining for this player
                    </p>
                  )}
                </Card>

                {(() => {
                  const advantages = currentPendingAward.tier === 1
                    ? selectionState.tier1Advantages
                    : currentPendingAward.tier === 2
                      ? selectionState.tier2Advantages
                      : selectionState.tier3Advantages;

                  if (!advantages || advantages.length === 0) return null;

                  return (
                    <AdvantageBoard
                      tier={currentPendingAward.tier}
                      advantages={advantages}
                      maxSelections={1}
                      currentSelections={[]}
                      onSelectAdvantage={(code: string) =>
                        handleAssignAdvantage(code, currentPendingAward._id)
                      }
                      isLoading={isAssigning}
                      disabled={!currentPlayer}
                    />
                  );
                })()}
              </>
            )}

            {!currentPendingAward && currentPlayer && (
              <Card className="p-6 bg-gray-50 border-gray-200">
                <div className="text-center">
                  <p className="text-gray-600">
                    {currentPlayer.labelName} has no pending selections.
                  </p>
                  <p className="text-sm text-gray-500 mt-2">
                    Select another player from the list, or go back to results.
                  </p>
                </div>
              </Card>
            )}

            <div className="flex gap-4 justify-between">
              <Button
                onClick={() => setCurrentPlayerIndex(Math.max(0, currentPlayerIndex - 1))}
                variant="outline"
                disabled={currentPlayerIndex === 0 || isAssigning}
              >
                ← Previous Player
              </Button>

              <div className="text-center">
                <p className="text-sm text-gray-600">
                  Player {currentPlayerIndex + 1} of {selectionState.players.length}
                </p>
              </div>

              <Button
                onClick={() =>
                  setCurrentPlayerIndex(Math.min(selectionState.players.length - 1, currentPlayerIndex + 1))
                }
                variant="outline"
                disabled={currentPlayerIndex === selectionState.players.length - 1 || isAssigning}
              >
                Next Player →
              </Button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

// Helper component to show weekly player list with pending indicators
function WeeklyPlayerList({
  players,
  playerAssignments,
  currentPlayerIndex,
  onSelectPlayer,
}: {
  players: Array<{ _id: Id<'season_players'>; labelName: string; user?: { displayName: string } | null }>;
  playerAssignments: Array<{
    playerId: Id<'season_players'>;
    pendingAwards?: Array<{ tier: number }>;
    assignedAdvantages?: Array<{ tier: number }>;
  }>;
  currentPlayerIndex: number;
  onSelectPlayer: (index: number) => void;
}) {
  return (
    <Card className="p-4">
      <h3 className="font-semibold text-lg mb-4">Players</h3>
      <div className="space-y-2">
        {players.map((player, index) => {
          const assignment = playerAssignments.find((pa) => pa.playerId === player._id);
          const pendingCount = assignment && 'pendingAwards' in assignment
            ? assignment.pendingAwards?.length || 0
            : 0;
          const assignedCount = assignment?.assignedAdvantages?.length || 0;
          const isComplete = pendingCount === 0 && assignedCount > 0;
          const hasNoPendingOrAssigned = pendingCount === 0 && assignedCount === 0;

          return (
            <button
              key={player._id}
              onClick={() => onSelectPlayer(index)}
              className={`w-full p-3 rounded-lg text-left transition ${
                index === currentPlayerIndex
                  ? 'bg-yellow-100 border-2 border-yellow-400'
                  : isComplete
                    ? 'bg-green-50 border border-green-200 hover:bg-green-100'
                    : hasNoPendingOrAssigned
                      ? 'bg-gray-50 border border-gray-200 hover:bg-gray-100'
                      : 'bg-white border border-gray-200 hover:bg-gray-50'
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">{player.labelName}</p>
                  <p className="text-xs text-gray-500">{player.user?.displayName}</p>
                </div>
                <div className="text-right">
                  {isComplete && <span className="text-green-600 text-sm">✓</span>}
                  {pendingCount > 0 && (
                    <span className="text-amber-600 text-sm font-medium">{pendingCount} pending</span>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </Card>
  );
}

function getOrdinal(n: number | undefined): string {
  if (n === undefined) return '';
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
