'use node';

import { action } from '../_generated/server';
import { v } from 'convex/values';
import type { Id } from '../_generated/dataModel';
import { internal } from '../_generated/api';
import { fetchAndValidatePlaylist } from './spotify';

/**
 * Action: Start presentation phase - refresh all playlists from Spotify and initialize presentation
 * This is an action because it needs to call Spotify API (which requires fetch)
 */
export const startPresentationPhase = action({
  args: {
    seasonId: v.id('seasons'),
    requestingUserId: v.id('users'),
  },
  handler: async (ctx, args) => {
    // Get season to verify phase
    const season = await ctx.runQuery(internal.seasons.getSeason, {
      seasonId: args.seasonId,
    });

    if (!season) {
      throw new Error('Season not found');
    }

    if (season.currentPhase !== 'PLAYLIST_SUBMISSION') {
      throw new Error('Season must be in PLAYLIST_SUBMISSION phase');
    }

    const weekNumber = season.currentWeek;

    // Get all playlist submissions
    const submissions = await ctx.runQuery(internal.playlists.getWeekPlaylists, {
      seasonId: args.seasonId,
      weekNumber: weekNumber,
    });

    // Refresh each playlist from Spotify
    const refreshResults = [];
    for (const submission of submissions) {
      try {
        // Get the original submission to get the Spotify URL
        const originalSubmission = await ctx.runQuery(
          internal.playlists.getPlaylistSubmission,
          {
            seasonId: args.seasonId,
            weekNumber: weekNumber,
            seasonPlayerId: submission.seasonPlayerId,
          }
        );

        if (!originalSubmission) {
          continue;
        }

        // Fetch latest from Spotify
        const playlistData = await fetchAndValidatePlaylist(ctx, {
          spotifyUrl: originalSubmission.spotifyPlaylistUrl,
        });

        // Update tracks via mutation
        await ctx.runMutation(internal.presentation.refreshPlaylistTracks, {
          submissionId: originalSubmission._id,
          tracks: playlistData.tracks,
          weekNumber: weekNumber,
          seasonId: args.seasonId,
          requestingUserId: args.requestingUserId,
        });

        refreshResults.push({
          playerId: submission.seasonPlayerId,
          trackCount: playlistData.tracks.length,
          success: true,
        });
      } catch (error) {
        console.error(`Failed to refresh playlist:`, error);
        refreshResults.push({
          playerId: submission.seasonPlayerId,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    // Initialize presentation state via mutation
    await ctx.runMutation(internal.presentation.initializePresentationState, {
      seasonId: args.seasonId,
      weekNumber: weekNumber,
      requestingUserId: args.requestingUserId,
    });

    return {
      success: true,
      refreshedCount: refreshResults.filter((r) => r.success).length,
      totalCount: refreshResults.length,
    };
  },
});

