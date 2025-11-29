'use client';

import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useAction } from 'convex/react';
import { api } from 'convex/_generated/api';
import type { Id } from 'convex/_generated/dataModel';
import { useAuth } from '~/lib/auth-context';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { Card } from '~/components/ui/card';
import { Alert, AlertDescription } from '~/components/ui/alert';
import { Badge } from '~/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '~/components/ui/dialog';
import { Loader2, AlertCircle, CheckCircle, CheckCircle2, Music, Trash2, Trophy } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import Link from 'next/link';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import OptionSelectionBoard from './components/option-selection-board';
import { toast } from 'sonner';

const playlistUrlSchema = z.object({
  spotifyUrl: z
    .string()
    .url('Must be a valid URL')
    .regex(
      /spotify\.com\/playlist/,
      'Must be a Spotify playlist URL'
    ),
});

type PlaylistUrlForm = z.infer<typeof playlistUrlSchema>;

const commissionerPlaylistSchema = z.object({
  playlistUrl: z
    .string()
    .url('Must be a valid URL')
    .regex(
      /spotify\.com\/playlist/,
      'Must be a Spotify playlist URL'
    ),
});

type CommissionerPlaylistForm = z.infer<typeof commissionerPlaylistSchema>;

/**
 * Commissioner view to submit playlists for all players
 */
