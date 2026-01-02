import { query } from './_generated/server';
import { v } from 'convex/values';
import type { Id } from 'convex/_generated/dataModel';
import { getPickerForWeek } from './challenges';

// Get player's season statistics
export const getPlayerSeasonStats = query({
  args: {
    seasonPlayerId: v.id('season_players'),
  },
  handler: async (ctx, args) => {
    const seasonPlayer = await ctx.db.get(args.seasonPlayerId);
    if (!seasonPlayer) {
      throw new Error('Season player not found');
    }

    // Get all season players for standings
    const allPlayers = await ctx.db
      .query('season_players')
      .withIndex('by_seasonId', (q) => q.eq('seasonId', seasonPlayer.seasonId))
      .collect();

    // Sort by total points (descending) to get standings
    const sorted = allPlayers.sort((a, b) => b.totalPoints - a.totalPoints);
    const rank = sorted.findIndex((p) => p._id === args.seasonPlayerId) + 1;

    return {
      labelName: seasonPlayer.labelName,
      totalPoints: seasonPlayer.totalPoints,
      rank,
      totalPlayers: allPlayers.length,
    };
  },
});

// Get player's drafted roster
export const getPlayerRoster = query({
  args: {
    seasonPlayerId: v.id('season_players'),
  },
  handler: async (ctx, args) => {
    const rosterEntries = await ctx.db
      .query('roster_entries')
      .withIndex('by_seasonPlayerId', (q) =>
        q.eq('seasonPlayerId', args.seasonPlayerId)
      )
      .collect();

    // Enrich with artist and prompt details
    const enriched = await Promise.all(
      rosterEntries.map(async (entry) => {
        const artist = await ctx.db.get(entry.artistId);
        const prompt = await ctx.db.get(entry.promptId);

        return {
          _id: entry._id,
          artistName: artist?.name || 'Unknown',
          promptText: prompt?.text || 'Unknown',
          status: entry.status,
          acquiredRound: entry.acquiredAtRound,
        };
      })
    );

    return enriched.sort((a, b) => a.acquiredRound - b.acquiredRound);
  },
});

// Get player's current advantages
export const getPlayerAdvantages = query({
  args: {
    seasonPlayerId: v.id('season_players'),
  },
  handler: async (ctx, args) => {
    const inventory = await ctx.db
      .query('player_inventory')
      .withIndex('by_seasonPlayerId', (q) =>
        q.eq('seasonPlayerId', args.seasonPlayerId)
      )
      .collect();

    // Enrich with canonical advantage details
    const enriched = await Promise.all(
      inventory.map(async (item) => {
        const canonical = await ctx.db
          .query('canonical_advantages')
          .withIndex('by_code', (q) => q.eq('code', item.advantageCode))
          .first();

        return {
          _id: item._id,
          code: item.advantageCode,
          name: canonical?.name || 'Unknown',
          status: item.status,
          earnedVia: item.earnedVia,
          earnedWeek: item.earnedWeek,
        };
      })
    );

    return enriched;
  },
});

// Get current week's selected challenge
export const getPlayerCurrentChallenge = query({
  args: {
    seasonPlayerId: v.id('season_players'),
  },
  handler: async (ctx, args) => {
    const seasonPlayer = await ctx.db.get(args.seasonPlayerId);
    if (!seasonPlayer) {
      throw new Error('Season player not found');
    }

    const season = await ctx.db.get(seasonPlayer.seasonId);
    if (!season) {
      throw new Error('Season not found');
    }

    // Query challenge_selections for this player in current week
    // Note: This assumes a challenge_selections table exists
    // For now, return placeholder structure
    return {
      weekNumber: season.currentWeek,
      challenge: null, // Will be populated when challenge_selections is implemented
    };
  },
});

