'use client';

import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation } from 'convex/react';
import { api } from 'convex/_generated/api';
import type { Id } from 'convex/_generated/dataModel';
import { useAuth } from '~/lib/auth-context';
import { Button } from '~/components/ui/button';
import { Card } from '~/components/ui/card';
import { Loader2, ChevronLeft, ChevronRight, CheckCircle2, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { useState } from 'react';


export default function PresentationPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const seasonId = (params?.seasonId as string) || '';

  const pageData = useQuery(api.presentation.getPresentationPageData, {
    seasonId: seasonId as Id<'seasons'>,
  });

  const seasonData = useQuery(api.seasons.getSeason, {
    seasonId: seasonId as Id<'seasons'>,
  });

  const selectPresenterMutation = useMutation(api.presentation.selectPresenter);
  const revealNextTrackMutation = useMutation(api.presentation.revealNextTrack);
  const revealPreviousTrackMutation = useMutation(api.presentation.revealPreviousTrack);
  const completePresentationMutation = useMutation(api.presentation.completePresentation);

  const [isSelecting, setIsSelecting] = useState(false);
  const [isRevealing, setIsRevealing] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);

  // Check if user is commissioner
  const isCommissioner = seasonData && user && seasonData.league.commissioner.id === user.id;

  // Still loading
  if (pageData === undefined || seasonData === undefined || !user) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  // pageData is null - presentation not initialized
  if (pageData === null) {
    return (
      <div className="container mx-auto py-8 px-4 max-w-4xl">
        <Card className="p-6 border-yellow-200 bg-yellow-50">
          <h2 className="text-lg font-bold text-yellow-900 mb-2">Presentation Not Started</h2>
          <p className="text-yellow-800 mb-4">
            The presentation phase hasn&apos;t been initialized yet. 
            {seasonData?.currentPhase !== 'PLAYLIST_PRESENTATION' && (
              <span> Current phase: <strong>{seasonData?.currentPhase}</strong></span>
            )}
          </p>
          <p className="text-sm text-yellow-700">
            Commissioner: Go to Admin → click &quot;Start Presentation Phase&quot; to begin.
          </p>
        </Card>
      </div>
    );
  }

  const { season, presentationState, allPlaylists, currentPresenterTracks, remainingPlayers, presentedCount, totalPlayerCount } = pageData;

  if (!isCommissioner) {
    return (
      <div className="container mx-auto py-8 px-4">
        <Card className="p-6 border-red-200 bg-red-50">
          <p className="text-red-900">Only commissioners can control the presentation.</p>
        </Card>
      </div>
    );
  }

  const handleSelectPresenter = async (playerId: Id<'season_players'>) => {
    try {
      setIsSelecting(true);
      await selectPresenterMutation({
        seasonId: seasonId as Id<'seasons'>,
        weekNumber: season.currentWeek,
        seasonPlayerId: playerId,
        requestingUserId: user.id as Id<'users'>,
      });
      toast.success('Presenter selected!');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to select presenter');
    } finally {
      setIsSelecting(false);
    }
  };

  const handleRevealNext = async () => {
    try {
      setIsRevealing(true);
      const result = await revealNextTrackMutation({
        seasonId: seasonId as Id<'seasons'>,
        weekNumber: season.currentWeek,
        requestingUserId: user.id as Id<'users'>,
      });
      if (result.isComplete) {
        toast.success('All tracks revealed!');
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to reveal track');
    } finally {
      setIsRevealing(false);
    }
  };

  const handleTrackClick = async (trackIndex: number) => {
    // Only allow clicking on the next track to reveal
    if (trackIndex === presentationState.currentTrackIndex + 1 && !isRevealing) {
      await handleRevealNext();
    }
  };

  const handleRevealPrevious = async () => {
    try {
      await revealPreviousTrackMutation({
        seasonId: seasonId as Id<'seasons'>,
        weekNumber: season.currentWeek,
        requestingUserId: user.id as Id<'users'>,
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to go back');
    }
  };

  const handleCompletePresentation = async () => {
    try {
      setIsCompleting(true);
      const result = await completePresentationMutation({
        seasonId: seasonId as Id<'seasons'>,
        weekNumber: season.currentWeek,
        requestingUserId: user.id as Id<'users'>,
      });
      if (result.isComplete) {
        toast.success('All presentations complete!');
        setTimeout(() => {
          router.push(`/seasons/${seasonId}`);
        }, 2000);
      } else {
        toast.success('Presentation complete! Select next presenter.');
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to complete presentation');
    } finally {
      setIsCompleting(false);
    }
  };

  // Before starting - show all players to select first presenter
  if (presentationState.status === 'NOT_STARTED' || !presentationState.currentPresenterId) {
    const playersToShow = remainingPlayers.length > 0 ? remainingPlayers : allPlaylists.map(p => ({
      _id: p.seasonPlayerId,
      labelName: p.labelName,
    }));

    return (
      <div className="container mx-auto py-4 px-4 max-w-6xl">
        {/* Back Button */}
        <button
          onClick={() => router.push(`/seasons/${seasonId}`)}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Dashboard
        </button>

        {/* Header */}
        <div className="mb-4">
          <h1 className="text-2xl font-bold mb-1">Week {season.currentWeek} Presentation</h1>
          <p className="text-sm text-gray-600">Select a player to begin their presentation</p>
        </div>

        {/* Progress */}
        <div className="mb-4">
          <Card className="p-2 bg-blue-50 border-blue-200">
            <p className="text-sm text-blue-900 font-semibold">
              Presented: {presentedCount} / {totalPlayerCount}
            </p>
          </Card>
        </div>

        {/* Player Selection Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {playersToShow.map((player) => {
            const playlist = allPlaylists.find(p => p.seasonPlayerId === player._id);
            return (
              <Card
                key={player._id}
                onClick={() => !isSelecting && handleSelectPresenter(player._id)}
                className={`p-3 border-2 cursor-pointer transition-all ${isSelecting
                    ? 'opacity-50 cursor-not-allowed'
                    : 'hover:border-blue-400 hover:shadow-lg border-gray-300'
                  }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-sm font-bold">{player.labelName}</h3>
                      {playlist?.selectedOption && (
                        <span className="text-xs font-semibold px-1.5 py-0.5 bg-purple-100 text-purple-800 rounded border border-purple-200">
                          {playlist.selectedOption}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <p className="text-xs text-gray-600">
                        {playlist?.trackCount || 0} tracks
                      </p>
                      {playlist?.spotifyPlaylistUrl && (
                        <a
                          href={playlist.spotifyPlaylistUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="text-xs text-blue-600 hover:text-blue-800 hover:underline"
                        >
                          Playlist →
                        </a>
                      )}
                    </div>
                  </div>
                  <Button
                    disabled={isSelecting}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSelectPresenter(player._id);
                    }}
                    size="sm"
                  >
                    {isSelecting ? 'Selecting...' : 'Select'}
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      </div>
    );
  }

  // During presentation - show current presenter's tracks
  if (presentationState.status === 'IN_PROGRESS' && presentationState.currentPresenterId && currentPresenterTracks) {
    const currentPresenter = allPlaylists.find(
      p => p.seasonPlayerId === presentationState.currentPresenterId
    );
    const currentTrackIndex = presentationState.currentTrackIndex;
    const totalTracks = currentPresenterTracks.length;
    const canGoBack = currentTrackIndex >= 0;
    const allRevealed = currentTrackIndex >= totalTracks - 1;

    return (
      <div className="container mx-auto py-4 px-4 max-w-4xl">
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
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-sm text-gray-500 uppercase tracking-wide font-semibold mb-1">
                <span>Week {season.currentWeek}</span>
                <span className="text-xs opacity-50">•</span>
                <span>{season.challengeTitle || 'Challenge'}</span>
              </div>
              <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-1">
                {currentPresenter?.userName ? `${currentPresenter.userName}'s Playlist` : `${currentPresenter?.labelName}'s Playlist`}
              </h1>
              <p className="text-lg text-purple-700 font-medium">
                {currentPresenter?.labelName}
              </p>
            </div>
            <div className="flex flex-col items-end gap-2">
              {currentPresenter?.selectedOption && (
                <span className="text-xs font-bold px-3 py-1 bg-purple-100 text-purple-800 rounded-full border border-purple-200">
                  {currentPresenter.selectedOption}
                </span>
              )}
              {currentPresenter?.spotifyPlaylistUrl && (
                <a
                  href={currentPresenter.spotifyPlaylistUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-blue-600 hover:text-blue-800 hover:underline whitespace-nowrap font-medium"
                >
                  View Playlist →
                </a>
              )}
            </div>
          </div>
        </div>

        {/* Tracks Display */}
        <div className="space-y-2 mb-4">
          {currentPresenterTracks.map((track, index) => {
            const isRevealed = index <= currentTrackIndex;
            const isNextToReveal = index === currentTrackIndex + 1;
            // Gradually reduce blur: fully blurred (12px) -> next to reveal (8px) -> revealed (0px)
            const blurIntensity = isRevealed ? 0 : isNextToReveal ? 8 : 12;

            return (
              <Card
                key={track._id}
                onClick={() => isNextToReveal && !isRevealing && handleTrackClick(index)}
                className={`p-2 border-2 relative overflow-hidden ${isRevealed
                    ? 'border-gray-300 bg-white'
                    : isNextToReveal
                      ? 'border-blue-400 bg-blue-50 cursor-pointer hover:border-blue-500'
                      : 'border-gray-200 bg-gray-100'
                  }`}
              >
                {/* Track Content - Always visible */}
                <div className="flex gap-3 items-center relative z-10">
                  {track.albumArt && (
                    <img
                      src={track.albumArt}
                      alt={track.trackName}
                      className="w-12 h-12 rounded object-cover flex-shrink-0"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-bold truncate">{track.trackName}</h3>
                    <p className="text-xs text-gray-600 truncate">
                      {track.artistNames.join(', ')}
                    </p>
                  </div>
                  <p className="text-xs text-gray-500 flex-shrink-0">
                    {Math.floor(track.duration / 1000 / 60)}:
                    {String(Math.floor((track.duration / 1000) % 60)).padStart(2, '0')}
                  </p>
                </div>

                {/* Blurred Overlay - Always rendered but fades out */}
                <div
                  className={`absolute inset-0 z-20 flex items-center justify-center ${isRevealed ? 'opacity-0 pointer-events-none' : 'opacity-100'
                    }`}
                  style={{
                    backdropFilter: `blur(${blurIntensity}px)`,
                    WebkitBackdropFilter: `blur(${blurIntensity}px)`,
                    background: 'rgba(255, 255, 255, 0.85)',
                    transition: 'opacity 3s cubic-bezier(0.25, 0.46, 0.45, 0.94), backdrop-filter 3s cubic-bezier(0.25, 0.46, 0.45, 0.94), -webkit-backdrop-filter 3s cubic-bezier(0.25, 0.46, 0.45, 0.94), background 3s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
                  }}
                >
                  {isNextToReveal && !isRevealed && (
                    <div className="text-center">
                      <p className="text-xs text-gray-600 font-semibold">Track {index + 1} - Click to reveal</p>
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>

        {/* Controls */}
        <div className="flex gap-2 justify-center mt-2">
          <Button
            onClick={handleRevealPrevious}
            disabled={!canGoBack || isRevealing}
            variant="outline"
            size="sm"
          >
            <ChevronLeft className="w-3 h-3 mr-1" />
            Previous
          </Button>
          {allRevealed && (
            <Button
              onClick={handleCompletePresentation}
              disabled={isCompleting}
              className="bg-green-600 hover:bg-green-700"
              size="sm"
            >
              <CheckCircle2 className="w-3 h-3 mr-1" />
              {isCompleting ? 'Completing...' : 'Done'}
            </Button>
          )}
        </div>
        {!allRevealed && (
          <p className="text-center text-gray-500 mt-2 text-xs">
            Click the next blurred track to reveal
          </p>
        )}
      </div>
    );
  }

  // Completed - all presentations done
  if (presentationState.status === 'COMPLETED') {
    return (
      <div className="container mx-auto py-8 px-4 max-w-4xl">
        <Card className="p-8 border-green-200 bg-green-50 text-center">
          <CheckCircle2 className="w-16 h-16 text-green-600 mx-auto mb-4" />
          <h1 className="text-3xl font-bold text-green-900 mb-4">
            All Playlists Presented!
          </h1>
          <p className="text-green-800 mb-6">
            All {totalPlayerCount} players have presented their playlists for Week {season.currentWeek}.
          </p>
          <p className="text-green-700 mb-6">
            The season has advanced to the voting phase.
          </p>
          <Button
            onClick={() => router.push(`/seasons/${seasonId}`)}
            className="bg-green-600 hover:bg-green-700"
          >
            Return to Season Dashboard
          </Button>
        </Card>
      </div>
    );
  }

  return null;
}

