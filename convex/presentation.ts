import { mutation, query } from './_generated/server';
import { v } from 'convex/values';
import type { Id } from 'convex/_generated/dataModel';
import { logEvent } from './events';

/**
 * Mutation: Refresh a single playlist's tracks (called from action)
 */
export const refreshPlaylistTracks = mutation({
  args: {
    submissionId: v.id('playlist_submissions'),
    tracks: v.array(
      v.object({
        spotifyTrackId: v.string(),
        trackName: v.string(),
        artistNames: v.array(v.string()),
        albumArt: v.string(),
        duration: v.number(),
        position: v.number(),
        rawSpotifyData: v.any(),
      })
    ),
    weekNumber: v.number(),
    seasonId: v.id('seasons'),
    requestingUserId: v.id('users'),
  },
  handler: async (ctx, args) => {
    const submission = await ctx.db.get(args.submissionId);
    if (!submission) {
      throw new Error('Submission not found');
    }

    // Delete old tracks
    const oldTracks = await ctx.db
      .query('playlist_tracks')
      .withIndex('by_playlistSubmissionId', (q) =>
        q.eq('playlistSubmissionId', args.submissionId)
      )
      .collect();

    for (const track of oldTracks) {
      await ctx.db.delete(track._id);
    }

    // Add new tracks
    for (const track of args.tracks) {
      await ctx.db.insert('playlist_tracks', {
        playlistSubmissionId: args.submissionId,
        spotifyTrackId: track.spotifyTrackId,
        trackName: track.trackName,
        artistNames: track.artistNames,
        albumArt: track.albumArt,
        duration: track.duration,
        position: track.position,
        rawSpotifyData: track.rawSpotifyData,
        createdAt: Date.now(),
      });
    }

    // Log refresh event
    const player = await ctx.db.get(submission.seasonPlayerId);
    await logEvent(
      ctx,
      args.seasonId,
      'PLAYLIST_REFRESHED',
      {
        week: args.weekNumber,
        player: player?.labelName,
        trackCount: args.tracks.length,
        changes: {
          added: [],
          removed: [],
          reordered: false,
        },
      },
      args.requestingUserId
    );
  },
});

/**
 * Mutation: Initialize presentation state (called from action after refresh)
 */
export const initializePresentationState = mutation({
  args: {
    seasonId: v.id('seasons'),
    weekNumber: v.number(),
    requestingUserId: v.id('users'),
  },
  handler: async (ctx, args) => {
    const season = await ctx.db.get(args.seasonId);
    if (!season) {
      throw new Error('Season not found');
    }

    // Verify requester is commissioner
    const league = await ctx.db.get(season.leagueId);
    if (!league) {
      throw new Error('League not found');
    }
    if (args.requestingUserId !== league.commissionerId) {
      throw new Error('Only commissioners can start presentation phase');
    }

    // Advance season phase to PLAYLIST_PRESENTATION
    await ctx.db.patch(args.seasonId, {
      currentPhase: 'PLAYLIST_PRESENTATION',
    });

    // Create presentation_state record
    const presentationStateId = await ctx.db.insert('presentation_state', {
      seasonId: args.seasonId,
      weekNumber: args.weekNumber,
      currentPresenterId: undefined,
      currentTrackIndex: -1,
      presentedPlayerIds: [],
      status: 'NOT_STARTED',
      startedAt: Date.now(),
    });

    // Log event
    await logEvent(
      ctx,
      args.seasonId,
      'PRESENTATION_PHASE_STARTED',
      {
        week: args.weekNumber,
      },
      args.requestingUserId
    );

    return presentationStateId;
  },
});

/**
 * Mutation: Select a presenter to go next
 */