// Get dashboard summary (all info for the dashboard)
export const getDashboardData = query({
  args: {
    seasonPlayerId: v.id('season_players'),
  },
  handler: async (ctx, args) => {
    const seasonPlayer = await ctx.db.get(args.seasonPlayerId);
    if (!seasonPlayer) {
      throw new Error('Season player not found');
    }

    const season = await ctx.db.get(seasonPlayer.seasonId);
    if (!season) {
      throw new Error('Season not found');
    }

    const league = await ctx.db.get(season.leagueId);
    if (!league) {
      throw new Error('League not found');
    }

    // Get stats
    const allPlayers = await ctx.db
      .query('season_players')
      .withIndex('by_seasonId', (q) => q.eq('seasonId', seasonPlayer.seasonId))
      .collect();

    const sorted = allPlayers.sort((a, b) => b.totalPoints - a.totalPoints);
    const rank = sorted.findIndex((p) => p._id === args.seasonPlayerId) + 1;

    // Get roster
    const rosterEntries = await ctx.db
      .query('roster_entries')
      .withIndex('by_seasonPlayerId', (q) =>
        q.eq('seasonPlayerId', args.seasonPlayerId)
      )
      .collect();

    const roster = await Promise.all(
      rosterEntries.map(async (entry) => {
        const artist = await ctx.db.get(entry.artistId);
        const prompt = await ctx.db.get(entry.promptId);

        return {
          _id: entry._id,
          artistName: artist?.name || 'Unknown',
          promptText: prompt?.text || 'Unknown',
          status: entry.status,
          acquiredRound: entry.acquiredAtRound,
          acquiredVia: entry.acquiredVia,
          acquiredAtWeek: entry.acquiredAtWeek,
        };
      })
    );

    // Get advantages
    const inventory = await ctx.db
      .query('player_inventory')
      .withIndex('by_seasonPlayerId', (q) =>
        q.eq('seasonPlayerId', args.seasonPlayerId)
      )
      .collect();

    // Get advantage board to look up tiers
    const advantageBoard = await ctx.db
      .query('advantage_boards')
      .withIndex('by_seasonId', (q) => q.eq('seasonId', seasonPlayer.seasonId))
      .first();

    // Create a map of advantage code to tier
    const codeToTierMap = new Map<string, number>();
    if (advantageBoard) {
      const allBoardAdvantages = await ctx.db
        .query('board_advantages')
        .withIndex('by_boardId', (q) => q.eq('boardId', advantageBoard._id))
        .collect();

      for (const ba of allBoardAdvantages) {
        const canonical = await ctx.db.get(ba.canonicalAdvantageId);
        if (canonical) {
          const category = advantageBoard.categories.find(
            (c) => c.id === ba.categoryId
          );
          if (category) {
            const tierMatch = category.title.match(/Tier (\d+)/);
            if (tierMatch) {
              codeToTierMap.set(canonical.code, parseInt(tierMatch[1]));
            }
          }
        }
      }
    }

    const advantages = await Promise.all(
      inventory.map(async (item) => {
        const canonical = await ctx.db
          .query('canonical_advantages')
          .withIndex('by_code', (q) => q.eq('code', item.advantageCode))
          .first();

        const tier = codeToTierMap.get(item.advantageCode) || 0;

        return {
          _id: item._id,
          code: item.advantageCode,
          name: canonical?.name || 'Unknown',
          description: canonical?.description || 'No description',
          status: item.status,
          earnedVia: item.earnedVia,
          earnedWeek: item.earnedWeek,
          tier,
        };
      })
    );

    return {
      season: {
        name: season.name,
        currentWeek: season.currentWeek,
        currentPhase: season.currentPhase,
        status: season.status,
      },
      player: {
        labelName: seasonPlayer.labelName,
        totalPoints: seasonPlayer.totalPoints,
        rank,
        totalPlayers: allPlayers.length,
      },
      roster: roster.sort((a, b) => a.acquiredRound - b.acquiredRound),
      advantages,
    };
  },
});

// Get all players with their stats for commissioner view
export const getAllPlayersStats = query({
  args: {
    seasonId: v.id('seasons'),
  },
  handler: async (ctx, args) => {
    const allPlayers = await ctx.db
      .query('season_players')
      .withIndex('by_seasonId', (q) => q.eq('seasonId', args.seasonId))
      .collect();

    // Sort by total points (descending) to get standings
    const sorted = allPlayers.sort((a, b) => b.totalPoints - a.totalPoints);

    const withRanks = sorted.map((p, index) => ({
      _id: p._id,
      labelName: p.labelName,
      totalPoints: p.totalPoints,
      rank: index + 1,
      userId: p.userId,
    }));

    return withRanks;
  },
});

