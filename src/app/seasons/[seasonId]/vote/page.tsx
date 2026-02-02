'use client';

import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation } from 'convex/react';
import { api } from 'convex/_generated/api';
import type { Id } from 'convex/_generated/dataModel';
import { useAuth } from '~/lib/auth-context';
import { Button } from '~/components/ui/button';
import { Card } from '~/components/ui/card';
import { Badge } from '~/components/ui/badge';
import { Alert, AlertDescription } from '~/components/ui/alert';
import { Loader2, CheckCircle2, ArrowRight, Circle, Check, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { useState, useEffect } from 'react';

// Sub-component to load current player's vote
function CurrentPlayerVote({
  seasonId,
  weekNumber,
  categoryId,
  playerId,
  onLoad,
}: {
  seasonId: Id<'seasons'>;
  weekNumber: number;
  categoryId: string;
  playerId: Id<'season_players'>;
  onLoad: (vote: any) => void;
}) {
  const vote = useQuery(api.voting.getPlayerVoteForCategory, {
    seasonId,
    weekNumber,
    categoryId,
    playerId,
  });

  useEffect(() => {
    onLoad(vote);
  }, [vote, onLoad]);

  return null;
}

export default function VotingPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const seasonId = (params?.seasonId as string) || '';

  const season = useQuery(api.seasons.getSeason, {
    seasonId: seasonId as Id<'seasons'>,
  });

  const votingSession = useQuery(api.voting.getVotingSession, {
    seasonId: seasonId as Id<'seasons'>,
    weekNumber: season?.currentWeek || 0,
  });

  const voteStatus = useQuery(api.voting.getCategoryVoteStatus, {
    seasonId: seasonId as Id<'seasons'>,
    weekNumber: season?.currentWeek || 0,
  });

  const currentCategoryVotes = useQuery(api.voting.getCurrentCategoryVotes, {
    seasonId: seasonId as Id<'seasons'>,
    weekNumber: season?.currentWeek || 0,
  });

  const allSessionVotes = useQuery(api.voting.getAllSessionVotes, {
    seasonId: seasonId as Id<'seasons'>,
    weekNumber: season?.currentWeek || 0,
  });

  const commissionerCategoryVotes = useQuery(api.voting.getCategoryVotesForCommissioner, {
    seasonId: seasonId as Id<'seasons'>,
    weekNumber: season?.currentWeek || 0,
  });

  // Get current player's own vote (always visible regardless of revealMode)
  // We'll get this after currentCategory and currentPlayer are available

  const seasonPlayers = useQuery(api.seasons.getSeasonPlayers, {
    seasonId: seasonId as Id<'seasons'>,
  });

  const weekPlaylists = useQuery(api.playlists.getWeekPlaylists, {
    seasonId: seasonId as Id<'seasons'>,
    weekNumber: season?.currentWeek || 0,
  });

  const optionSelectionStatus = useQuery(api.challenges.getOptionSelectionStatus, {
    seasonId: seasonId as Id<'seasons'>,
  });

  const startNextCategoryMutation = useMutation(api.voting.startNextCategory);
  const castVoteMutation = useMutation(api.voting.castVote);
  const revealCategoryResultsMutation = useMutation(api.voting.revealCategoryResults);

  const [isStartingCategory, setIsStartingCategory] = useState(false);
  const [isCastingVote, setIsCastingVote] = useState(false);
  const [isRevealing, setIsRevealing] = useState(false);
  const [selectedVoterForProxy, setSelectedVoterForProxy] = useState<Id<'season_players'> | null>(null);
  const [isCastingProxyVote, setIsCastingProxyVote] = useState(false);
  const [myVote, setMyVote] = useState<any>(null);

  // Check if user is commissioner
  const isCommissioner = season && user && season.league.commissioner.id === user.id;

  if (!season || !user || !seasonPlayers) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  // If no voting session exists, show waiting state
  if (!votingSession) {
    return (
      <div className="container mx-auto py-8 px-4 max-w-4xl">
        <Card className="p-6 border-blue-200 bg-blue-50">
          <h1 className="text-2xl font-bold mb-2">Week {season.currentWeek} of 8 — Award Show Voting</h1>
          <p className="text-gray-600">
            {isCommissioner
              ? 'Click "Move to Voting Phase" on the admin dashboard to start voting.'
              : 'Waiting for commissioner to start voting...'}
          </p>
        </Card>
      </div>
    );
  }


  const handleStartNextCategory = async () => {
    if (!season || !user) return;

    try {
      setIsStartingCategory(true);
      await startNextCategoryMutation({
        seasonId: seasonId as Id<'seasons'>,
        weekNumber: season.currentWeek,
        requestingUserId: user.id as Id<'users'>,
      });
      toast.success('Category started!');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to start category');
    } finally {
      setIsStartingCategory(false);
    }
  };

  const handleCastVote = async (nominatedPlayerId: Id<'season_players'>) => {
    if (!season || !user || !currentCategory || !currentPlayer) return;

    try {
      setIsCastingVote(true);
      await castVoteMutation({
        seasonId: seasonId as Id<'seasons'>,
        weekNumber: season.currentWeek,
        categoryId: currentCategory.id,
        nominatedPlayerId,
        requestingUserId: user.id as Id<'users'>,
      });
      toast.success('Vote cast!');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to cast vote');
    } finally {
      setIsCastingVote(false);
    }
  };

  const handleCastProxyVote = async (nominatedPlayerId: Id<'season_players'>) => {
    if (!season || !user || !currentCategory || !selectedVoterForProxy) return;

    try {
      setIsCastingProxyVote(true);
      await castVoteMutation({
        seasonId: seasonId as Id<'seasons'>,
        weekNumber: season.currentWeek,
        categoryId: currentCategory.id,
        nominatedPlayerId,
        requestingUserId: user.id as Id<'users'>,
        voterPlayerId: selectedVoterForProxy,
      });
      const selectedPlayer = seasonPlayers?.find(p => p._id.toString() === selectedVoterForProxy.toString());
      toast.success(`Vote cast on behalf of ${selectedPlayer?.labelName || 'player'}!`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to cast proxy vote');
    } finally {
      setIsCastingProxyVote(false);
    }
  };

  const handleRevealResults = async () => {
    if (!season || !user) return;

    try {
      setIsRevealing(true);
      const result = await revealCategoryResultsMutation({
        seasonId: seasonId as Id<'seasons'>,
        weekNumber: season.currentWeek,
        requestingUserId: user.id as Id<'users'>,
      });

      if (result.isComplete) {
        toast.success('All voting complete! Review the final category results, then click View Results to continue.');
      } else {
        toast.success('Category results revealed!');
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to reveal results');
    } finally {
      setIsRevealing(false);
    }
  };

  const currentCategory = votingSession.currentCategoryIndex >= 0
    ? votingSession.categories[votingSession.currentCategoryIndex]
    : null;

  // Get current player
  const currentPlayer = seasonPlayers?.find((p) => p.userId.toString() === user?.id?.toString());

  // Get player's vote for current category (use myVote state which is loaded from sub-component, or fallback to currentCategoryVotes)
  const playerVote = myVote ?? (currentPlayer
    ? currentCategoryVotes?.find((v) => v.voterId.toString() === currentPlayer._id.toString())
    : null);

  // Calculate vote counts for display (if IMMEDIATE mode or revealed)
  const voteCounts = new Map<Id<'season_players'>, number>();
  if (currentCategoryVotes && (votingSession.revealMode === 'IMMEDIATE' || votingSession.status === 'PENDING' || votingSession.status === 'CLOSED')) {
    currentCategoryVotes.forEach((vote) => {
      const count = voteCounts.get(vote.nominatedPlayerId) || 0;
      voteCounts.set(vote.nominatedPlayerId, count + 1);
    });
  }

  // Check for sweep (one player received all votes)
  // Use voteCounts if available, otherwise calculate from currentCategoryVotes
  const sweepVoteCounts = voteCounts.size > 0 ? voteCounts : (() => {
    const counts = new Map<Id<'season_players'>, number>();
    if (currentCategoryVotes) {
      currentCategoryVotes.forEach((vote) => {
        const count = counts.get(vote.nominatedPlayerId) || 0;
        counts.set(vote.nominatedPlayerId, count + 1);
      });
    }
    return counts;
  })();

  // Sweep = one player received all votes except their own (since players can't vote for themselves)
  const sweepPlayer = seasonPlayers && currentCategoryVotes && currentCategoryVotes.length === seasonPlayers.length && seasonPlayers.length > 1
    ? Array.from(sweepVoteCounts.entries()).find(([_, count]) => count === seasonPlayers.length - 1)
    : null;

  // NOT_STARTED state
  if (votingSession.currentCategoryIndex < 0) {
    return (
      <div className="container mx-auto py-8 px-4 max-w-4xl">
        {/* Back Button */}
        <button
          onClick={() => router.push(`/seasons/${seasonId}`)}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Dashboard
        </button>

        <div className="mb-6">
          <h1 className="text-3xl font-bold mb-2">Week {season.currentWeek} of 8 — Award Show Voting</h1>
          <p className="text-gray-600">Ready to begin voting</p>
        </div>

        {isCommissioner ? (
          <Card className="p-6">
            <p className="mb-4">Click below to start the first award category.</p>
            <Button
              onClick={handleStartNextCategory}
              disabled={isStartingCategory}
              className="w-full"
            >
              {isStartingCategory ? 'Starting...' : 'Start First Award'}
            </Button>
          </Card>
        ) : (
          <Card className="p-6 border-blue-200 bg-blue-50">
            <p>Waiting for commissioner to start voting...</p>
          </Card>
        )}
      </div>
    );
  }

  // CLOSED state - show all results
  if (votingSession.status === 'CLOSED') {
    return (
      <div className="container mx-auto py-8 px-4 max-w-4xl">
        {/* Back Button */}
        <button
          onClick={() => router.push(`/seasons/${seasonId}`)}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Dashboard
        </button>

        <div className="mb-6">
          <h1 className="text-3xl font-bold mb-2">Week {season.currentWeek} of 8 — Voting Complete</h1>
          <p className="text-gray-600">All awards have been voted on</p>
        </div>

        {/* Playlist Tracklists */}
        {weekPlaylists && weekPlaylists.length > 0 && (
          <Card className="p-4 mb-6">
            <h2 className="text-lg font-semibold mb-3">Playlists</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {weekPlaylists.map((playlist) => {
                const player = seasonPlayers?.find(
                  (p) => p._id.toString() === playlist.seasonPlayerId.toString()
                );
                // Find the selected option for this player
                const selectedOptionFull = optionSelectionStatus?.selections.find(
                  (s) => s.player._id?.toString() === playlist.seasonPlayerId.toString()
                )?.selectedOption;
                // Extract just the title (before the em dash)
                const selectedOption = selectedOptionFull?.split(' — ')[0]?.trim() || selectedOptionFull;
                return (
                  <div key={playlist._id.toString()} className="border-r last:border-r-0 pr-4 last:pr-0">
                    <h3 className="font-medium text-sm mb-2">{player?.labelName || 'Unknown'}</h3>
                    {selectedOption && (
                      <div className="mb-2 p-2 bg-blue-50 border border-blue-200 rounded">
                        <p className="text-xs font-semibold text-blue-900 mb-0.5">Selected Option:</p>
                        <p className="text-xs font-bold text-blue-950">{selectedOption}</p>
                      </div>
                    )}
                    <div className="space-y-1">
                      {playlist.tracks
                        .sort((a, b) => a.position - b.position)
                        .map((track, idx) => (
                          <div key={track._id.toString()} className="text-xs text-gray-600">
                            <div className="flex items-start gap-1">
                              <span className="text-gray-400 flex-shrink-0">{idx + 1}.</span>
                              <div className="flex-1 min-w-0">
                                <div className="font-medium truncate">{track.trackName}</div>
                                <div className="text-gray-500 truncate">{track.artistNames.join(', ')}</div>
                              </div>
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        <Card className="p-6">
          <div className="space-y-4">
            {votingSession.categories.map((category, index) => {
              // Get votes for this category
              const categoryVotes = allSessionVotes?.filter((v) => v.categoryId === category.id) || [];
              const categoryCounts = new Map<Id<'season_players'>, number>();
              categoryVotes.forEach((vote) => {
                const count = categoryCounts.get(vote.nominatedPlayerId) || 0;
                categoryCounts.set(vote.nominatedPlayerId, count + 1);
              });

              return (
                <div key={category.id} className="border-b pb-4 last:border-0">
                  <div className="mb-2">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-bold text-lg">{category.title}</h3>
                      <Badge variant={category.pointValue === 3 ? 'default' : category.pointValue === 2 ? 'secondary' : 'outline'}>
                        {category.pointValue}pt
                      </Badge>
                    </div>
                    {category.description && (
                      <p className="text-sm text-gray-600">{category.description}</p>
                    )}
                  </div>
                  <div className="space-y-1">
                    {Array.from(categoryCounts.entries())
                      .sort((a, b) => b[1] - a[1])
                      .map(([playerId, count]) => {
                        const player = seasonPlayers.find((p) => p._id.toString() === playerId.toString());
                        return (
                          <div key={playerId.toString()} className="flex justify-between text-sm">
                            <div>
                              <div>{player?.labelName || 'Unknown'}</div>
                              {player?.user?.displayName && (
                                <div className="text-xs text-gray-500">{player.user.displayName}</div>
                              )}
                            </div>
                            <span className="font-semibold">{count} vote{count !== 1 ? 's' : ''}</span>
                          </div>
                        );
                      })}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        <Card className="p-6 mt-6 bg-green-50 border-green-200">
          <div className="flex items-center justify-between">
            <p className="text-green-900 font-semibold">✓ Results have been calculated!</p>
            <Button
              onClick={() => router.push(`/seasons/${seasonId}/results/${season.currentWeek}`)}
              className="bg-green-600 hover:bg-green-700"
            >
              View Results
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  // OPEN/REVEALED state - show current category
  return (
    <>
      {/* Load current player's vote if conditions are met */}
      {currentPlayer && currentCategory && (
        <CurrentPlayerVote
          seasonId={seasonId as Id<'seasons'>}
          weekNumber={season.currentWeek}
          categoryId={currentCategory.id}
          playerId={currentPlayer._id}
          onLoad={setMyVote}
        />
      )}
      <div className="container mx-auto py-8 px-4 max-w-4xl">
        {/* Back Button */}
        <button
          onClick={() => router.push(`/seasons/${seasonId}`)}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Dashboard
        </button>

        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold mb-2">Week {season.currentWeek} of 8 — Award Show Voting</h1>
          <p className="text-gray-600">
            Award {votingSession.currentCategoryIndex + 1} of {votingSession.categories.length}
          </p>
        </div>

        {/* Progress Indicator */}
        <div className="mb-6">
          <div className="flex gap-2">
            {votingSession.categories.map((category, index) => {
              const isComplete = index < votingSession.currentCategoryIndex;
              const isCurrent = index === votingSession.currentCategoryIndex;
              return (
                <div
                  key={category.id}
                  className={`flex-1 h-2 rounded ${isComplete
                    ? 'bg-green-500'
                    : isCurrent
                      ? 'bg-blue-500'
                      : 'bg-gray-200'
                    }`}
                  title={category.title}
                />
              );
            })}
          </div>
        </div>

        {/* Playlist Tracklists */}
        {weekPlaylists && weekPlaylists.length > 0 && (
          <Card className="p-4 mb-6">
            <h2 className="text-lg font-semibold mb-3">Playlists</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {weekPlaylists.map((playlist) => {
                const player = seasonPlayers?.find(
                  (p) => p._id.toString() === playlist.seasonPlayerId.toString()
                );
                // Find the selected option for this player
                const selectedOptionFull = optionSelectionStatus?.selections.find(
                  (s) => s.player._id?.toString() === playlist.seasonPlayerId.toString()
                )?.selectedOption;
                // Extract just the title (before the em dash)
                const selectedOption = selectedOptionFull?.split(' — ')[0]?.trim() || selectedOptionFull;
                return (
                  <div key={playlist._id.toString()} className="border-r last:border-r-0 pr-4 last:pr-0">
                    <h3 className="font-medium text-sm mb-1">{player?.labelName || 'Unknown'}</h3>
                    {player?.user?.displayName && (
                      <p className="text-xs text-gray-500 mb-2">{player.user.displayName}</p>
                    )}
                    {selectedOption && (
                      <div className="mb-3 p-2 bg-blue-50 border border-blue-200 rounded">
                        <p className="text-xs font-semibold text-blue-900 mb-0.5">Selected Option:</p>
                        <p className="text-xs font-bold text-blue-950">{selectedOption}</p>
                      </div>
                    )}
                    <div className="space-y-1">
                      {playlist.tracks
                        .sort((a, b) => a.position - b.position)
                        .map((track, idx) => (
                          <div key={track._id.toString()} className="text-xs text-gray-600">
                            <div className="flex items-start gap-2">
                              {track.albumArt && (
                                <img
                                  src={track.albumArt}
                                  alt={track.trackName}
                                  className="w-8 h-8 rounded flex-shrink-0 object-cover"
                                />
                              )}
                              <div className="flex-1 min-w-0">
                                <div className="font-medium truncate">{track.trackName}</div>
                                <div className="text-gray-500 truncate">{track.artistNames.join(', ')}</div>
                              </div>
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        {/* Current Category Card */}
        {currentCategory && (
          <Card className="p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <h2 className="text-2xl font-bold">{currentCategory.title}</h2>
                  <Badge
                    variant={currentCategory.pointValue === 3 ? 'default' : currentCategory.pointValue === 2 ? 'secondary' : 'outline'}
                    className={currentCategory.pointValue === 3 ? 'text-lg px-3 py-1' : ''}
                  >
                    {currentCategory.pointValue}pt
                  </Badge>
                </div>
                {currentCategory.description && (
                  <p className="text-sm text-gray-600">{currentCategory.description}</p>
                )}
              </div>

              {/* Vote Status List */}
              <div className="flex flex-col gap-1 items-end">
                {seasonPlayers.map((player) => {
                  const hasVoted = commissionerCategoryVotes?.some(
                    (v) => v.voterId.toString() === player._id.toString()
                  );
                  return (
                    <div key={player._id.toString()} className="flex items-center gap-2 text-xs">
                      <span className={`font-medium ${hasVoted ? 'text-green-600' : ''}`}>
                        {player.user?.displayName || player.labelName}
                      </span>
                      {hasVoted ? (
                        <Check className="w-4 h-4 text-green-600 flex-shrink-0" />
                      ) : (
                        <Circle className="w-4 h-4 text-gray-300 flex-shrink-0" />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Vote Status */}
            {voteStatus && (
              <div className="mb-4 p-3 bg-gray-50 rounded">
                <p className="text-sm text-gray-600">
                  {voteStatus.categoryComplete
                    ? 'All votes submitted!'
                    : `Waiting for ${voteStatus.totalPlayers - voteStatus.playersVoted} more player${voteStatus.totalPlayers - voteStatus.playersVoted !== 1 ? 's' : ''}...`}
                </p>
              </div>
            )}

            {/* Vote Results Table (when PENDING) or Vote Buttons (when OPEN) */}
            {votingSession.status === 'PENDING' ? (
              <div className="mb-4">
                {/* Sweep Alert */}
                {sweepPlayer && (
                  <Alert className="mb-4 bg-green-50 border-green-200">
                    <AlertDescription className="text-green-900 font-semibold">
                      🧹 {(() => {
                        const player = seasonPlayers.find(p => p._id.toString() === sweepPlayer[0].toString());
                        return player?.user?.displayName || player?.labelName || 'Unknown';
                      })()} swept the category!
                    </AlertDescription>
                  </Alert>
                )}

                {/* Results Table */}
                {currentCategoryVotes && currentCategoryVotes.length > 0 && (
                  <div className="border rounded-lg overflow-hidden">
                    <div className="grid grid-cols-2 gap-4 p-4 bg-gray-50 border-b">
                      <div className="font-semibold text-sm text-gray-700">Voter</div>
                      <div className="font-semibold text-sm text-gray-700">Voted For</div>
                    </div>
                    <div className="divide-y">
                      {currentCategoryVotes
                        .sort((a, b) => {
                          const voterA = seasonPlayers.find(p => p._id.toString() === a.voterId.toString());
                          const voterB = seasonPlayers.find(p => p._id.toString() === b.voterId.toString());
                          const displayNameA = voterA?.user?.displayName || voterA?.labelName || '';
                          const displayNameB = voterB?.user?.displayName || voterB?.labelName || '';
                          return displayNameA.localeCompare(displayNameB);
                        })
                        .map((vote) => {
                          const voter = seasonPlayers.find(p => p._id.toString() === vote.voterId.toString());
                          const votedFor = seasonPlayers.find(p => p._id.toString() === vote.nominatedPlayerId.toString());
                          const isVoteForCurrentPlayer = currentPlayer && votedFor && votedFor._id.toString() === currentPlayer._id.toString();
                          return (
                            <div
                              key={vote._id.toString()}
                              className={`grid grid-cols-2 gap-4 p-4 ${isVoteForCurrentPlayer ? 'bg-green-50 border-r-4 border-r-green-500 border-b border-b-gray-200' : ''}`}
                            >
                              <div className={`text-sm ${isVoteForCurrentPlayer ? 'font-semibold' : ''}`}>
                                {voter?.user?.displayName || voter?.labelName || 'Unknown'}
                              </div>
                              <div className={`text-sm font-medium ${isVoteForCurrentPlayer ? 'text-green-700 font-bold' : ''}`}>
                                {votedFor?.labelName || 'Unknown'}
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
                {seasonPlayers
                  .filter((player) => {
                    // Filter out current player - they can't vote for themselves
                    return !currentPlayer || player._id.toString() !== currentPlayer._id.toString();
                  })
                  .map((player) => {
                    const isSelected = playerVote && playerVote.nominatedPlayerId.toString() === player._id.toString();
                    const voteCount = voteCounts.get(player._id) || 0;
                    const showVoteCount = votingSession.revealMode === 'IMMEDIATE' || votingSession.status !== 'OPEN';

                    return (
                      <Button
                        key={player._id.toString()}
                        onClick={() => handleCastVote(player._id)}
                        disabled={isCastingVote || votingSession.status !== 'OPEN'}
                        variant={isSelected ? undefined : 'outline'}
                        className={`h-auto py-4 flex items-center justify-between ${isSelected ? 'bg-green-600 hover:bg-green-700 text-white border-green-600' : ''
                          }`}
                      >
                        <div className="flex flex-col items-start">
                          <span className="font-semibold">{player.labelName}</span>
                          {player.user?.displayName && (
                            <span className="text-xs opacity-80">{player.user.displayName}</span>
                          )}
                        </div>
                        {isSelected && <CheckCircle2 className="w-5 h-5 ml-2" />}
                        {showVoteCount && voteCount > 0 && (
                          <Badge variant="secondary" className="ml-2">
                            {voteCount}
                          </Badge>
                        )}
                      </Button>
                    );
                  })}
              </div>
            )}

            {/* Commissioner Controls */}
            {isCommissioner && (
              <div className="mt-4 pt-4 border-t">
                {votingSession.status === 'OPEN' ? (
                  <Button
                    onClick={handleRevealResults}
                    disabled={isRevealing || !voteStatus?.categoryComplete}
                    className="w-full"
                  >
                    {isRevealing ? 'Revealing...' : 'Reveal Results'}
                  </Button>
                ) : (
                  <Button
                    onClick={handleStartNextCategory}
                    disabled={isStartingCategory || votingSession.currentCategoryIndex >= votingSession.categories.length - 1}
                    className="w-full"
                  >
                    {isStartingCategory ? 'Starting...' : 'Next Award'}
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                )}
              </div>
            )}
          </Card>
        )}

        {/* Commissioner Proxy Voting Section */}
        {isCommissioner && currentCategory && votingSession.status === 'OPEN' && (
          <Card className="p-4 mb-6 border-blue-200 bg-blue-50">
            <h3 className="font-semibold text-sm mb-3 text-blue-900">Cast Votes on Behalf of Players</h3>

            {/* Player Selection Buttons */}
            <div className="mb-4">
              <label className="text-xs text-blue-800 mb-3 block font-medium">Select player to vote for:</label>
              <div className="grid grid-cols-2 gap-2">
                {seasonPlayers?.map((player) => {
                  const isSelected = selectedVoterForProxy?.toString() === player._id.toString();
                  const hasVoted = currentCategoryVotes?.some(
                    (v) => v.voterId.toString() === player._id.toString()
                  );
                  return (
                    <Button
                      key={player._id.toString()}
                      onClick={() => setSelectedVoterForProxy(isSelected ? null : player._id)}
                      variant={isSelected ? 'default' : 'outline'}
                      className={`h-auto py-2 px-3 text-xs flex flex-col items-start justify-start ${isSelected ? 'bg-blue-600 hover:bg-blue-700 text-white border-blue-600' : ''
                        }`}
                    >
                      <span className="font-semibold">{player.labelName}</span>
                      {player.user?.displayName && (
                        <span className="text-xs opacity-80">{player.user.displayName}</span>
                      )}
                      {hasVoted && !isSelected && (
                        <CheckCircle2 className="w-3 h-3 mt-1 text-green-600" />
                      )}
                    </Button>
                  );
                })}
              </div>
            </div>

            {/* Vote Buttons for Selected Player */}
            {selectedVoterForProxy && (
              <div>
                <p className="text-xs text-blue-700 mb-2">
                  Voting as: <strong>
                    {(() => {
                      const selectedPlayer = seasonPlayers?.find(p => p._id.toString() === selectedVoterForProxy.toString());
                      return selectedPlayer
                        ? `${selectedPlayer.labelName}${selectedPlayer.user?.displayName ? ` (${selectedPlayer.user.displayName})` : ''}`
                        : 'Unknown';
                    })()}
                  </strong>
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {seasonPlayers
                    ?.filter((player) => {
                      // Can't vote for themselves
                      return player._id.toString() !== selectedVoterForProxy.toString();
                    })
                    .map((player) => {
                      const proxyVote = commissionerCategoryVotes?.find(
                        (v) => v.voterId.toString() === selectedVoterForProxy.toString() &&
                          v.nominatedPlayerId.toString() === player._id.toString()
                      );
                      return (
                        <Button
                          key={player._id.toString()}
                          onClick={() => handleCastProxyVote(player._id)}
                          disabled={isCastingProxyVote || votingSession.status !== 'OPEN'}
                          variant={proxyVote ? undefined : 'outline'}
                          className={`h-auto py-2 px-3 text-xs flex items-center justify-between ${proxyVote ? 'bg-green-600 hover:bg-green-700 text-white border-green-600' : ''
                            }`}
                        >
                          <div className="flex flex-col items-start">
                            <span className="font-semibold">{player.labelName}</span>
                            {player.user?.displayName && (
                              <span className="text-xs opacity-80">{player.user.displayName}</span>
                            )}
                          </div>
                          {proxyVote && <CheckCircle2 className="w-4 h-4 ml-2 flex-shrink-0" />}
                        </Button>
                      );
                    })}
                </div>
              </div>
            )}
          </Card>
        )}
      </div>
    </>
  );
}
