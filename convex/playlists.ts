import { mutation, query } from './_generated/server';
import { v } from 'convex/values';
import type { Id } from 'convex/_generated/dataModel';
import { logEvent } from './events';

/**
 * Query: Get playlist submission for a specific player and week
 */
export const getPlaylistSubmission = query({
  args: {
    seasonId: v.id('seasons'),
    weekNumber: v.number(),
    seasonPlayerId: v.id('season_players'),
  },
  handler: async (ctx, args) => {
    const submission = await ctx.db
      .query('playlist_submissions')
      .withIndex('by_seasonId_weekNumber', (q) =>
        q.eq('seasonId', args.seasonId).eq('weekNumber', args.weekNumber)
      )
      .collect()
      .then((subs) =>
        subs.find(
          (s) => s.seasonPlayerId.toString() === args.seasonPlayerId.toString()
        )
      );

    if (!submission) {
      return null;
    }

    // Get tracks (artist names are already stored from Spotify)
    const tracks = await ctx.db
      .query('playlist_tracks')
      .withIndex('by_playlistSubmissionId', (q) =>
        q.eq('playlistSubmissionId', submission._id)
      )
      .collect();

    return {
      ...submission,
      tracks,
    };
  },
});

/**
 * Query: Get all playlist submissions for a week with player details
 */
export const getWeekPlaylists = query({
  args: {
    seasonId: v.id('seasons'),
    weekNumber: v.number(),
  },
  handler: async (ctx, args) => {
    const submissions = await ctx.db
      .query('playlist_submissions')
      .withIndex('by_seasonId_weekNumber', (q) =>
        q.eq('seasonId', args.seasonId).eq('weekNumber', args.weekNumber)
      )
      .collect();

    const enriched = await Promise.all(
      submissions.map(async (submission) => {
        const player = await ctx.db.get(submission.seasonPlayerId);
        const user = player ? await ctx.db.get(player.userId) : null;

        const tracks = await ctx.db
          .query('playlist_tracks')
          .withIndex('by_playlistSubmissionId', (q) =>
            q.eq('playlistSubmissionId', submission._id)
          )
          .collect();

        return {
          ...submission,
          player: {
            labelName: player?.labelName || 'Unknown',
            user: user?.displayName || 'Unknown',
          },
          tracks,
        };
      })
    );

    return enriched;
  },
});

/**
 * Query: Get submission page data (challenge details and player's submission status)
 */