// Get all player details including roster and advantages (for commissioner view)
export const getAllPlayerDetailsForCommissioner = query({
  args: {
    seasonId: v.id('seasons'),
  },
  handler: async (ctx, args) => {
    const allPlayers = await ctx.db
      .query('season_players')
      .withIndex('by_seasonId', (q) => q.eq('seasonId', args.seasonId))
      .collect();

    // Sort by total points (descending) to get standings
    const sorted = allPlayers.sort((a, b) => b.totalPoints - a.totalPoints);

    const playerDetails = await Promise.all(
      sorted.map(async (seasonPlayer, index) => {
        const user = await ctx.db.get(seasonPlayer.userId);

        // Get roster
        const rosterEntries = await ctx.db
          .query('roster_entries')
          .withIndex('by_seasonPlayerId', (q) =>
            q.eq('seasonPlayerId', seasonPlayer._id)
          )
          .collect();

        const roster = await Promise.all(
          rosterEntries.map(async (entry) => {
            const artist = await ctx.db.get(entry.artistId);
            const prompt = await ctx.db.get(entry.promptId);

            return {
              _id: entry._id,
              artistName: artist?.name || 'Unknown',
              promptText: prompt?.text || 'Unknown',
              status: entry.status,
              acquiredRound: entry.acquiredAtRound,
            };
          })
        );

        // Get advantages
        const inventory = await ctx.db
          .query('player_inventory')
          .withIndex('by_seasonPlayerId', (q) =>
            q.eq('seasonPlayerId', seasonPlayer._id)
          )
          .collect();

        const advantages = await Promise.all(
          inventory.map(async (item) => {
            const canonical = await ctx.db
              .query('canonical_advantages')
              .withIndex('by_code', (q) => q.eq('code', item.advantageCode))
              .first();

            return {
              _id: item._id,
              code: item.advantageCode,
              name: canonical?.name || 'Unknown',
              status: item.status,
              earnedVia: item.earnedVia,
              earnedWeek: item.earnedWeek,
            };
          })
        );

        return {
          _id: seasonPlayer._id,
          labelName: seasonPlayer.labelName,
          totalPoints: seasonPlayer.totalPoints,
          rank: index + 1,
          userEmail: user?.email || 'Unknown',
          roster: roster.sort((a, b) => a.acquiredRound - b.acquiredRound),
          advantages,
        };
      })
    );

    return playerDetails;
  },
});

// Get player details including roster and advantages (for commissioner view)
export const getPlayerDetailsForCommissioner = query({
  args: {
    seasonPlayerId: v.id('season_players'),
  },
  handler: async (ctx, args) => {
    const seasonPlayer = await ctx.db.get(args.seasonPlayerId);
    if (!seasonPlayer) {
      throw new Error('Season player not found');
    }

    const user = await ctx.db.get(seasonPlayer.userId);

    // Get roster
    const rosterEntries = await ctx.db
      .query('roster_entries')
      .withIndex('by_seasonPlayerId', (q) =>
        q.eq('seasonPlayerId', args.seasonPlayerId)
      )
      .collect();

    const roster = await Promise.all(
      rosterEntries.map(async (entry) => {
        const artist = await ctx.db.get(entry.artistId);
        const prompt = await ctx.db.get(entry.promptId);

        return {
          _id: entry._id,
          artistName: artist?.name || 'Unknown',
          promptText: prompt?.text || 'Unknown',
          status: entry.status,
          acquiredRound: entry.acquiredAtRound,
        };
      })
    );

    // Get advantages
    const inventory = await ctx.db
      .query('player_inventory')
      .withIndex('by_seasonPlayerId', (q) =>
        q.eq('seasonPlayerId', args.seasonPlayerId)
      )
      .collect();

    const advantages = await Promise.all(
      inventory.map(async (item) => {
        const canonical = await ctx.db
          .query('canonical_advantages')
          .withIndex('by_code', (q) => q.eq('code', item.advantageCode))
          .first();

        return {
          _id: item._id,
          code: item.advantageCode,
          name: canonical?.name || 'Unknown',
          status: item.status,
          earnedVia: item.earnedVia,
          earnedWeek: item.earnedWeek,
        };
      })
    );

    return {
      _id: seasonPlayer._id,
      labelName: seasonPlayer.labelName,
      totalPoints: seasonPlayer.totalPoints,
      userEmail: user?.email || 'Unknown',
      roster: roster.sort((a, b) => a.acquiredRound - b.acquiredRound),
      advantages,
    };
  },
});