export const selectPresenter = mutation({
  args: {
    seasonId: v.id('seasons'),
    weekNumber: v.number(),
    seasonPlayerId: v.id('season_players'),
    requestingUserId: v.id('users'),
  },
  handler: async (ctx, args) => {
    const season = await ctx.db.get(args.seasonId);
    if (!season) {
      throw new Error('Season not found');
    }

    // Verify requester is commissioner
    const league = await ctx.db.get(season.leagueId);
    if (!league) {
      throw new Error('League not found');
    }
    if (args.requestingUserId !== league.commissionerId) {
      throw new Error('Only commissioners can select presenters');
    }

    // Get presentation_state
    const presentationState = await ctx.db
      .query('presentation_state')
      .withIndex('by_seasonId_weekNumber', (q) =>
        q.eq('seasonId', args.seasonId).eq('weekNumber', args.weekNumber)
      )
      .first();

    if (!presentationState) {
      throw new Error('Presentation state not found');
    }

    // Update presentation_state
    await ctx.db.patch(presentationState._id, {
      currentPresenterId: args.seasonPlayerId,
      currentTrackIndex: -1,
      status: 'IN_PROGRESS',
    });

    // Log event
    const player = await ctx.db.get(args.seasonPlayerId);
    await logEvent(
      ctx,
      args.seasonId,
      'PRESENTER_SELECTED',
      {
        week: args.weekNumber,
        presenter: player?.labelName,
      },
      args.requestingUserId
    );

    return presentationState._id;
  },
});

/**
 * Mutation: Reveal next track in current presenter's playlist
 */
export const revealNextTrack = mutation({
  args: {
    seasonId: v.id('seasons'),
    weekNumber: v.number(),
    requestingUserId: v.id('users'),
  },
  handler: async (ctx, args) => {
    const season = await ctx.db.get(args.seasonId);
    if (!season) {
      throw new Error('Season not found');
    }

    // Verify requester is commissioner
    const league = await ctx.db.get(season.leagueId);
    if (!league) {
      throw new Error('League not found');
    }
    if (args.requestingUserId !== league.commissionerId) {
      throw new Error('Only commissioners can reveal tracks');
    }

    // Get presentation_state
    const presentationState = await ctx.db
      .query('presentation_state')
      .withIndex('by_seasonId_weekNumber', (q) =>
        q.eq('seasonId', args.seasonId).eq('weekNumber', args.weekNumber)
      )
      .first();

    if (!presentationState) {
      throw new Error('Presentation state not found');
    }

    if (!presentationState.currentPresenterId) {
      throw new Error('No presenter selected');
    }

    // Get current presenter's playlist
    const submission = await ctx.db
      .query('playlist_submissions')
      .withIndex('by_seasonId_weekNumber', (q) =>
        q.eq('seasonId', args.seasonId).eq('weekNumber', args.weekNumber)
      )
      .collect()
      .then((subs) =>
        subs.find(
          (s) =>
            s.seasonPlayerId.toString() ===
            presentationState.currentPresenterId.toString()
        )
      );

    if (!submission) {
      throw new Error('No submission found for current presenter');
    }

    // Get playlist tracks
    const tracks = await ctx.db
      .query('playlist_tracks')
      .withIndex('by_playlistSubmissionId', (q) =>
        q.eq('playlistSubmissionId', submission._id)
      )
      .collect();

    const sortedTracks = tracks.sort((a, b) => a.position - b.position);
    const nextTrackIndex = presentationState.currentTrackIndex + 1;

    // Update presentation_state
    await ctx.db.patch(presentationState._id, {
      currentTrackIndex: nextTrackIndex,
    });

    // Log event
    const player = await ctx.db.get(presentationState.currentPresenterId);
    if (nextTrackIndex < sortedTracks.length) {
      const track = sortedTracks[nextTrackIndex];
      await logEvent(
        ctx,
        args.seasonId,
        'TRACK_REVEALED',
        {
          week: args.weekNumber,
          presenter: player?.labelName,
          trackNumber: nextTrackIndex + 1,
          track: {
            name: track.trackName,
            artist: track.artistNames.join(', '),
          },
        },
        args.requestingUserId
      );
    }

    return {
      currentTrackIndex: nextTrackIndex,
      totalTracks: sortedTracks.length,
      isComplete: nextTrackIndex >= sortedTracks.length,
    };
  },
});

/**
 * Mutation: Go to previous track
 */