export const getPlaylistSubmissionPageData = query({
  args: {
    seasonId: v.id('seasons'),
  },
  handler: async (ctx, args) => {
    const season = await ctx.db.get(args.seasonId);
    if (!season) {
      throw new Error('Season not found');
    }

    const weekNumber = season.currentWeek;

    // Get current challenge - allow access if challenge exists for this week
    const challengeSelection = await ctx.db
      .query('challenge_selections')
      .withIndex('by_seasonId_weekNumber', (q) =>
        q.eq('seasonId', args.seasonId).eq('weekNumber', weekNumber)
      )
      .first();

    // If no challenge selected yet, only allow access during challenge selection phase
    if (!challengeSelection) {
      if (season.currentPhase !== 'IN_SEASON_CHALLENGE_SELECTION') {
        return null;
      }
      // During challenge selection phase but no challenge selected yet
      // Return basic season info but no challenge data
      return {
        season: {
          name: season.name,
          currentWeek: season.currentWeek,
          currentPhase: season.currentPhase,
        },
        challenge: null,
        optionSelectionStatus: null,
      };
    }

    // Challenge exists - allow access in all phases after selection

    const boardChallenge = await ctx.db.get(
      challengeSelection.boardChallengeId
    );
    if (!boardChallenge) {
      throw new Error('Board challenge not found');
    }

    const canonical = await ctx.db.get(boardChallenge.canonicalChallengeId);
    if (!canonical) {
      throw new Error('Canonical challenge not found');
    }

    const category = canonical ? await ctx.db.get(canonical.categoryId) : null;

    // Get option selection status if challenge has options
    let optionSelectionStatus = null;
    if (canonical.options && canonical.options.length > 0) {
      // Get all option selections for this challenge selection
      const optionSelections = await ctx.db
        .query('challenge_option_selections')
        .withIndex('by_challengeSelectionId', (q) =>
          q.eq('challengeSelectionId', challengeSelection._id)
        )
        .collect();

      // Get all season players for standings calculation
      const allPlayers = await ctx.db
        .query('season_players')
        .withIndex('by_seasonId', (q) => q.eq('seasonId', args.seasonId))
        .collect();

      const sortedPlayers = allPlayers.sort(
        (a, b) => b.totalPoints - a.totalPoints
      );
      const selectionOrder = [...sortedPlayers].reverse();

      // Enrich selections with player info
      const enrichedSelections = await Promise.all(
        optionSelections.map(async (selection) => {
          const player = await ctx.db.get(selection.seasonPlayerId);
          const user = player ? await ctx.db.get(player.userId) : null;
          return {
            ...selection,
            player: {
              _id: player?._id,
              labelName: player?.labelName || 'Unknown',
              displayName: user?.displayName || 'Unknown',
            },
          };
        })
      );

      const selectionsCount = enrichedSelections.length;
      const totalPlayers = selectionOrder.length;
      const isComplete = selectionsCount >= totalPlayers;

      // Get selected options
      const selectedOptions = new Set(
        enrichedSelections.map((s) => s.selectedOption)
      );
      const availableOptions = canonical.options.filter(
        (opt) => !selectedOptions.has(opt)
      );

      // Determine current turn player
      let currentTurnPlayer = null;
      if (!isComplete) {
        currentTurnPlayer = selectionOrder[selectionsCount];
      }

      // Enrich selection order with user info and selected options
      const enrichedSelectionOrder = await Promise.all(
        selectionOrder.map(async (player, index) => {
          const user = await ctx.db.get(player.userId);
          const selection = enrichedSelections.find(
            (s) => s.seasonPlayerId.toString() === player._id.toString()
          );
          return {
            _id: player._id,
            labelName: player.labelName,
            displayName: user?.displayName || 'Unknown',
            rank: index + 1, // 1-4, where 1 is 4th place
            selectedOption: selection?.selectedOption || null,
          };
        })
      );

      optionSelectionStatus = {
        challengeSelectionId: challengeSelection._id,
        options: canonical.options,
        selectionOrder: enrichedSelectionOrder,
        selections: enrichedSelections,
        isComplete,
        availableOptions,
        currentTurnPlayer: currentTurnPlayer
          ? {
              _id: currentTurnPlayer._id,
              labelName: currentTurnPlayer.labelName,
              displayName:
                (await ctx.db.get(currentTurnPlayer.userId))?.displayName ||
                'Unknown',
            }
          : null,
      };
    }

    return {
      season: {
        name: season.name,
        currentWeek: season.currentWeek,
        currentPhase: season.currentPhase,
      },
      challenge: {
        title: canonical.title,
        description: canonical.description,
        emoji: canonical.emoji,
        constraints: canonical.constraints,
        awardCategories: canonical.awardCategories,
        category: category?.name,
        options: canonical.options,
      },
      optionSelectionStatus,
    };
  },
});

/**
 * Mutation: Submit a Spotify playlist
 */