// Get standings page data
export const getStandingsPageData = query({
  args: {
    seasonId: v.id('seasons'),
  },
  handler: async (ctx, args) => {
    const season = await ctx.db.get(args.seasonId);
    if (!season) {
      throw new Error('Season not found');
    }

    console.log('===HERE===', 'dashboard');
    // Get all season players
    const allPlayers = await ctx.db
      .query('season_players')
      .withIndex('by_seasonId', (q) => q.eq('seasonId', args.seasonId))
      .collect();

    // Get all weekly results for this season
    const allResults = await ctx.db
      .query('weekly_results')
      .withIndex('by_seasonId_weekNumber', (q) =>
        q.eq('seasonId', args.seasonId)
      )
      .collect();

    // Sort by total points (descending) to get standings
    const sortedPlayers = allPlayers.sort(
      (a, b) => b.totalPoints - a.totalPoints
    );

    // Enrich with user details, rank, and record
    const playersWithRank = await Promise.all(
      sortedPlayers.map(async (player, index) => {
        const user = await ctx.db.get(player.userId);

        // Get this player's weekly results
        const playerResults = allResults.filter(
          (r) => r.seasonPlayerId.toString() === player._id.toString()
        );

        // Calculate record: wins (1st), seconds (2nd), thirds (3rd), fourths (4th)
        const record = {
          wins: playerResults.filter((r) => r.placement === 1).length,
          seconds: playerResults.filter((r) => r.placement === 2).length,
          thirds: playerResults.filter((r) => r.placement === 3).length,
          fourths: playerResults.filter((r) => r.placement === 4).length,
        };

        return {
          _id: player._id,
          rank: index + 1,
          labelName: player.labelName,
          displayName: user?.displayName || 'Unknown',
          totalPoints: player.totalPoints,
          draftPosition: player.draftPosition,
          record,
        };
      })
    );

    // Get current week's picker
    const currentPicker = await getPickerForWeek(
      ctx,
      args.seasonId,
      season.currentWeek
    );
    let currentPickerData = null;
    if (currentPicker) {
      const currentPickerPlayer = await ctx.db.get(currentPicker);
      if (currentPickerPlayer) {
        const user = await ctx.db.get(currentPickerPlayer.userId);
        currentPickerData = {
          _id: currentPickerPlayer._id,
          labelName: currentPickerPlayer.labelName,
          displayName: user?.displayName || 'Unknown',
        };
      }
    }

    // Get next week's picker
    const nextPicker = await getPickerForWeek(
      ctx,
      args.seasonId,
      season.currentWeek + 1
    );
    let nextPickerData = null;
    if (nextPicker) {
      const nextPickerPlayer = await ctx.db.get(nextPicker);
      if (nextPickerPlayer) {
        const user = await ctx.db.get(nextPickerPlayer.userId);
        nextPickerData = {
          _id: nextPickerPlayer._id,
          labelName: nextPickerPlayer.labelName,
          displayName: user?.displayName || 'Unknown',
        };
      }
    }

    return {
      season: {
        _id: season._id,
        name: season.name,
        currentPhase: season.currentPhase,
        currentWeek: season.currentWeek,
        status: season.status,
      },
      players: playersWithRank,
      currentPicker: currentPickerData,
      nextPicker: nextPickerData,
    };
  },
});