export const revealPreviousTrack = mutation({
  args: {
    seasonId: v.id('seasons'),
    weekNumber: v.number(),
    requestingUserId: v.id('users'),
  },
  handler: async (ctx, args) => {
    const season = await ctx.db.get(args.seasonId);
    if (!season) {
      throw new Error('Season not found');
    }

    // Verify requester is commissioner
    const league = await ctx.db.get(season.leagueId);
    if (!league) {
      throw new Error('League not found');
    }
    if (args.requestingUserId !== league.commissionerId) {
      throw new Error('Only commissioners can navigate tracks');
    }

    // Get presentation_state
    const presentationState = await ctx.db
      .query('presentation_state')
      .withIndex('by_seasonId_weekNumber', (q) =>
        q.eq('seasonId', args.seasonId).eq('weekNumber', args.weekNumber)
      )
      .first();

    if (!presentationState) {
      throw new Error('Presentation state not found');
    }

    // Decrement track index (minimum -1)
    const newTrackIndex = Math.max(-1, presentationState.currentTrackIndex - 1);

    await ctx.db.patch(presentationState._id, {
      currentTrackIndex: newTrackIndex,
    });

    return {
      currentTrackIndex: newTrackIndex,
    };
  },
});

/**
 * Mutation: Complete current presenter's turn and optionally select next
 */
export const completePresentation = mutation({
  args: {
    seasonId: v.id('seasons'),
    weekNumber: v.number(),
    requestingUserId: v.id('users'),
  },
  handler: async (ctx, args) => {
    const season = await ctx.db.get(args.seasonId);
    if (!season) {
      throw new Error('Season not found');
    }

    // Verify requester is commissioner
    const league = await ctx.db.get(season.leagueId);
    if (!league) {
      throw new Error('League not found');
    }
    if (args.requestingUserId !== league.commissionerId) {
      throw new Error('Only commissioners can complete presentations');
    }

    // Get presentation_state
    const presentationState = await ctx.db
      .query('presentation_state')
      .withIndex('by_seasonId_weekNumber', (q) =>
        q.eq('seasonId', args.seasonId).eq('weekNumber', args.weekNumber)
      )
      .first();

    if (!presentationState) {
      throw new Error('Presentation state not found');
    }

    if (!presentationState.currentPresenterId) {
      throw new Error('No presenter currently selected');
    }

    // Add current presenter to presented list
    const presentedPlayerIds = [
      ...presentationState.presentedPlayerIds,
      presentationState.currentPresenterId,
    ];

    // Get all season players
    const allPlayers = await ctx.db
      .query('season_players')
      .withIndex('by_seasonId', (q) => q.eq('seasonId', args.seasonId))
      .collect();

    // Log event
    const presenter = await ctx.db.get(presentationState.currentPresenterId);
    await logEvent(
      ctx,
      args.seasonId,
      'PRESENTER_COMPLETE',
      {
        week: args.weekNumber,
        presenter: presenter?.labelName,
      },
      args.requestingUserId
    );

    // Check if all players have presented
    if (presentedPlayerIds.length >= allPlayers.length) {
      // All done - advance phase
      await ctx.db.patch(args.seasonId, {
        currentPhase: 'IN_SEASON_WEEK_END',
      });

      // Update presentation state
      await ctx.db.patch(presentationState._id, {
        currentPresenterId: undefined,
        currentTrackIndex: -1,
        presentedPlayerIds,
        status: 'COMPLETED',
        completedAt: Date.now(),
      });

      // Log completion
      await logEvent(
        ctx,
        args.seasonId,
        'PRESENTATION_COMPLETED',
        {
          week: args.weekNumber,
          totalPresenters: presentedPlayerIds.length,
        },
        args.requestingUserId
      );

      return {
        isComplete: true,
        presentedCount: presentedPlayerIds.length,
        totalCount: allPlayers.length,
        phaseAdvanced: true,
      };
    } else {
      // Reset for next presenter
      await ctx.db.patch(presentationState._id, {
        currentPresenterId: undefined,
        currentTrackIndex: -1,
        presentedPlayerIds,
      });

      return {
        isComplete: false,
        presentedCount: presentedPlayerIds.length,
        totalCount: allPlayers.length,
        phaseAdvanced: false,
      };
    }
  },
});

