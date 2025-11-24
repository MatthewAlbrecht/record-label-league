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

  const season = useQuery(api.seasons.getSeason, {
    seasonId: seasonId as Id<'seasons'>,
  });

  const selectionState = useQuery(api.inventory.getAdvantageSelectionState, {
    seasonId: seasonId as Id<'seasons'>,
  });

  const assignAdvantage = useMutation(api.inventory.assignStartingAdvantage);
  const resetAllAdvantages = useMutation(api.inventory.resetAllStartingAdvantages);
  const startSeason = useMutation(api.seasons.startSeason);

  const [currentPlayerIndex, setCurrentPlayerIndex] = useState(0);
  const [isAssigning, setIsAssigning] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [error, setError] = useState('');

  // Round state: { tier: 1, round: 1 } for Tier 1 Round 1, { tier: 1, round: 2 } for Tier 1 Round 2, etc.
  const [currentRound, setCurrentRound] = useState<{ tier: number; round: number } | null>(null);

  const isCommissioner = season?.league?.commissioner?.id === user?.id;

  const currentPlayer = selectionState?.players[currentPlayerIndex];
  const config = selectionState?.config || { tier1Count: 2, tier2Count: 1, tier3Count: 0 };

  // Calculate current round based on player progress
  useEffect(() => {
    if (!selectionState) return;

    // Find the first player who hasn't completed all rounds
    for (let tier = 1; tier <= 3; tier++) {
      const tierCount = tier === 1 ? config.tier1Count : tier === 2 ? config.tier2Count : config.tier3Count;

      for (let round = 1; round <= tierCount; round++) {
        // Check if all players have completed this round
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

    // All rounds completed
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
    if (!currentPlayer || !currentRound || !selectionState) return;

    try {
      setIsAssigning(true);
      setError('');
      await assignAdvantage({
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
        // Move to next player in this round
        setCurrentPlayerIndex(nextPlayerIndex);
      } else {
        // Round complete, will advance to next round via useEffect
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
        seasonId: seasonId as Id<'seasons'>,
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
        seasonId: seasonId as Id<'seasons'>,
        requesterId: user?.id as Id<'users'>,
      });

      toast.success('Season started! Entering challenge selection...');
      // Redirect to challenge selection page
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

  if (!selectionState) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  // Check if all players have completed their selections based on config
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
          <h1 className="font-semibold text-3xl">{season?.name} - Advantage Selection</h1>
          <p className="mt-2 text-gray-600">
            Assign advantages to each player: {config.tier1Count} Tier 1, {config.tier2Count} Tier 2{config.tier3Count > 0 ? `, ${config.tier3Count} Tier 3` : ''}
          </p>
        </div>
        {isCommissioner && (
          <Button
            onClick={() => setShowResetDialog(true)}
            variant="destructive"
            size="sm"
            className="mt-2"
            disabled={isResetting || isAssigning}
          >
            🔧 Reset All
          </Button>
        )}
      </div>

      {error && (
        <div className="mb-6 rounded-lg border border-red-300 bg-red-50 p-4">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Sidebar with Player List */}
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

        {/* Main Advantage Board */}
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
                  {currentPlayer.user.displayName}, select Tier {currentRound.tier} Round {currentRound.round}
                </p>
                {currentRoundSelection && (
                  <p className="text-yellow-700 mt-2 text-sm">
                    Already selected: {currentRoundSelection.name} ({currentRoundSelection.code})
                  </p>
                )}
              </Card>
            );
          })()}

          {/* Display advantage board for current round only */}
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
                onSelectAdvantage={handleAssignAdvantage}
                isLoading={isAssigning}
                disabled={!currentPlayer}
              />
            );
          })()}

          {/* Navigation Buttons */}
          <div className="flex gap-4 justify-between">
            <Button
              onClick={() =>
                setCurrentPlayerIndex(Math.max(0, currentPlayerIndex - 1))
              }
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
                setCurrentPlayerIndex(
                  Math.min(
                    selectionState.players.length - 1,
                    currentPlayerIndex + 1
                  )
                )
              }
              variant="outline"
              disabled={
                currentPlayerIndex === selectionState.players.length - 1 ||
                isAssigning
              }
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
                  All players have been assigned their starting advantages ({config.tier1Count} Tier 1{config.tier2Count > 0 ? `, ${config.tier2Count} Tier 2` : ''}{config.tier3Count > 0 ? `, ${config.tier3Count} Tier 3` : ''}). Ready to begin the season!
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
                  <Button
                    onClick={() => router.push(`/seasons/${seasonId}`)}
                    variant="outline"
                  >
                    Back to Season
                  </Button>
                </div>
              </div>
            </Card>
          )}
        </div>
      </div>

      {/* Reset Confirmation Dialog */}
      <Dialog open={showResetDialog} onOpenChange={setShowResetDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset All Advantages?</DialogTitle>
            <DialogDescription>
              This will clear all starting advantages for every player in this season. This action cannot be undone.
              Are you sure?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              onClick={() => setShowResetDialog(false)}
              variant="outline"
              disabled={isResetting}
            >
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