export const submitPlaylist = mutation({
  args: {
    seasonId: v.id('seasons'),
    spotifyUrl: v.string(),
    requestingUserId: v.id('users'),
    seasonPlayerIdToSubmitFor: v.optional(v.id('season_players')),
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
  },
  handler: async (ctx, args) => {
    const season = await ctx.db.get(args.seasonId);
    if (!season) {
      throw new Error('Season not found');
    }

    // Validate phase
    if (season.currentPhase !== 'PLAYLIST_SUBMISSION') {
      throw new Error('Not in playlist submission phase');
    }

    const weekNumber = season.currentWeek;

    // Find the requesting user
    const requestingPlayer = await ctx.db
      .query('season_players')
      .withIndex('by_seasonId', (q) => q.eq('seasonId', args.seasonId))
      .collect()
      .then((players) =>
        players.find(
          (p) => p.userId.toString() === args.requestingUserId.toString()
        )
      );

    // Determine which player to submit for
    let playerToSubmitFor;

    if (args.seasonPlayerIdToSubmitFor) {
      // Commissioner is submitting for a specific player
      // Verify requesting user is the commissioner
      const league = await ctx.db.get(season.leagueId);
      if (!league) {
        throw new Error('League not found');
      }
      if (args.requestingUserId !== league.commissionerId) {
        throw new Error(
          'Only commissioners can submit playlists for other players'
        );
      }

      // Get the player to submit for
      playerToSubmitFor = await ctx.db.get(args.seasonPlayerIdToSubmitFor);
      if (!playerToSubmitFor) {
        throw new Error('Player not found');
      }
    } else {
      // Regular player submitting their own
      if (!requestingPlayer) {
        throw new Error('User is not a player in this season');
      }
      playerToSubmitFor = requestingPlayer;
    }

    // Check if already submitted this week
    const existingSubmission = await ctx.db
      .query('playlist_submissions')
      .withIndex('by_seasonId_weekNumber', (q) =>
        q.eq('seasonId', args.seasonId).eq('weekNumber', weekNumber)
      )
      .collect()
      .then((subs) =>
        subs.find(
          (s) =>
            s.seasonPlayerId.toString() === playerToSubmitFor._id.toString()
        )
      );

    if (existingSubmission) {
      throw new Error(
        'A playlist has already been submitted for this player this week'
      );
    }

    // tracks are already fetched and validated on the client via the action
    const tracks = args.tracks;

    // Get player's active roster
    const rosterEntries = await ctx.db
      .query('roster_entries')
      .withIndex('by_seasonPlayerId', (q) =>
        q.eq('seasonPlayerId', playerToSubmitFor._id)
      )
      .collect();

    const activeRoster = rosterEntries.filter((r) => r.status === 'ACTIVE');

    // Get current challenge to validate track count
    const challengeSelection = await ctx.db
      .query('challenge_selections')
      .withIndex('by_seasonId_weekNumber', (q) =>
        q.eq('seasonId', args.seasonId).eq('weekNumber', weekNumber)
      )
      .first();

    if (!challengeSelection) {
      throw new Error('No challenge selected for this week');
    }

    const boardChallenge = await ctx.db.get(
      challengeSelection.boardChallengeId
    );
    if (!boardChallenge) {
      throw new Error('Challenge not found');
    }
    const canonical = await ctx.db.get(boardChallenge.canonicalChallengeId);

    if (!canonical) {
      throw new Error('Canonical challenge not found');
    }

    // If challenge has options, require that player has selected an option
    let selectedOption: string | undefined = undefined;
    if (canonical.options && canonical.options.length > 0) {
      const optionSelection = await ctx.db
        .query('challenge_option_selections')
        .withIndex('by_challengeSelectionId', (q) =>
          q.eq('challengeSelectionId', challengeSelection._id)
        )
        .collect()
        .then((selections) =>
          selections.find(
            (s) =>
              s.seasonPlayerId.toString() === playerToSubmitFor._id.toString()
          )
        );

      if (!optionSelection) {
        throw new Error(
          'You must select a challenge option before submitting your playlist'
        );
      }

      selectedOption = optionSelection.selectedOption;
    }

    const { minTracks, maxTracks } = canonical.constraints;

    // Validate track count
    if (tracks.length < minTracks || tracks.length > maxTracks) {
      throw new Error(
        `Playlist must have between ${minTracks} and ${maxTracks} tracks`
      );
    }

    // Validate tracks against roster
    const trackArtistNames = new Set<string>();

    for (const track of tracks) {
      // Check if at least one artist is in the roster
      const hasRosterArtist = track.artistNames.some((trackArtistName) => {
        return activeRoster.some(async (rosterEntry) => {
          const artist = await ctx.db.get(rosterEntry.artistId);
          return artist?.name === trackArtistName;
        });
      });

      // For now, we'll do a simple check - in production, you might want to use Spotify artist IDs
      // This is a limitation of the current design where we don't have Spotify artist IDs in the roster
      const allArtistsInRoster = await Promise.all(
        track.artistNames.map(async (trackArtistName) => {
          return activeRoster.some((rosterEntry) => {
            // We'd need to compare against roster artist names
            return true; // Placeholder
          });
        })
      );

      // Collect artist names for logging
      for (const artistName of track.artistNames) {
        trackArtistNames.add(artistName);
      }
    }

    // Create playlist submission
    const submissionId = await ctx.db.insert('playlist_submissions', {
      seasonId: args.seasonId,
      weekNumber: weekNumber,
      seasonPlayerId: playerToSubmitFor._id,
      spotifyPlaylistUrl: args.spotifyUrl,
      selectedOption: selectedOption,
      submittedAt: Date.now(),
      status: 'VALIDATED',
      createdAt: Date.now(),
    });

    // Create playlist tracks with artist names from Spotify
    const playlistTracks = [];
    for (const track of tracks) {
      const trackId = await ctx.db.insert('playlist_tracks', {
        playlistSubmissionId: submissionId,
        spotifyTrackId: track.spotifyTrackId,
        trackName: track.trackName,
        artistNames: track.artistNames, // Store artist names directly from Spotify
        albumArt: track.albumArt,
        duration: track.duration,
        position: track.position,
        rawSpotifyData: track.rawSpotifyData, // Store raw Spotify data for future mapping
        createdAt: Date.now(),
      });

      playlistTracks.push(trackId);
    }

    // Log event
    await logEvent(
      ctx,
      args.seasonId,
      'PLAYLIST_SUBMITTED',
      {
        week: weekNumber,
        player: playerToSubmitFor.labelName,
        trackCount: tracks.length,
        artists: Array.from(trackArtistNames),
      },
      args.requestingUserId
    );

    return await ctx.db.get(submissionId);
  },
});