function CommissionerView({
  seasonId,
  pageData,
  seasonPlayers,
}: {
  seasonId: Id<'seasons'>;
  pageData: {
    season: { name: string; currentWeek: number; currentPhase: string };
    challenge: {
      title: string;
      description: string;
      emoji: string;
      constraints: { minTracks: number; maxTracks: number; rules: string[] };
      awardCategories: Array<{
        id: string;
        name: string;
        description: string;
        points: number;
      }>;
      category?: string;
    };
  };
  seasonPlayers: Array<{
    _id: Id<'season_players'>;
    labelName: string;
    user?: { id: string; displayName: string };
  }>;
}) {
  const { user } = useAuth();
  const [submittingFor, setSubmittingFor] = useState<string | null>(null);
  const [urlInputs, setUrlInputs] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const submitPlaylistMutation = useMutation(api.playlists.submitPlaylist);
  const fetchSpotifyPlaylistAction = useAction(api.actions.spotify.fetchAndValidatePlaylist);

  // Get all submitted playlists for this week
  const allSubmissions = useQuery(api.playlists.getWeekPlaylists, {
    seasonId,
    weekNumber: pageData.season.currentWeek,
  });

  const handleSubmitForPlayer = async (playerId: Id<'season_players'>, playerLabel: string) => {
    try {
      setErrors({});
      const url = urlInputs[playerId];

      if (!url) {
        setErrors({ ...errors, [playerId]: 'URL is required' });
        return;
      }

      // Validate URL format
      if (!url.match(/spotify\.com\/playlist/)) {
        setErrors({ ...errors, [playerId]: 'Must be a valid Spotify playlist URL' });
        return;
      }

      if (!user?.id) {
        throw new Error('Not authenticated');
      }

      setSubmittingFor(playerId);

      // First, fetch and validate the playlist via the action
      const playlistData = await fetchSpotifyPlaylistAction({
        spotifyUrl: url,
      });

      // Then submit with the fetched tracks
      const response = await submitPlaylistMutation({
        seasonId,
        spotifyUrl: url,
        requestingUserId: user.id as Id<'users'>,
        seasonPlayerIdToSubmitFor: playerId,
        tracks: playlistData.tracks,
      });

      setUrlInputs({ ...urlInputs, [playerId]: '' });
      setSubmittingFor(null);
    } catch (error) {
      setErrors({
        ...errors,
        [playerId]: error instanceof Error ? error.message : 'Failed to submit playlist',
      });
      setSubmittingFor(null);
    }
  };

  return (
    <div className="mt-12 border-t-4 border-purple-200 pt-8">
      <h3 className="text-2xl font-bold text-purple-900 mb-6">Commissioner: Add Playlists</h3>

      {/* Submissions Summary */}
      {allSubmissions && (
        <div className="mb-8">
          <p className="text-sm font-semibold text-gray-700 mb-3">
            Submissions: {allSubmissions.filter(s => s._id).length} / {seasonPlayers.length}
          </p>
          <div className="grid gap-3">
            {allSubmissions.map((submission) => (
              <div key={submission._id} className="flex items-center gap-2 p-2 bg-green-50 rounded border border-green-200">
                <CheckCircle className="w-4 h-4 text-green-600" />
                <span className="text-sm text-green-900">{submission.player.labelName}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Player Input Cards */}
      <div className="space-y-4">
        {seasonPlayers.map((player) => {
          const hasSubmitted = allSubmissions?.some(
            (s) => s.seasonPlayerId.toString() === player._id.toString()
          );

          if (hasSubmitted) return null;

          return (
            <Card key={player._id} className="p-4 border-2 border-purple-100">
              <div className="flex items-end gap-3">
                <div className="flex-1">
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    {player.labelName}
                  </label>
                  <div className="relative">
                    <Music className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <Input
                      placeholder="https://open.spotify.com/playlist/..."
                      className="pl-10"
                      value={urlInputs[player._id] || ''}
                      onChange={(e) =>
                        setUrlInputs({ ...urlInputs, [player._id]: e.target.value })
                      }
                      disabled={submittingFor === player._id}
                    />
                  </div>
                  {errors[player._id] && (
                    <p className="text-red-600 text-xs mt-1">{errors[player._id]}</p>
                  )}
                </div>
                <Button
                  onClick={() => handleSubmitForPlayer(player._id, player.labelName)}
                  disabled={submittingFor === player._id}
                  className="bg-purple-600 hover:bg-purple-700 text-white flex-shrink-0"
                >
                  {submittingFor === player._id ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    'Add'
                  )}
                </Button>
              </div>
            </Card>
          );
        })}
      </div>

      {seasonPlayers.filter((p) => !allSubmissions?.some((s) => s.seasonPlayerId.toString() === p._id.toString())).length === 0 && (
        <Card className="p-6 border-2 border-green-200 bg-green-50">
          <div className="flex gap-3 items-center">
            <CheckCircle className="w-6 h-6 text-green-600 flex-shrink-0" />
            <div>
              <p className="font-semibold text-green-900">All playlists submitted!</p>
              <p className="text-sm text-green-800">All players have playlists for this week.</p>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

/**
 * Component to advance to submission phase (commissioner only)
 */
function AdvanceToSubmissionButton({
  seasonId,
}: {
  seasonId: Id<'seasons'>;
}) {
  const [isAdvancing, setIsAdvancing] = useState(false);
  const advancePhaseMutation = useMutation(api.challenges.advanceToSubmissionPhase);
  const { user } = useAuth();
  const router = useRouter();

  const handleAdvance = async () => {
    if (!user?.id) {
      toast.error('Not authenticated');
      return;
    }

    try {
      setIsAdvancing(true);
      await advancePhaseMutation({
        seasonId,
        requestingUserId: user.id as Id<'users'>,
      });
      toast.success('Advanced to submission phase!');
      // Refresh the page to show submission form
      setTimeout(() => {
        router.refresh();
      }, 500);
    } catch (error) {
      const errorMsg =
        error instanceof Error ? error.message : 'Failed to advance phase';
      toast.error(errorMsg);
    } finally {
      setIsAdvancing(false);
    }
  };

  return (
    <Card className="p-6 border-2 border-green-200 bg-green-50 mb-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-green-900 mb-1">
            All options selected!
          </h3>
          <p className="text-sm text-green-700">
            Ready to move to playlist submission phase.
          </p>
        </div>
        <Button
          onClick={handleAdvance}
          disabled={isAdvancing}
          className="bg-green-600 hover:bg-green-700 text-white"
        >
          {isAdvancing ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Advancing...
            </>
          ) : (
            'Advance to Submission Phase'
          )}
        </Button>
      </div>
    </Card>
  );
}

/**
 * Component to handle option selection
 */
function OptionSelectionContent({
  seasonId,
  currentSeasonPlayerId,
  optionSelectionStatus,
  isCommissioner,
}: {
  seasonId: Id<'seasons'>;
  currentSeasonPlayerId: Id<'season_players'> | undefined;
  optionSelectionStatus: {
    challengeSelectionId: Id<'challenge_selections'>;
    options: string[];
    selectionOrder: Array<{
      _id: Id<'season_players'>;
      labelName: string;
      displayName: string;
      rank: number;
      selectedOption: string | null;
    }>;
    currentTurnPlayer: {
      _id: Id<'season_players'> | undefined;
      labelName: string;
      displayName: string;
    } | null;
    selections: Array<{
      _id: Id<'challenge_option_selections'>;
      selectedOption: string;
      player: {
        _id: Id<'season_players'> | undefined;
        labelName: string;
        displayName: string;
      };
    }>;
    isComplete: boolean;
    availableOptions: string[];
  };
  isCommissioner?: boolean | null;
}) {
  const [isSelecting, setIsSelecting] = useState(false);
  const selectOptionMutation = useMutation(api.challenges.selectChallengeOption);
  const { user } = useAuth();

  const handleSelectOption = async (option: string) => {
    if (!user?.id) {
      toast.error('Not authenticated');
      return;
    }

    // When commissioner is selecting, use the current turn player
    const playerToSelectFor = isCommissioner && optionSelectionStatus.currentTurnPlayer
      ? optionSelectionStatus.currentTurnPlayer._id as Id<'season_players'>
      : undefined;

    try {
      setIsSelecting(true);
      await selectOptionMutation({
        seasonId,
        selectedOption: option,
        requestingUserId: user.id as Id<'users'>,
        seasonPlayerIdToSelectFor: playerToSelectFor,
      });
      toast.success('Option selected!');
    } catch (error) {
      const errorMsg =
        error instanceof Error ? error.message : 'Failed to select option';
      toast.error(errorMsg);
    } finally {
      setIsSelecting(false);
    }
  };

  return (
    <OptionSelectionBoard
      options={optionSelectionStatus.options}
      selectionOrder={optionSelectionStatus.selectionOrder.map(p => ({
        ...p,
        _id: p._id.toString(),
      }))}
      currentTurnPlayer={optionSelectionStatus.currentTurnPlayer ? {
        ...optionSelectionStatus.currentTurnPlayer,
        _id: optionSelectionStatus.currentTurnPlayer._id?.toString() || '',
      } : null}
      selections={optionSelectionStatus.selections.map(s => ({
        ...s,
        _id: s._id.toString(),
        player: {
          ...s.player,
          _id: s.player._id?.toString() || '',
        },
      }))}
      isComplete={optionSelectionStatus.isComplete}
      currentPlayerId={currentSeasonPlayerId?.toString() || ''}
      onSelectOption={handleSelectOption}
      isLoading={isSelecting}
      isCommissioner={!!isCommissioner}
    />
  );
}

/**
 * Component to display current submission or form
 */
function SubmissionContent({
  seasonId,
  currentSeasonPlayerId,
  pageData,
}: {
  seasonId: Id<'seasons'>;
  currentSeasonPlayerId: Id<'season_players'>;
  pageData: {
    season: { name: string; currentWeek: number; currentPhase: string };
    challenge: {
      title: string;
      description: string;
      emoji: string;
      constraints: { minTracks: number; maxTracks: number; rules: string[] };
      awardCategories: Array<{
        id: string;
        name: string;
        description: string;
        points: number;
      }>;
      category?: string;
    };
  };
}) {
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const { user } = useAuth();

  // Only query when both conditions are met
  const currentSubmission = useQuery(api.playlists.getPlaylistSubmission, {
    seasonId,
    weekNumber: pageData.season.currentWeek,
    seasonPlayerId: currentSeasonPlayerId,
  });

  const submitPlaylistMutation = useMutation(api.playlists.submitPlaylist);
  const deletePlaylistMutation = useMutation(api.playlists.deletePlaylistSubmission);
  const fetchSpotifyPlaylistAction = useAction(api.actions.spotify.fetchAndValidatePlaylist);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<PlaylistUrlForm>({
    resolver: zodResolver(playlistUrlSchema),
  });

  const onSubmit = async (data: PlaylistUrlForm) => {
    try {
      setSubmitError(null);
      setSubmitSuccess(false);

      if (!user?.id) {
        throw new Error('Not authenticated');
      }

      // First, fetch and validate the playlist via the action
      const playlistData = await fetchSpotifyPlaylistAction({
        spotifyUrl: data.spotifyUrl,
      });

      // Then submit with the fetched tracks
      await submitPlaylistMutation({
        seasonId,
        spotifyUrl: data.spotifyUrl,
        requestingUserId: user.id as Id<'users'>,
        tracks: playlistData.tracks,
      });

      setSubmitSuccess(true);
      reset();
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : 'Failed to submit playlist'
      );
    }
  };

  const handleDeletePlaylist = async () => {
    try {
      setIsDeleting(true);
      if (!user?.id) {
        throw new Error('Not authenticated');
      }

      await deletePlaylistMutation({
        seasonId,
        weekNumber: pageData.season.currentWeek,
        requestingUserId: user.id as Id<'users'>,
      });

      setShowDeleteConfirm(false);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to delete playlist');
      setIsDeleting(false);
    }
  };

  if (!currentSubmission && currentSubmission !== null) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  return (
    <>
      {currentSubmission ? (
        <Card className="p-6 border-2 border-green-200 bg-green-50">
          <div className="flex gap-3 mb-4 justify-between">
            <div className="flex gap-3">
              <CheckCircle className="w-6 h-6 text-green-600 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold text-green-900">
                  ✓ Playlist Submitted
                </h3>
                <p className="text-sm text-green-800 mt-1">
                  Your playlist has been validated and locked for this week.
                </p>
              </div>
            </div>
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors flex-shrink-0"
              title="Delete playlist"
            >
              <Trash2 className="w-4 h-4" />
              Delete
            </button>
          </div>

          {/* Track Preview */}
          <div className="mt-6 pt-6 border-t border-green-200">
            <p className="font-semibold text-green-900 mb-4">Your Playlist ({currentSubmission.tracks.length} tracks):</p>
            <div className="space-y-3">
              {currentSubmission.tracks.map((track) => (
                <div
                  key={track.spotifyTrackId}
                  className="flex gap-3 p-3 bg-white rounded-lg border border-green-100"
                >
                  {track.albumArt && (
                    <img
                      src={track.albumArt}
                      alt={track.trackName}
                      className="w-12 h-12 rounded object-cover flex-shrink-0"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-green-900 truncate">
                      {track.trackName}
                    </p>
                    <p className="text-sm text-green-700 truncate">
                      {track.artistNames.join(', ')}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Card>
      ) : (
        <>
          {submitError && (
            <Alert className="mb-6 border-red-200 bg-red-50">
              <AlertCircle className="h-4 w-4 text-red-600" />
              <AlertDescription className="text-red-800">
                {submitError}
              </AlertDescription>
            </Alert>
          )}

          {submitSuccess && (
            <Alert className="mb-6 border-green-200 bg-green-50">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-800">
                Playlist submitted successfully! Refreshing...
              </AlertDescription>
            </Alert>
          )}

          {/* Submission Form */}
          <Card className="p-6 border-2 border-blue-200">
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Spotify Playlist URL
                </label>
                <div className="relative">
                  <Music className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <Input
                    {...register('spotifyUrl')}
                    placeholder="https://open.spotify.com/playlist/..."
                    className="pl-10"
                    disabled={isSubmitting}
                  />
                </div>
                {errors.spotifyUrl && (
                  <p className="text-red-600 text-sm mt-1">
                    {errors.spotifyUrl.message}
                  </p>
                )}
                <p className="text-xs text-gray-500 mt-2">
                  Paste the full URL to your Spotify playlist. All tracks must be from your roster.
                </p>
              </div>

              <Button
                type="submit"
                disabled={isSubmitting}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  'Submit Playlist'
                )}
              </Button>
            </form>
          </Card>
        </>
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex gap-2 items-center text-red-600">
              <AlertCircle className="w-5 h-5" />
              Delete Playlist?
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to delete your playlist? You can submit a new one.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowDeleteConfirm(false)}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              onClick={handleDeletePlaylist}
              disabled={isDeleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                'Delete'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default function PlaylistSubmissionPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const seasonId = (params?.seasonId as string) || '';

  // Get season to check if user is commissioner
  const seasonData = useQuery(api.seasons.getSeason, {
    seasonId: seasonId as Id<'seasons'>,
  });

  // Get season players to find current user's season player
  const seasonPlayers = useQuery(api.seasons.getSeasonPlayers, {
    seasonId: seasonId as Id<'seasons'>,
  });

  // Find the current user's season player
  const currentSeasonPlayerId = seasonPlayers?.find(
    (p) => p.user?.id === user?.id
  )?._id;

  // Check if user is commissioner
  const isCommissioner =
    seasonData && user && seasonData.league.commissioner.id === user.id;

  const pageData = useQuery(api.playlists.getPlaylistSubmissionPageData, {
    seasonId: seasonId as Id<'seasons'>,
  });

  // Get voting session to check if voting is complete
  const votingSession = useQuery(
    api.voting.getVotingSession,
    seasonData?.currentPhase === 'VOTING'
      ? {
          seasonId: seasonId as Id<'seasons'>,
          weekNumber: seasonData.currentWeek,
        }
      : 'skip'
  );

  if (!user || !seasonData) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  // If pageData is null, it means no challenge has been selected yet and we're not in selection phase
  if (pageData === null) {
    return (
      <div className="container mx-auto py-8 px-4">
        <Card className="p-6 border-blue-200 bg-blue-50">
          <div className="flex gap-3">
            <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-blue-900">Challenge Not Selected</p>
              <p className="text-sm text-blue-800 mt-1">
                No challenge has been selected for this week yet. Check back after challenge selection.
              </p>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  // Still loading
  if (pageData === undefined) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  // If not a player and not a commissioner, show error
  if (!currentSeasonPlayerId && !isCommissioner) {
    return (
      <div className="container mx-auto py-8 px-4">
        <Card className="p-6 border-red-200 bg-red-50">
          <div className="flex gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-red-900">Access Denied</p>
              <p className="text-sm text-red-800 mt-1">
                You are not registered as a player or commissioner in this season.
              </p>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  const { challenge, season, optionSelectionStatus } = pageData;

  // Handle case where challenge hasn't been selected yet
  if (!challenge) {
    return (
      <div className="container mx-auto py-6 px-4 max-w-4xl">
        <Card className="p-6 border-blue-200 bg-blue-50">
          <div className="flex gap-3">
            <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-blue-900">Challenge Not Selected</p>
              <p className="text-sm text-blue-800 mt-1">
                No challenge has been selected for Week {season.currentWeek} yet.
                {season.currentPhase === 'IN_SEASON_CHALLENGE_SELECTION' && ' Waiting for challenge selection.'}
              </p>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  // Check if we should show option selection UI
  // Only show during IN_SEASON_CHALLENGE_SELECTION phase when options exist
  const hasOptions = challenge.options && challenge.options.length > 0;
  const showOptionSelection =
    hasOptions &&
    optionSelectionStatus &&
    !optionSelectionStatus.isComplete &&
    season.currentPhase === 'IN_SEASON_CHALLENGE_SELECTION' &&
    (currentSeasonPlayerId || isCommissioner);

  // Get current player's selected option (for display after selection phase)
  const currentPlayerSelectedOption = currentSeasonPlayerId && optionSelectionStatus
    ? optionSelectionStatus.selections.find(
      (s) => s.player._id?.toString() === currentSeasonPlayerId.toString()
    )?.selectedOption
    : null;

  // Check if we're past the selection phase
  const isPastSelectionPhase = season.currentPhase !== 'IN_SEASON_CHALLENGE_SELECTION';

  return (
    <div className="container mx-auto py-6 px-4 max-w-4xl">
      {/* Challenge Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-3">
            <div className="text-4xl">{challenge.emoji}</div>
            <h1 className="text-3xl font-bold text-gray-900">
              {challenge.title}
            </h1>
          </div>
          <span className="text-base font-normal text-gray-500">
            Week {season.currentWeek} Challenge
          </span>
        </div>
      </div>

      {/* Challenge Content */}
      <div className="mb-6">
        <div className="mb-3">
          <p className="text-base leading-relaxed text-gray-800 mb-4 max-w-3xl">{challenge.description}</p>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-gray-600 font-semibold">Category</p>
              <p className="text-gray-900">{challenge.category}</p>
            </div>
            <div>
              <p className="text-gray-600 font-semibold">Track Count</p>
              <p className="text-gray-900">
                {challenge.constraints.minTracks} - {challenge.constraints.maxTracks} tracks
              </p>
            </div>
          </div>
        </div>

        {/* Rules */}
        {challenge.constraints.rules.length > 0 && (
          <div className="mt-4 pt-4 border-t border-gray-200">
            <p className="text-sm font-semibold text-gray-900 mb-2">Rules:</p>
            <ul className="space-y-1.5">
              {challenge.constraints.rules.map((rule, idx) => (
                <li key={idx} className="text-sm text-gray-700 flex gap-2">
                  <span className="text-gray-500">•</span>
                  {rule}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Selected Option Display - shown after selection phase */}
        {hasOptions && isPastSelectionPhase && currentPlayerSelectedOption && (
          <div className="mt-4 pt-4 border-t border-gray-200 mb-3">
            <div className="flex items-start gap-2 pb-2">
              <CheckCircle2 className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-blue-900 mb-1">Your Selected Option:</p>
                <p className="text-sm font-bold text-blue-950">{currentPlayerSelectedOption}</p>
              </div>
            </div>
          </div>
        )}

        {/* Award Categories */}
        {challenge.awardCategories.length > 0 && (
          <div className="mt-4 pt-4 border-t border-gray-200">
            <p className="text-sm font-semibold text-gray-900 mb-3">Award Categories:</p>
            <div className="space-y-2">
              {challenge.awardCategories.map((cat, index) => {
                const is1pt = cat.points === 1;
                const is2pt = cat.points === 2;
                const is3pt = cat.points === 3;
                const isFirst2pt = is2pt && (index === 0 || challenge.awardCategories[index - 1]?.points !== 2);

                return (
                  <div
                    key={cat.id}
                    className={`
                      rounded-lg border-2 p-3 transition-all
                      ${is1pt
                        ? 'bg-gray-50 border-gray-200'
                        : is2pt
                          ? 'bg-yellow-100 border-yellow-400'
                          : 'bg-gradient-to-r from-red-100 via-pink-100 to-purple-100 border-purple-400 shadow-md'
                      }
                      ${is3pt ? 'scale-[1.01] -mx-1 mt-4' : ''}
                      ${isFirst2pt && index > 0 ? 'mt-3' : ''}
                    `}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <p className={`${is3pt ? 'text-base' : 'text-sm'} font-semibold ${is1pt ? 'text-gray-700' : is2pt ? 'text-yellow-900' : 'text-purple-900'}`}>
                          {cat.name}
                        </p>
                        {cat.description && (
                          <p className={`${is3pt ? 'text-sm' : 'text-xs'} mt-1 ${is1pt ? 'text-gray-500' : is2pt ? 'text-yellow-800' : 'text-purple-800'}`}>
                            {cat.description}
                          </p>
                        )}
                      </div>
                      <Badge
                        variant="outline"
                        className={`
                          flex-shrink-0 ml-3 text-xs
                          ${is1pt
                            ? 'bg-gray-100 text-gray-700 border-gray-300'
                            : is2pt
                              ? 'bg-yellow-200 text-yellow-900 border-yellow-500'
                              : 'bg-pink-200 text-purple-900 border-purple-500 font-bold'
                          }
                        `}
                      >
                        {cat.points} {cat.points === 1 ? 'pt' : 'pts'}
                      </Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Option Selection - shown if challenge has options and selections incomplete */}
      {showOptionSelection && optionSelectionStatus && (
        <OptionSelectionContent
          seasonId={seasonId as Id<'seasons'>}
          currentSeasonPlayerId={currentSeasonPlayerId}
          optionSelectionStatus={optionSelectionStatus}
          isCommissioner={isCommissioner}
        />
      )}

      {/* Advance to Submission Phase Button - shown when options are complete */}
      {hasOptions &&
        optionSelectionStatus &&
        optionSelectionStatus.isComplete &&
        season.currentPhase === 'IN_SEASON_CHALLENGE_SELECTION' &&
        isCommissioner && (
          <AdvanceToSubmissionButton seasonId={seasonId as Id<'seasons'>} />
        )}

      {/* Submission Content - rendered only for players when options are complete or no options */}
      {currentSeasonPlayerId && !showOptionSelection && (
        <SubmissionContent
          seasonId={seasonId as Id<'seasons'>}
          currentSeasonPlayerId={currentSeasonPlayerId}
          pageData={pageData}
        />
      )}

      {/* Commissioner View - allow adding playlists for all players */}
      {isCommissioner && seasonPlayers && season.currentPhase !== 'IN_SEASON_CHALLENGE_SELECTION' && (
        <CommissionerView
          seasonId={seasonId as Id<'seasons'>}
          pageData={pageData}
          seasonPlayers={seasonPlayers}
        />
      )}

      {/* Phase-Specific Actions */}
      <div className="mt-8 pt-6 border-t border-gray-200">
        {season.currentPhase === 'PLAYLIST_PRESENTATION' && (
          <Card className="p-4 border-purple-200 bg-purple-50">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-purple-900 mb-1">Live Presentation</h3>
                <p className="text-sm text-purple-800">Watch the playlist presentations happening now</p>
              </div>
              <Button
                onClick={() => router.push(`/seasons/${seasonId}/presentation`)}
                className="bg-purple-600 hover:bg-purple-700"
              >
                Join Presentation →
              </Button>
            </div>
          </Card>
        )}

        {season.currentPhase === 'VOTING' && votingSession?.status === 'CLOSED' && (
          <Card className="p-4 border-yellow-200 bg-yellow-50">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Trophy className="w-6 h-6 text-yellow-600" />
                <div>
                  <h3 className="font-semibold text-yellow-900 mb-1">Voting Complete!</h3>
                  <p className="text-sm text-yellow-800">Results have been calculated for Week {season.currentWeek}</p>
                </div>
              </div>
              <Link href={`/seasons/${seasonId}/results/${season.currentWeek}`}>
                <Button className="bg-yellow-600 hover:bg-yellow-700">
                  View Results →
                </Button>
              </Link>
            </div>
          </Card>
        )}

        {season.currentPhase === 'VOTING' && votingSession?.status !== 'CLOSED' && (
          <Card className="p-4 border-green-200 bg-green-50">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-green-900 mb-1">Award Show Voting</h3>
                <p className="text-sm text-green-800">Vote on this week's award categories</p>
              </div>
              <Button
                onClick={() => router.push(`/seasons/${seasonId}/vote`)}
                className="bg-green-600 hover:bg-green-700"
              >
                Go to Voting →
              </Button>
            </div>
          </Card>
        )}

        {season.currentPhase === 'IN_SEASON_WEEK_END' && (
          <Card className="p-4 border-gray-200 bg-gray-50">
            <div>
              <h3 className="font-semibold text-gray-900 mb-1">Week Complete</h3>
              <p className="text-sm text-gray-700">This week's challenge has been completed. Results are being finalized.</p>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