// Get all rosters in a season
export const getAllPlayersRosters = query({
  args: {
    seasonId: v.id('seasons'),
  },
  handler: async (ctx, args) => {
    // Get all season players
    const seasonPlayers = await ctx.db
      .query('season_players')
      .withIndex('by_seasonId', (q) => q.eq('seasonId', args.seasonId))
      .collect();

    // Enrich each player with their roster
    const playersWithRosters = await Promise.all(
      seasonPlayers.map(async (player) => {
        const user = await ctx.db.get(player.userId);

        // Get roster entries for this player
        const rosterEntries = await ctx.db
          .query('roster_entries')
          .withIndex('by_seasonPlayerId', (q) =>
            q.eq('seasonPlayerId', player._id)
          )
          .collect();

        // Enrich roster entries with artist and prompt details
        const roster = await Promise.all(
          rosterEntries.map(async (entry) => {
            const artist = await ctx.db.get(entry.artistId);
            const prompt = await ctx.db.get(entry.promptId);

            return {
              _id: entry._id,
              artistName: artist?.name || 'Unknown',
              promptText: prompt?.text || 'Unknown',
              status: entry.status,
              acquiredRound: entry.acquiredAtRound,
              acquiredAtWeek: entry.acquiredAtWeek,
              acquiredVia: entry.acquiredVia,
              cutAtWeek: entry.cutAtWeek,
            };
          })
        );

        return {
          _id: player._id,
          labelName: player.labelName,
          displayName: user?.displayName || 'Unknown',
          totalPoints: player.totalPoints,
          roster: roster.sort((a, b) => a.acquiredRound - b.acquiredRound),
        };
      })
    );

    // Sort by total points descending
    return playersWithRosters.sort((a, b) => b.totalPoints - a.totalPoints);
  },
});

// Get weekly history for standings page
export const getWeeklyHistory = query({
  args: {
    seasonId: v.id('seasons'),
  },
  handler: async (ctx, args) => {
    const season = await ctx.db.get(args.seasonId);
    if (!season) {
      throw new Error('Season not found');
    }

    // Get all challenge selections for this season
    const challengeSelections = await ctx.db
      .query('challenge_selections')
      .withIndex('by_seasonId', (q) => q.eq('seasonId', args.seasonId))
      .collect();

    // Get all weekly results
    const weeklyResults = await ctx.db
      .query('weekly_results')
      .withIndex('by_seasonId_weekNumber', (q) =>
        q.eq('seasonId', args.seasonId)
      )
      .collect();

    // Get all playlist submissions
    const playlistSubmissions = await ctx.db
      .query('playlist_submissions')
      .withIndex('by_seasonId_weekNumber', (q) =>
        q.eq('seasonId', args.seasonId)
      )
      .collect();

    // Get all season players
    const seasonPlayers = await ctx.db
      .query('season_players')
      .withIndex('by_seasonId', (q) => q.eq('seasonId', args.seasonId))
      .collect();

    // Build player lookup map
    const playerMap = new Map<string, { labelName: string; displayName: string }>();
    for (const player of seasonPlayers) {
      const user = await ctx.db.get(player.userId);
      playerMap.set(player._id.toString(), {
        labelName: player.labelName,
        displayName: user?.displayName || 'Unknown',
      });
    }

    // Build weekly history
    const weeklyHistory = await Promise.all(
      challengeSelections.map(async (selection) => {
        // Get board challenge and canonical challenge
        const boardChallenge = await ctx.db.get(selection.boardChallengeId);
        let challenge = null;
        if (boardChallenge) {
          const canonical = await ctx.db.get(boardChallenge.canonicalChallengeId);
          if (canonical) {
            challenge = {
              title: canonical.title,
              emoji: canonical.emoji,
              generalVibe: canonical.generalVibe,
            };
          }
        }

        // Get picker info
        const pickerInfo = playerMap.get(selection.selectedByPlayerId.toString());

        // Get results for this week
        const weekResults = weeklyResults
          .filter((r) => r.weekNumber === selection.weekNumber)
          .sort((a, b) => a.placement - b.placement);

        // Build placements with playlist URLs
        const placements = await Promise.all(
          weekResults.map(async (result) => {
            const playerInfo = playerMap.get(result.seasonPlayerId.toString());
            
            // Find playlist submission for this player/week
            const submission = playlistSubmissions.find(
              (ps) =>
                ps.weekNumber === selection.weekNumber &&
                ps.seasonPlayerId.toString() === result.seasonPlayerId.toString()
            );

            // Points mapping: 1st=5, 2nd=3, 3rd=2, 4th=1
            const pointsMap: Record<number, number> = { 1: 5, 2: 3, 3: 2, 4: 1 };

            return {
              playerId: result.seasonPlayerId,
              labelName: playerInfo?.labelName || 'Unknown',
              displayName: playerInfo?.displayName || 'Unknown',
              placement: result.placement,
              points: pointsMap[result.placement] || 0,
              playlistUrl: submission?.spotifyPlaylistUrl || null,
            };
          })
        );

        return {
          weekNumber: selection.weekNumber,
          challenge,
          pickedBy: {
            playerId: selection.selectedByPlayerId,
            labelName: pickerInfo?.labelName || 'Unknown',
            displayName: pickerInfo?.displayName || 'Unknown',
          },
          placements,
        };
      })
    );

    // Sort by week number
    return weeklyHistory.sort((a, b) => a.weekNumber - b.weekNumber);
  },
});