/**
 * Query: Get presentation page data
 */
export const getPresentationPageData = query({
  args: {
    seasonId: v.id('seasons'),
  },
  handler: async (ctx, args) => {
    const season = await ctx.db.get(args.seasonId);
    if (!season) {
      throw new Error('Season not found');
    }

    if (season.currentPhase !== 'PLAYLIST_PRESENTATION') {
      return null;
    }

    const weekNumber = season.currentWeek;

    // Get presentation_state
    const presentationState = await ctx.db
      .query('presentation_state')
      .withIndex('by_seasonId_weekNumber', (q) =>
        q.eq('seasonId', args.seasonId).eq('weekNumber', weekNumber)
      )
      .first();

    if (!presentationState) {
      return null;
    }

    // Get current challenge title
    let challengeTitle = 'Unknown Challenge';
    const challengeSelection = await ctx.db
      .query('challenge_selections')
      .withIndex('by_seasonId_weekNumber', (q) =>
        q.eq('seasonId', args.seasonId).eq('weekNumber', weekNumber)
      )
      .first();

    if (challengeSelection) {
      const boardChallenge = await ctx.db.get(challengeSelection.boardChallengeId);
      if (boardChallenge) {
        const canonical = await ctx.db.get(boardChallenge.canonicalChallengeId);
        if (canonical) {
          challengeTitle = canonical.title;
        }
      }
    }

    // Get all season players
    const allPlayers = await ctx.db
      .query('season_players')
      .withIndex('by_seasonId', (q) => q.eq('seasonId', args.seasonId))
      .collect();

    // Get all playlist submissions with tracks
    const submissions = await ctx.db
      .query('playlist_submissions')
      .withIndex('by_seasonId_weekNumber', (q) =>
        q.eq('seasonId', args.seasonId).eq('weekNumber', weekNumber)
      )
      .collect();

    const playlistsWithTracks = await Promise.all(
      submissions.map(async (submission) => {
        const tracks = await ctx.db
          .query('playlist_tracks')
          .withIndex('by_playlistSubmissionId', (q) =>
            q.eq('playlistSubmissionId', submission._id)
          )
          .collect();

        const player = await ctx.db.get(submission.seasonPlayerId);
        const user = player ? await ctx.db.get(player.userId) : null;
        const isPresented = presentationState.presentedPlayerIds.some(
          (id) => id.toString() === submission.seasonPlayerId.toString()
        );

        return {
          seasonPlayerId: submission.seasonPlayerId,
          labelName: player?.labelName,
          userName: user?.displayName,
          trackCount: tracks.length,
          isPresented,
          tracks: tracks.sort((a, b) => a.position - b.position),
          spotifyPlaylistUrl: submission.spotifyPlaylistUrl,
          selectedOption: submission.selectedOption,
        };
      })
    );

    // Get current presenter's tracks if selected
    let currentPresenterTracks = null;
    if (presentationState.currentPresenterId) {
      const currentSubmission = submissions.find(
        (s) =>
          s.seasonPlayerId.toString() ===
          presentationState.currentPresenterId.toString()
      );

      if (currentSubmission) {
        currentPresenterTracks = await ctx.db
          .query('playlist_tracks')
          .withIndex('by_playlistSubmissionId', (q) =>
            q.eq('playlistSubmissionId', currentSubmission._id)
          )
          .collect();
        currentPresenterTracks = currentPresenterTracks.sort(
          (a, b) => a.position - b.position
        );
      }
    }

    // Get remaining (not yet presented) players
    const remainingPlayers = allPlayers.filter(
      (p) =>
        !presentationState.presentedPlayerIds.some(
          (id) => id.toString() === p._id.toString()
        )
    );

    return {
      season: {
        name: season.name,
        currentWeek: weekNumber,
        currentPhase: season.currentPhase,
        challengeTitle,
      },
      presentationState,
      allPlaylists: playlistsWithTracks,
      currentPresenterTracks,
      remainingPlayers,
      allPlayers,
      presentedCount: presentationState.presentedPlayerIds.length,
      totalPlayerCount: allPlayers.length,
    };
  },
});
