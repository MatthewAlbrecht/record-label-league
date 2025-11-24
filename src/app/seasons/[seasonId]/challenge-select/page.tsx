'use client';

import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQuery, useMutation } from 'convex/react';
import { api } from 'convex/_generated/api';
import type { Id } from 'convex/_generated/dataModel';
import { useAuth } from '~/lib/auth-context';
import { Card } from '~/components/ui/card';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { useState } from 'react';
import { Loader2, Eye, CheckCircle2, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog';

export default function ChallengeSelectPage() {
  const params = useParams();
  const router = useRouter();
  const seasonId = (params?.seasonId as string) || '';
  const { user } = useAuth();

  const pageData = useQuery(api.challenges.getChallengeSelectionPageData, {
    seasonId: seasonId as Id<'seasons'>,
  });

  const revealChallengeMutation = useMutation(api.challenges.revealChallenge);
  const selectChallengeMutation = useMutation(api.challenges.selectChallenge);
  const resetChallengeSelectionMutation = useMutation(api.challenges.resetChallengeSelection);

  const season = useQuery(api.seasons.getSeason, {
    seasonId: seasonId as Id<'seasons'>,
  });

  const seasonPlayers = useQuery(api.seasons.getSeasonPlayers, {
    seasonId: seasonId as Id<'seasons'>,
  });

  const [selectedChallenge, setSelectedChallenge] = useState<any>(null);
  const [isRevealing, setIsRevealing] = useState(false);
  const [isSelecting, setIsSelecting] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  if (!pageData || !seasonPlayers || !season) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  const currentUserSeasonPlayer = seasonPlayers?.find(
    (p) => p.user?.id === user?.id
  );

  const isCurrentPicker = pageData.picker &&
    pageData.picker._id === currentUserSeasonPlayer?._id;

  const isCommissioner = season.league.commissioner.id === user?.id;
  const canAct = isCurrentPicker || isCommissioner;

  // For now, we can't reliably detect commissioner status from client
  // So we'll assume all non-pickers who can act are commissioners
  // This should be fixed by passing commissioner status from backend
  const canReveal = isCurrentPicker;
  const revealLimit = 2; // Players always have 2 reveals per week
  const revealsRemaining = revealLimit - pageData.revealsThisWeek;

  const handleReveal = async (challenge: any) => {
    try {
      setIsRevealing(true);
      await revealChallengeMutation({
        seasonId: seasonId as Id<'seasons'>,
        boardChallengeId: challenge._id,
        requestingUserId: user?.id as Id<'users'>,
      });

      toast.success('Challenge revealed!');
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to reveal challenge';
      toast.error(errorMsg);
    } finally {
      setIsRevealing(false);
    }
  };

  const handleSelectClick = (challenge: any) => {
    setSelectedChallenge(challenge);
  };

  const handleConfirmSelection = async () => {
    if (!selectedChallenge) return;

    try {
      setIsSelecting(true);
      await selectChallengeMutation({
        seasonId: seasonId as Id<'seasons'>,
        boardChallengeId: selectedChallenge._id,
        requestingUserId: user?.id as Id<'users'>,
      });

      toast.success('Challenge selected!');
      setSelectedChallenge(null);
      // Redirect to challenge view page
      setTimeout(() => {
        router.push(`/seasons/${seasonId}/challenge`);
      }, 500);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to select challenge';
      toast.error(errorMsg);
    } finally {
      setIsSelecting(false);
    }
  };

  const handleResetChallengeSelection = async () => {
    try {
      setIsResetting(true);
      await resetChallengeSelectionMutation({
        seasonId: seasonId as Id<'seasons'>,
        requestingUserId: user?.id as Id<'users'>,
      });
      setShowResetConfirm(false);
      toast.success('Challenge selection reset! All reveals and selections cleared for this week.');
      // Reload to get updated state
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to reset challenge selection';
      toast.error(errorMsg);
    } finally {
      setIsResetting(false);
    }
  };

  // Group challenges by category
  const challengesByCategory = pageData.challenges.reduce((acc: any, challenge: any) => {
    const categoryId = challenge.categoryId;
    if (!acc[categoryId]) {
      acc[categoryId] = [];
    }
    acc[categoryId].push(challenge);
    return acc;
  }, {});

  const categoryMap = pageData.board.categories.reduce((acc: any, cat: any) => {
    acc[cat.id] = cat.title;
    return acc;
  }, {});

  const sortedCategoryIds = pageData.board.categories.map((c: any) => c.id);

  // Find max number of challenges in any category to determine number of rows
  const maxChallenges = Math.max(
    ...sortedCategoryIds.map((catId: string) => (challengesByCategory[catId] || []).length)
  );

  return (
    <div className="container mx-auto py-8 px-4 max-w-7xl">
      {/* Header */}
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-4xl font-bold mb-2">Week {pageData.season.currentWeek} of 8</h1>
          <p className="text-xl text-gray-600">Challenge Selection</p>
        </div>
        {isCommissioner && (
          <Button
            onClick={() => setShowResetConfirm(true)}
            variant="outline"
            className="text-red-600 border-red-300 hover:bg-red-50"
            size="sm"
          >
            <RotateCcw className="w-4 h-4 mr-2" />
            Reset
          </Button>
        )}
      </div>

      {/* Turn Indicator */}
      <Card className={`p-6 mb-8 ${canAct ? (isCommissioner ? 'bg-purple-50 border-2 border-purple-300' : 'bg-blue-50 border-2 border-blue-300') : 'bg-gray-50'}`}>
        <div className="flex items-center justify-between">
          <div>
            {isCommissioner ? (
              <>
                <p className="text-lg font-semibold text-purple-900">📋 Commissioner Mode</p>
                <p className="text-sm text-purple-700 mt-1">
                  Selecting for {pageData.picker?.labelName} - Reveal up to 2 challenges, then select one
                </p>
                <p className="text-xs text-purple-600 mt-2 font-medium">
                  {revealsRemaining > 0 ? `${revealsRemaining} reveal${revealsRemaining === 1 ? '' : 's'} remaining this week` : 'All reveals used - select a challenge'}
                </p>
              </>
            ) : isCurrentPicker ? (
              <>
                <p className="text-lg font-semibold text-blue-900">🎯 It's YOUR turn!</p>
                <p className="text-sm text-blue-700 mt-1">
                  Reveal up to 2 challenges, then select one
                </p>
                <p className="text-xs text-blue-600 mt-2 font-medium">
                  {revealsRemaining > 0 ? `${revealsRemaining} reveal${revealsRemaining === 1 ? '' : 's'} remaining this week` : 'All reveals used - select a challenge'}
                </p>
              </>
            ) : (
              <>
                <p className="text-lg font-semibold text-gray-900">
                  {pageData.picker?.labelName} is picking this week...
                </p>
                <p className="text-sm text-gray-600 mt-1">
                  Waiting for their selection
                </p>
              </>
            )}
          </div>
          {pageData.picker && (
            <Badge variant="outline" className="text-base px-3 py-1">
              {pageData.picker.labelName}
            </Badge>
          )}
        </div>
      </Card>

      {/* Selection Panel */}
      {canAct && !pageData.currentSelection && revealsRemaining === 0 && (
        <Card className={`p-6 mb-8 ${selectedChallenge ? 'bg-yellow-50 border-2 border-yellow-300' : 'bg-gray-50 border-2 border-gray-200'}`}>
          {selectedChallenge ? (
            <div className="space-y-4">
              <div className="flex items-start gap-4">
                <span className="text-5xl">{selectedChallenge.canonical?.emoji}</span>
                <div className="flex-1">
                  <h3 className="text-2xl font-bold mb-1">{selectedChallenge.canonical?.title}</h3>
                  <p className="text-sm text-gray-500 mb-3">{selectedChallenge.canonical?.category}</p>
                  {selectedChallenge.isRevealed && selectedChallenge.canonical?.generalVibe && (
                    <p className="text-sm text-gray-700 italic mb-4">
                      {selectedChallenge.canonical?.generalVibe}
                    </p>
                  )}
                  <div className="flex gap-3 mt-4">
                    <Button
                      onClick={handleConfirmSelection}
                      disabled={isSelecting}
                      className="bg-green-600 hover:bg-green-700"
                    >
                      {isSelecting ? 'Selecting...' : 'Confirm Selection'}
                    </Button>
                    <Button
                      onClick={() => setSelectedChallenge(null)}
                      variant="outline"
                      disabled={isSelecting}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-4">
              <p className="text-gray-600">Click on a challenge card below to select it</p>
            </div>
          )}
        </Card>
      )}

      {/* Current Selection */}
      {pageData.currentSelection && (
        <Link href={`/seasons/${seasonId}/challenge`}>
          <Card className="p-6 mb-8 bg-gradient-to-r from-green-50 to-emerald-50 border-2 border-green-300 hover:shadow-lg transition-shadow cursor-pointer">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-2xl font-bold text-green-900 mb-2">
                  ✅ This Week's Challenge
                </h2>
                {pageData.challenges.find((c: any) => c._id === pageData.currentSelection.boardChallengeId)?.canonical && (
                  <div>
                    <p className="text-lg font-semibold">
                      <span className="text-2xl mr-2">{pageData.challenges.find((c: any) => c._id === pageData.currentSelection.boardChallengeId)?.canonical?.emoji}</span>
                      {pageData.challenges.find((c: any) => c._id === pageData.currentSelection.boardChallengeId)?.canonical?.title}
                    </p>
                    <p className="text-sm text-green-800 mt-3">
                      Click to view full details →
                    </p>
                  </div>
                )}
              </div>
            </div>
          </Card>
        </Link>
      )}

      {/* Jeopardy Board */}
      <div className="mb-8">
        <h2 className="text-2xl font-bold mb-4">Challenge Board</h2>
        <div className="grid gap-4" style={{
          gridTemplateColumns: `repeat(${Math.min(pageData.board.categories.length, 6)}, 1fr)`,
        }}>
          {/* Category Headers */}
          {sortedCategoryIds.map((categoryId: string) => (
            <div key={`header-${categoryId}`}>
              <h3 className="font-bold text-center mb-3 text-sm bg-gray-200 p-2 rounded">
                {categoryMap[categoryId]}
              </h3>
            </div>
          ))}

          {/* Challenge Rows - each row contains one challenge from each category */}
          {Array.from({ length: maxChallenges }).map((_, rowIndex) => (
            sortedCategoryIds.map((categoryId: string) => {
              const categoryChallenges = challengesByCategory[categoryId] || [];
              const challenge = categoryChallenges[rowIndex];

              if (!challenge) {
                return <div key={`empty-${categoryId}-${rowIndex}`} />;
              }

              const isRevealed = challenge.isRevealed;
              const isSelected = challenge.isSelected;
              const wasSelected = isSelected && pageData.currentSelection?.boardChallengeId !== challenge._id;

              const isClickable = canAct && !pageData.currentSelection && revealsRemaining === 0 && !wasSelected;
              const isSelectedInPanel = selectedChallenge?._id === challenge._id;

              return (
                <div
                  key={challenge._id}
                  onClick={isClickable ? () => handleSelectClick(challenge) : undefined}
                  className={`rounded border-2 transition-all p-3 flex flex-col items-center justify-center relative min-h-[120px] ${pageData.currentSelection?.boardChallengeId === challenge._id
                    ? 'bg-green-100 border-green-500 shadow-md'
                    : wasSelected
                      ? 'bg-gray-100 border-gray-300 opacity-50'
                      : isSelectedInPanel
                        ? 'bg-yellow-100 border-yellow-400 shadow-md'
                        : isClickable
                          ? 'bg-white border-gray-300 hover:border-blue-400 hover:shadow-sm cursor-pointer'
                          : 'bg-white border-gray-300'
                    }`}
                >
                  {pageData.currentSelection?.boardChallengeId === challenge._id ? (
                    <div className="text-center">
                      <p className="text-sm font-bold text-green-700 flex items-center justify-center gap-1 mb-2">
                        <CheckCircle2 className="w-4 h-4" /> Week {pageData.season.currentWeek}
                      </p>
                      <p className="text-sm font-semibold">
                        <span className="text-lg mr-2">{challenge.canonical?.emoji}</span>
                        {challenge.canonical?.title}
                      </p>
                      {challenge.canonical?.generalVibe && (
                        <p className="text-xs text-green-600 mt-1 italic">
                          {challenge.canonical?.generalVibe}
                        </p>
                      )}
                    </div>
                  ) : wasSelected ? (
                    <div className="text-center">
                      <p className="text-sm font-semibold text-gray-600">
                        <span className="text-lg mr-1 line-through">{challenge.canonical?.emoji}</span>
                        <span className="line-through">{challenge.canonical?.title}</span>
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        Week {challenge.selectedAtWeek}
                      </p>
                    </div>
                  ) : isRevealed ? (
                    <div className="text-center">
                      <p className="text-sm font-semibold mb-2">
                        <span className="text-lg mr-2">{challenge.canonical?.emoji}</span>
                        {challenge.canonical?.title}
                      </p>
                      <p className="text-xs text-gray-600 mb-2 italic">
                        {challenge.canonical?.generalVibe}
                      </p>
                    </div>
                  ) : (
                    <div className="text-center">
                      <p className="text-sm font-semibold text-gray-700 mb-2">
                        <span className="text-lg mr-2">{challenge.canonical?.emoji}</span>
                        {challenge.canonical?.title}
                      </p>
                      {canAct && !pageData.currentSelection && revealsRemaining > 0 && (
                        <Button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleReveal(challenge);
                          }}
                          size="sm"
                          variant="outline"
                          disabled={isRevealing}
                          className="absolute bottom-1 right-1 p-1 h-6 w-6"
                        >
                          <Eye className="w-3 h-3" />
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )).flat()}
        </div>
      </div>

      {/* Reset Confirmation Dialog */}
      <Dialog open={showResetConfirm} onOpenChange={setShowResetConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-red-600">🔄 Reset Challenge Selection?</DialogTitle>
            <DialogDescription>
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-4 text-sm">
            <div className="rounded-lg bg-red-50 p-3 border border-red-200">
              <p className="font-semibold text-red-900 mb-2">This will:</p>
              <ul className="text-red-800 space-y-1 ml-4">
                <li>• Delete all challenge reveals for Week {pageData.season.currentWeek}</li>
                <li>• Delete the challenge selection for Week {pageData.season.currentWeek}</li>
                <li>• Reset the picker's reveal count to 0</li>
                <li>• Allow players to start the reveal/select process over</li>
              </ul>
            </div>

            <p className="font-semibold text-gray-900">
              Are you absolutely sure? This will erase all challenge selection progress for this week.
            </p>
          </div>

          <DialogFooter>
            <Button
              onClick={() => setShowResetConfirm(false)}
              variant="outline"
              disabled={isResetting}
            >
              Cancel
            </Button>
            <Button
              onClick={handleResetChallengeSelection}
              disabled={isResetting}
              className="bg-red-600 hover:bg-red-700"
            >
              {isResetting ? 'Resetting...' : 'Yes, Reset Challenge Selection'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