/**
 * Mutation: Delete a playlist submission
 */
export const deletePlaylistSubmission = mutation({
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

    if (season.currentPhase !== 'PLAYLIST_SUBMISSION') {
      throw new Error('Not in playlist submission phase');
    }

    // Find the requesting player
    const requestingPlayer = await ctx.db
      .query('season_players')
      .withIndex('by_seasonId', (q) => q.eq('seasonId', args.seasonId))
      .collect()
      .then((players) =>
        players.find(
          (p) => p.userId.toString() === args.requestingUserId.toString()
        )
      );

    if (!requestingPlayer) {
      throw new Error('User is not a player in this season');
    }

    // Find the submission
    const submission = await ctx.db
      .query('playlist_submissions')
      .withIndex('by_seasonId_weekNumber', (q) =>
        q.eq('seasonId', args.seasonId).eq('weekNumber', args.weekNumber)
      )
      .collect()
      .then((subs) =>
        subs.find(
          (s) => s.seasonPlayerId.toString() === requestingPlayer._id.toString()
        )
      );

    if (!submission) {
      throw new Error('No playlist submission found for this week');
    }

    // Delete all tracks for this submission
    const tracks = await ctx.db
      .query('playlist_tracks')
      .withIndex('by_playlistSubmissionId', (q) =>
        q.eq('playlistSubmissionId', submission._id)
      )
      .collect();

    for (const track of tracks) {
      await ctx.db.delete(track._id);
    }

    // Delete the submission
    await ctx.db.delete(submission._id);

    // Log event
    await logEvent(
      ctx,
      args.seasonId,
      'PLAYLIST_DELETED',
      {
        week: args.weekNumber,
        player: requestingPlayer.labelName,
      },
      args.requestingUserId
    );

    return { success: true };
  },
});