// Get season standings with weekly record
export const getSeasonStandings = query({
  args: {
    seasonId: v.id('seasons'),
  },
  handler: async (ctx, args) => {
    const season = await ctx.db.get(args.seasonId);
    if (!season) {
      throw new Error('Season not found');
    }

    // Get all season players
    const seasonPlayers = await ctx.db
      .query('season_players')
      .withIndex('by_seasonId', (q) => q.eq('seasonId', args.seasonId))
      .collect();

    // Get all weekly results for this season
    const allResults = await ctx.db
      .query('weekly_results')
      .withIndex('by_seasonId_weekNumber', (q) =>
        q.eq('seasonId', args.seasonId)
      )
      .collect();

    // Build standings with weekly record
    const standings = await Promise.all(
      seasonPlayers.map(async (player) => {
        const user = await ctx.db.get(player.userId);

        // Get this player's weekly results
        const playerResults = allResults.filter(
          (r) => r.seasonPlayerId.toString() === player._id.toString()
        );

        // Calculate record: wins (1st), seconds (2nd), thirds (3rd), fourths (4th)
        const record = {
          wins: playerResults.filter((r) => r.placement === 1).length,
          seconds: playerResults.filter((r) => r.placement === 2).length,
          thirds: playerResults.filter((r) => r.placement === 3).length,
          fourths: playerResults.filter((r) => r.placement === 4).length,
        };

        // Get weekly history
        const weeklyHistory = playerResults
          .map((r) => ({
            weekNumber: r.weekNumber,
            placement: r.placement,
            votingPoints: r.votingPoints,
            victoryPoints: r.victoryPoints,
          }))
          .sort((a, b) => a.weekNumber - b.weekNumber);

        return {
          _id: player._id,
          labelName: player.labelName,
          displayName: user?.displayName || 'Unknown',
          totalVictoryPoints: player.totalPoints,
          record,
          weeklyHistory,
        };
      })
    );

    // Sort by total victory points (descending) and assign placements
    const sorted = standings.sort(
      (a, b) => b.totalVictoryPoints - a.totalVictoryPoints
    );

    // Assign placements with tie handling
    let currentPlacement = 1;
    const withPlacements = sorted.map((player, index) => {
      const prevPlayer = index > 0 ? sorted[index - 1] : null;
      if (
        prevPlayer &&
        player.totalVictoryPoints === prevPlayer.totalVictoryPoints
      ) {
        // Tie - keep same placement
      } else {
        currentPlacement = index + 1;
      }
      return {
        ...player,
        placement: currentPlacement,
      };
    });

    return {
      season: {
        _id: season._id,
        name: season.name,
        currentWeek: season.currentWeek,
        status: season.status,
      },
      standings: withPlacements,
    };
  },
});
