import { mutation, query } from './_generated/server';
import { v } from 'convex/values';
import { api } from './_generated/api';
import { logEvent } from './events';

const PHASE_ORDER: Record<string, number> = {
  SEASON_SETUP: 0,
  DRAFTING: 1,
  ADVANTAGE_SELECTION: 2,
  READY_FOR_WEEK_1: 3,
  IN_SEASON_CHALLENGE_SELECTION: 4,
  PLAYLIST_SUBMISSION: 5,
  PLAYLIST_PRESENTATION: 6,
  VOTING: 7,
  IN_SEASON_WEEK_END: 8,
};

export const createSeason = mutation({
  args: {
    leagueId: v.id('leagues'),
    name: v.string(),
    rosterSize: v.number(),
    challengeCount: v.number(),
    requesterId: v.id('users'),
  },
  handler: async (ctx, args) => {
    // Check if requester is commissioner
    const league = await ctx.db.get(args.leagueId);
    if (!league) {
      throw new Error('League not found');
    }

    if (league.commissionerId.toString() !== args.requesterId.toString()) {
      throw new Error('Only commissioners can create seasons');
    }

    // Create the season with initial phase
    const seasonId = await ctx.db.insert('seasons', {
      leagueId: args.leagueId,
      name: args.name,
      status: 'PRESEASON',
      currentWeek: 0,
      currentPhase: 'SEASON_SETUP', // Default to SEASON_SETUP (immutable progression starts here)
      config: {
        rosterSize: args.rosterSize,
        challengeCount: args.challengeCount,
      },
      createdAt: Date.now(),
    });

    // Fetch all league members
    const members = await ctx.db
      .query('league_members')
      .withIndex('by_leagueId', (q) => q.eq('leagueId', args.leagueId))
      .collect();

    // Create season_players for each member
    let draftPosition = 1;
    for (const member of members) {
      // Get user display name
      const user = await ctx.db.get(member.userId);

      await ctx.db.insert('season_players', {
        seasonId,
        userId: member.userId,
        labelName: `${user.displayName}'s Label`,
        draftPosition: draftPosition,
        totalPoints: 0,
        createdAt: Date.now(),
      });
      draftPosition++;
    }

    return seasonId;
  },
});

export const getSeason = query({
  args: {
    seasonId: v.id('seasons'),
  },
  handler: async (ctx, args) => {
    const season = await ctx.db.get(args.seasonId);
    if (!season) {
      throw new Error('Season not found');
    }

    const league = await ctx.db.get(season.leagueId);
    const commissioner = await ctx.db.get(league.commissionerId);

    return {
      ...season,
      league: {
        ...league,
        commissioner: {
          id: commissioner._id,
          email: commissioner.email,
          displayName: commissioner.displayName,
        },
      },
    };
  },
});

export const advancePhase = mutation({
  args: {
    seasonId: v.id('seasons'),
    newPhase: v.string(),
    requesterId: v.id('users'),
  },
  handler: async (ctx, args) => {
    const season = await ctx.db.get(args.seasonId);
    if (!season) {
      throw new Error('Season not found');
    }

    // Check if requester is commissioner of the league
    const league = await ctx.db.get(season.leagueId);
    if (league.commissionerId.toString() !== args.requesterId.toString()) {
      throw new Error('Only commissioners can advance phases');
    }

    // Validate phase progression (immutable - can only move forward)
    const currentPhaseOrder = PHASE_ORDER[season.currentPhase];
    const newPhaseOrder = PHASE_ORDER[args.newPhase];

    if (newPhaseOrder === undefined) {
      throw new Error('Invalid phase');
    }

    if (newPhaseOrder <= currentPhaseOrder) {
      throw new Error('Phases can only move forward, not backwards');
    }

    // Update phase
    await ctx.db.patch(args.seasonId, {
      currentPhase: args.newPhase,
    });

    // Log event
    await logEvent(
      ctx,
      args.seasonId,
      'PHASE_ADVANCED',
      {
        from: season.currentPhase,
        to: args.newPhase,
      },
      args.requesterId
    );

    return await ctx.db.get(args.seasonId);
  },
});

export const advanceToVoting = mutation({
  args: {
    seasonId: v.id('seasons'),
    revealMode: v.union(v.literal('IMMEDIATE'), v.literal('ON_REVEAL')),
    requesterId: v.id('users'),
  },
  handler: async (ctx, args) => {
    const season = await ctx.db.get(args.seasonId);
    if (!season) {
      throw new Error('Season not found');
    }

    // Check if requester is commissioner
    const league = await ctx.db.get(season.leagueId);
    if (league.commissionerId.toString() !== args.requesterId.toString()) {
      throw new Error('Only commissioners can advance to voting');
    }

    // Validate current phase is PLAYLIST_PRESENTATION
    if (season.currentPhase !== 'PLAYLIST_PRESENTATION') {
      throw new Error(
        'Can only advance to voting from PLAYLIST_PRESENTATION phase'
      );
    }

    // Advance phase to VOTING
    await ctx.db.patch(args.seasonId, {
      currentPhase: 'VOTING',
    });

    // Log phase advance event
    await logEvent(
      ctx,
      args.seasonId,
      'PHASE_ADVANCED',
      {
        from: 'PLAYLIST_PRESENTATION',
        to: 'VOTING',
      },
      args.requesterId
    );

    // Open voting session
    await ctx.runMutation(api.voting.openVotingSession, {
      seasonId: args.seasonId,
      weekNumber: season.currentWeek,
      revealMode: args.revealMode,
      requestingUserId: args.requesterId,
    });

    return await ctx.db.get(args.seasonId);
  },
});

export const getSeasonPlayers = query({
  args: {
    seasonId: v.id('seasons'),
  },
  handler: async (ctx, args) => {
    const players = await ctx.db
      .query('season_players')
      .withIndex('by_seasonId', (q) => q.eq('seasonId', args.seasonId))
      .collect();

    // Get user details for each player
    const playersWithDetails = await Promise.all(
      players.map(async (player) => {
        const user = await ctx.db.get(player.userId);
        return {
          ...player,
          user: {
            id: user._id,
            email: user.email,
            displayName: user.displayName,
          },
        };
      })
    );

    // Sort by draft position
    return playersWithDetails.sort((a, b) => {
      if (a.draftPosition === null || b.draftPosition === null) return 0;
      return (a.draftPosition ?? 0) - (b.draftPosition ?? 0);
    });
  },
});

export const listSeasons = query({
  args: {
    leagueId: v.id('leagues'),
  },
  handler: async (ctx, args) => {
    const seasons = await ctx.db
      .query('seasons')
      .withIndex('by_leagueId', (q) => q.eq('leagueId', args.leagueId))
      .collect();

    return seasons;
  },
});

// Query: Get all seasons where user is commissioner (any league)
export const getCommissionerSeasons = query({
  args: {
    userId: v.id('users'),
  },
  handler: async (ctx, args) => {
    // Get all leagues where user is commissioner
    const commissionerLeagues = await ctx.db
      .query('leagues')
      .withIndex('by_commissionerId', (q) => q.eq('commissionerId', args.userId))
      .collect();

    // Get all seasons for those leagues
    const allSeasons = [];
    for (const league of commissionerLeagues) {
      const seasons = await ctx.db
        .query('seasons')
        .withIndex('by_leagueId', (q) => q.eq('leagueId', league._id))
        .collect();
      allSeasons.push(...seasons);
    }

    return allSeasons;
  },
});

export const updateSeasonPlayerLabel = mutation({
  args: {
    seasonPlayerId: v.id('season_players'),
    labelName: v.string(),
    requesterId: v.id('users'),
  },
  handler: async (ctx, args) => {
    const seasonPlayer = await ctx.db.get(args.seasonPlayerId);
    if (!seasonPlayer) {
      throw new Error('Season player not found');
    }

    // Get season to check commissioner
    const season = await ctx.db.get(seasonPlayer.seasonId);
    if (!season) {
      throw new Error('Season not found');
    }

    // Get league to check if requester is commissioner
    const league = await ctx.db.get(season.leagueId);
    if (league.commissionerId.toString() !== args.requesterId.toString()) {
      throw new Error('Only commissioners can edit player labels');
    }

    // Update label name
    await ctx.db.patch(args.seasonPlayerId, {
      labelName: args.labelName,
    });

    return await ctx.db.get(args.seasonPlayerId);
  },
});

export const reorderSeasonPlayers = mutation({
  args: {
    seasonId: v.id('seasons'),
    playerIds: v.array(v.id('season_players')),
    requesterId: v.id('users'),
  },
  handler: async (ctx, args) => {
    // Get season to check commissioner and phase
    const season = await ctx.db.get(args.seasonId);
    if (!season) {
      throw new Error('Season not found');
    }

    // Get league to verify requester is commissioner
    const league = await ctx.db.get(season.leagueId);
    if (league.commissionerId.toString() !== args.requesterId.toString()) {
      throw new Error('Only commissioners can reorder players');
    }

    // Verify phase is SEASON_SETUP (before draft starts)
    if (season.currentPhase !== 'SEASON_SETUP') {
      throw new Error('Can only reorder players during SEASON_SETUP phase');
    }

    // Update draftPosition for each player
    for (let i = 0; i < args.playerIds.length; i++) {
      await ctx.db.patch(args.playerIds[i], {
        draftPosition: i + 1,
      });
    }

    // Return updated players
    const updatedPlayers = await Promise.all(
      args.playerIds.map((id) => ctx.db.get(id))
    );

    return updatedPlayers;
  },
});

export const startSeason = mutation({
  args: {
    seasonId: v.id('seasons'),
    requesterId: v.id('users'),
  },
  handler: async (ctx, args) => {
    const season = await ctx.db.get(args.seasonId);
    if (!season) {
      throw new Error('Season not found');
    }

    // Check if requester is commissioner of the league
    const league = await ctx.db.get(season.leagueId);
    if (league.commissionerId.toString() !== args.requesterId.toString()) {
      throw new Error('Only commissioners can start the season');
    }

    // Verify phase is ADVANTAGE_SELECTION
    if (season.currentPhase !== 'ADVANTAGE_SELECTION') {
      throw new Error(
        'Season can only be started from ADVANTAGE_SELECTION phase'
      );
    }

    // Update season to enter IN_SEASON_CHALLENGE_SELECTION phase
    await ctx.db.patch(args.seasonId, {
      currentPhase: 'IN_SEASON_CHALLENGE_SELECTION',
      status: 'IN_PROGRESS',
      currentWeek: 1,
      startedAt: Date.now(),
    });

    // Log event
    await logEvent(
      ctx,
      args.seasonId,
      'PHASE_ADVANCED',
      {
        from: 'ADVANTAGE_SELECTION',
        to: 'IN_SEASON_CHALLENGE_SELECTION',
      },
      args.requesterId
    );

    return await ctx.db.get(args.seasonId);
  },
});

export const rollbackToCheckpoint = mutation({
  args: {
    seasonId: v.id('seasons'),
    checkpoint: v.string(), // Accept any checkpoint ID, including dynamic WEEK_N
    requesterId: v.id('users'),
  },
  handler: async (ctx, args) => {
    const season = await ctx.db.get(args.seasonId);
    if (!season) {
      throw new Error('Season not found');
    }

    // Verify requester is commissioner
    const league = await ctx.db.get(season.leagueId);
    if (league.commissionerId.toString() !== args.requesterId.toString()) {
      throw new Error('Only commissioners can rollback the season');
    }

    const fromPhase = season.currentPhase;
    const fromWeek = season.currentWeek;

    // Determine target state based on checkpoint
    let toPhase: string;
    let toWeek: number;
    let toStatus: 'PRESEASON' | 'IN_PROGRESS' = 'PRESEASON';

    // Handle dynamic WEEK_N checkpoints
    if (args.checkpoint.startsWith('WEEK_')) {
      // Check if it's a presentation phase checkpoint
      if (args.checkpoint.endsWith('_PRESENTATION')) {
        // Extract week number: "WEEK_1_PRESENTATION" -> "1"
        const weekStr = args.checkpoint
          .replace('WEEK_', '')
          .replace('_PRESENTATION', '');
        const weekNum = parseInt(weekStr, 10);
        if (isNaN(weekNum)) {
          throw new Error(`Invalid checkpoint format: ${args.checkpoint}`);
        }
        toPhase = 'PLAYLIST_PRESENTATION';
        toWeek = weekNum;
        toStatus = 'IN_PROGRESS';
      } else {
        const weekNum = parseInt(args.checkpoint.substring(5), 10);
        toPhase = 'IN_SEASON_CHALLENGE_SELECTION';
        toWeek = weekNum;
        toStatus = 'IN_PROGRESS';
      }
    } else {
      switch (args.checkpoint) {
        case 'PRESEASON':
          toPhase = 'SEASON_SETUP';
          toWeek = 0;
          toStatus = 'PRESEASON';
          break;
        case 'DRAFT':
          toPhase = 'DRAFTING';
          toWeek = 0;
          toStatus = 'PRESEASON';
          break;
        case 'ADVANTAGE_SELECTION':
          toPhase = 'ADVANTAGE_SELECTION';
          toWeek = 0;
          toStatus = 'PRESEASON';
          break;
        case 'START_OF_SEASON':
          toPhase = 'IN_SEASON_CHALLENGE_SELECTION';
          toWeek = 1;
          toStatus = 'IN_PROGRESS';
          break;
        case 'WEEK_5':
          toPhase = 'IN_SEASON_CHALLENGE_SELECTION';
          toWeek = 5;
          toStatus = 'IN_PROGRESS';
          break;
        default:
          throw new Error(`Unknown checkpoint: ${args.checkpoint}`);
      }
    }

    // PRESEASON rollback: Reset draft positions and delete everything
    if (args.checkpoint === 'PRESEASON') {
      // Reset draft positions
      const seasonPlayers = await ctx.db
        .query('season_players')
        .withIndex('by_seasonId', (q) => q.eq('seasonId', args.seasonId))
        .collect();

      for (const player of seasonPlayers) {
        await ctx.db.patch(player._id, { draftPosition: undefined });
      }

      // Delete draft_state
      const draftState = await ctx.db
        .query('draft_state')
        .withIndex('by_seasonId', (q) => q.eq('seasonId', args.seasonId))
        .first();

      if (draftState) {
        await ctx.db.delete(draftState._id);
      }

      // Delete draft_selections
      const draftSelections = await ctx.db
        .query('draft_selections')
        .withIndex('by_seasonId', (q) => q.eq('seasonId', args.seasonId))
        .collect();

      for (const selection of draftSelections) {
        await ctx.db.delete(selection._id);
      }

      // Delete roster_entries
      for (const player of seasonPlayers) {
        const rosterEntries = await ctx.db
          .query('roster_entries')
          .withIndex('by_seasonPlayerId', (q) =>
            q.eq('seasonPlayerId', player._id)
          )
          .collect();

        for (const entry of rosterEntries) {
          await ctx.db.delete(entry._id);
        }
      }

      // Delete player_inventory
      for (const player of seasonPlayers) {
        const inventory = await ctx.db
          .query('player_inventory')
          .withIndex('by_seasonPlayerId', (q) =>
            q.eq('seasonPlayerId', player._id)
          )
          .collect();

        for (const item of inventory) {
          await ctx.db.delete(item._id);
        }
      }

      // Delete challenge_selections and challenge_reveals
      const challengeSelections = await ctx.db
        .query('challenge_selections')
        .withIndex('by_seasonId', (q) => q.eq('seasonId', args.seasonId))
        .collect();

      for (const selection of challengeSelections) {
        await ctx.db.delete(selection._id);
      }

      const challengeReveals = await ctx.db
        .query('challenge_reveals')
        .withIndex('by_seasonId', (q) => q.eq('seasonId', args.seasonId))
        .collect();

      for (const reveal of challengeReveals) {
        await ctx.db.delete(reveal._id);
      }

      // Reset draft_prompts status
      const board = await ctx.db
        .query('draft_boards')
        .withIndex('by_seasonId', (q) => q.eq('seasonId', args.seasonId))
        .first();

      if (board) {
        const prompts = await ctx.db
          .query('draft_prompts')
          .withIndex('by_boardId', (q) => q.eq('boardId', board._id))
          .collect();

        for (const prompt of prompts) {
          await ctx.db.patch(prompt._id, {
            status: 'OPEN',
            selectedByPlayerId: undefined,
            selectedAtRound: undefined,
          });
        }
      }
    }
    // DRAFT rollback: Keep draft positions, delete everything else
    else if (args.checkpoint === 'DRAFT') {
      // Get season players first (needed for re-initializing draft state)
      const seasonPlayers = await ctx.db
        .query('season_players')
        .withIndex('by_seasonId', (q) => q.eq('seasonId', args.seasonId))
        .collect();

      // Delete draft_state
      const draftState = await ctx.db
        .query('draft_state')
        .withIndex('by_seasonId', (q) => q.eq('seasonId', args.seasonId))
        .first();

      if (draftState) {
        await ctx.db.delete(draftState._id);
      }

      // Re-initialize draft_state using draftPosition order (preserve existing order)
      const draftOrder = seasonPlayers
        .filter(
          (p) => p.draftPosition !== null && p.draftPosition !== undefined
        )
        .sort((a, b) => (a.draftPosition ?? 0) - (b.draftPosition ?? 0))
        .map((p) => p._id);

      if (draftOrder.length > 0) {
        await ctx.db.insert('draft_state', {
          seasonId: args.seasonId,
          currentRound: 1,
          currentPickerIndex: 0,
          draftOrder,
          isComplete: false,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
      }

      // Delete draft_selections
      const draftSelections = await ctx.db
        .query('draft_selections')
        .withIndex('by_seasonId', (q) => q.eq('seasonId', args.seasonId))
        .collect();

      for (const selection of draftSelections) {
        await ctx.db.delete(selection._id);
      }

      // Delete roster_entries (seasonPlayers already fetched above)
      for (const player of seasonPlayers) {
        const rosterEntries = await ctx.db
          .query('roster_entries')
          .withIndex('by_seasonPlayerId', (q) =>
            q.eq('seasonPlayerId', player._id)
          )
          .collect();

        for (const entry of rosterEntries) {
          await ctx.db.delete(entry._id);
        }
      }

      // Delete player_inventory
      for (const player of seasonPlayers) {
        const inventory = await ctx.db
          .query('player_inventory')
          .withIndex('by_seasonPlayerId', (q) =>
            q.eq('seasonPlayerId', player._id)
          )
          .collect();

        for (const item of inventory) {
          await ctx.db.delete(item._id);
        }
      }

      // Delete challenge_selections and challenge_reveals
      const challengeSelections = await ctx.db
        .query('challenge_selections')
        .withIndex('by_seasonId', (q) => q.eq('seasonId', args.seasonId))
        .collect();

      for (const selection of challengeSelections) {
        await ctx.db.delete(selection._id);
      }

      const challengeReveals = await ctx.db
        .query('challenge_reveals')
        .withIndex('by_seasonId', (q) => q.eq('seasonId', args.seasonId))
        .collect();

      for (const reveal of challengeReveals) {
        await ctx.db.delete(reveal._id);
      }

      // Reset draft_prompts status
      const board = await ctx.db
        .query('draft_boards')
        .withIndex('by_seasonId', (q) => q.eq('seasonId', args.seasonId))
        .first();

      if (board) {
        const prompts = await ctx.db
          .query('draft_prompts')
          .withIndex('by_boardId', (q) => q.eq('boardId', board._id))
          .collect();

        for (const prompt of prompts) {
          await ctx.db.patch(prompt._id, {
            status: 'OPEN',
            selectedByPlayerId: undefined,
            selectedAtRound: undefined,
          });
        }
      }
    }
    // ADVANTAGE_SELECTION rollback: Keep draft and rosters, delete advantages and challenges
    // IMPORTANT: This MUST preserve:
    // - draft_state (complete draft state)
    // - draft_selections (which prompts were selected)
    // - roster_entries (which artists were drafted)
    // - draft_prompts status (SELECTED/RETIRED status)
    // - season_players.draftPosition
    else if (args.checkpoint === 'ADVANTAGE_SELECTION') {
      const seasonPlayers = await ctx.db
        .query('season_players')
        .withIndex('by_seasonId', (q) => q.eq('seasonId', args.seasonId))
        .collect();

      // ONLY delete player_inventory (advantages)
      // DO NOT touch draft_state, draft_selections, roster_entries, or draft_prompts
      for (const player of seasonPlayers) {
        const inventory = await ctx.db
          .query('player_inventory')
          .withIndex('by_seasonPlayerId', (q) =>
            q.eq('seasonPlayerId', player._id)
          )
          .collect();

        for (const item of inventory) {
          await ctx.db.delete(item._id);
        }
      }

      // Delete challenge_selections and challenge_reveals
      const challengeSelections = await ctx.db
        .query('challenge_selections')
        .withIndex('by_seasonId', (q) => q.eq('seasonId', args.seasonId))
        .collect();

      for (const selection of challengeSelections) {
        await ctx.db.delete(selection._id);
      }

      const challengeReveals = await ctx.db
        .query('challenge_reveals')
        .withIndex('by_seasonId', (q) => q.eq('seasonId', args.seasonId))
        .collect();

      for (const reveal of challengeReveals) {
        await ctx.db.delete(reveal._id);
      }

      // Explicitly verify draft data is preserved (for debugging)
      // Verify draft_selections still exist
      const draftSelectionsCheck = await ctx.db
        .query('draft_selections')
        .withIndex('by_seasonId', (q) => q.eq('seasonId', args.seasonId))
        .collect();

      // Verify roster_entries still exist
      let rosterEntriesCount = 0;
      for (const player of seasonPlayers) {
        const rosterEntries = await ctx.db
          .query('roster_entries')
          .withIndex('by_seasonPlayerId', (q) =>
            q.eq('seasonPlayerId', player._id)
          )
          .collect();
        rosterEntriesCount += rosterEntries.length;
      }

      // Verify draft_state still exists
      const draftStateCheck = await ctx.db
        .query('draft_state')
        .withIndex('by_seasonId', (q) => q.eq('seasonId', args.seasonId))
        .first();

      // Log verification (for debugging)
      console.log(
        `[ROLLBACK ADVANTAGE_SELECTION] Draft data preserved: selections=${draftSelectionsCheck.length}, rosters=${rosterEntriesCount}, draftState=${draftStateCheck ? 'exists' : 'missing'}`
      );
    }
    // In-season rollback: Keep pre-season data, clear specified week+
    else if (
      args.checkpoint === 'START_OF_SEASON' ||
      args.checkpoint === 'WEEK_5' ||
      args.checkpoint.startsWith('WEEK_')
    ) {
      // Delete challenge_selections where weekNumber >= toWeek
      const challengeSelections = await ctx.db
        .query('challenge_selections')
        .withIndex('by_seasonId', (q) => q.eq('seasonId', args.seasonId))
        .collect();

      for (const selection of challengeSelections) {
        if (selection.weekNumber >= toWeek) {
          await ctx.db.delete(selection._id);
        }
      }
      console.log(
        `[ROLLBACK to week ${toWeek}] Deleted challenge_selections for weeks >= ${toWeek}: ${challengeSelections.filter((s) => s.weekNumber >= toWeek).length}`
      );

      // Delete challenge_reveals where revealedAtWeek >= toWeek
      const challengeReveals = await ctx.db
        .query('challenge_reveals')
        .withIndex('by_seasonId', (q) => q.eq('seasonId', args.seasonId))
        .collect();

      for (const reveal of challengeReveals) {
        if (reveal.revealedAtWeek >= toWeek) {
          await ctx.db.delete(reveal._id);
        }
      }

      // Delete player_inventory where earnedWeek >= toWeek (but keep STARTING advantages)
      const seasonPlayers = await ctx.db
        .query('season_players')
        .withIndex('by_seasonId', (q) => q.eq('seasonId', args.seasonId))
        .collect();

      for (const player of seasonPlayers) {
        const inventory = await ctx.db
          .query('player_inventory')
          .withIndex('by_seasonPlayerId', (q) =>
            q.eq('seasonPlayerId', player._id)
          )
          .collect();

        for (const item of inventory) {
          if (item.earnedWeek >= toWeek) {
            await ctx.db.delete(item._id);
          }
        }
      }

      // Delete roster_entries where acquiredAtWeek >= toWeek
      // IMPORTANT: Never delete draft picks (acquiredVia: 'DRAFT' or acquiredAtWeek: 0)
      let deletedRosterEntries = 0;
      let preservedDraftPicks = 0;
      for (const player of seasonPlayers) {
        const rosterEntries = await ctx.db
          .query('roster_entries')
          .withIndex('by_seasonPlayerId', (q) =>
            q.eq('seasonPlayerId', player._id)
          )
          .collect();

        for (const entry of rosterEntries) {
          // NEVER delete draft picks - preserve entries acquired via DRAFT or from week 0
          const isDraftPick =
            entry.acquiredVia === 'DRAFT' || entry.acquiredAtWeek === 0;

          if (isDraftPick) {
            preservedDraftPicks++;
          } else if (entry.acquiredAtWeek >= toWeek) {
            // Only delete non-draft entries from weeks >= toWeek
            await ctx.db.delete(entry._id);
            deletedRosterEntries++;
          }
        }
      }
      console.log(
        `[ROLLBACK WEEK_${toWeek}] Roster entries: deleted=${deletedRosterEntries}, preserved draft picks=${preservedDraftPicks}`
      );
    }
    // Presentation phase rollback: Keep challenge selection and playlists, clear presentation and voting
    else if (args.checkpoint.endsWith('_PRESENTATION')) {
      // Extract week number: "WEEK_1_PRESENTATION" -> "1"
      const weekStr = args.checkpoint
        .replace('WEEK_', '')
        .replace('_PRESENTATION', '');
      const weekNum = parseInt(weekStr, 10);
      if (isNaN(weekNum)) {
        throw new Error(`Invalid checkpoint format: ${args.checkpoint}`);
      }

      // Delete presentation_state for this week
      const presentationStates = await ctx.db
        .query('presentation_state')
        .withIndex('by_seasonId_weekNumber', (q) =>
          q.eq('seasonId', args.seasonId).eq('weekNumber', weekNum)
        )
        .collect();

      for (const state of presentationStates) {
        await ctx.db.delete(state._id);
      }

      // Delete voting_sessions for this week
      const votingSessions = await ctx.db
        .query('voting_sessions')
        .withIndex('by_seasonId_weekNumber', (q) =>
          q.eq('seasonId', args.seasonId).eq('weekNumber', weekNum)
        )
        .collect();

      for (const session of votingSessions) {
        // Delete all votes for this session
        const votes = await ctx.db
          .query('votes')
          .withIndex('by_sessionId', (q) => q.eq('sessionId', session._id))
          .collect();

        for (const vote of votes) {
          await ctx.db.delete(vote._id);
        }

        // Delete the session
        await ctx.db.delete(session._id);
      }

      console.log(
        `[ROLLBACK WEEK_${weekNum}_PRESENTATION] Deleted presentation_state and voting data for week ${weekNum}`
      );
    }

    // Update season to target state
    await ctx.db.patch(args.seasonId, {
      currentPhase: toPhase,
      currentWeek: toWeek,
      status: toStatus,
      startedAt:
        toStatus === 'IN_PROGRESS' ? season.startedAt || Date.now() : undefined,
    });

    // Log event
    await logEvent(
      ctx,
      args.seasonId,
      'ROLLBACK_TO_CHECKPOINT',
      {
        checkpoint: args.checkpoint,
        fromPhase,
        fromWeek,
        toPhase,
        toWeek,
      },
      args.requesterId
    );

    return await ctx.db.get(args.seasonId);
  },
});

// Mutation: Delete a season and all related data (commissioner only)
export const deleteSeason = mutation({
  args: {
    seasonId: v.id('seasons'),
    requesterId: v.id('users'),
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
    if (league.commissionerId.toString() !== args.requesterId.toString()) {
      throw new Error('Only commissioners can delete seasons');
    }

    // Get all season players first (needed for cascading deletes)
    const seasonPlayers = await ctx.db
      .query('season_players')
      .withIndex('by_seasonId', (q) => q.eq('seasonId', args.seasonId))
      .collect();

    // Delete all roster_entries
    for (const player of seasonPlayers) {
      const rosterEntries = await ctx.db
        .query('roster_entries')
        .withIndex('by_seasonPlayerId', (q) => q.eq('seasonPlayerId', player._id))
        .collect();
      for (const entry of rosterEntries) {
        await ctx.db.delete(entry._id);
      }
    }

    // Delete all artists for this season
    const artists = await ctx.db
      .query('artists')
      .withIndex('by_seasonId', (q) => q.eq('seasonId', args.seasonId))
      .collect();
    for (const artist of artists) {
      await ctx.db.delete(artist._id);
    }

    // Delete all player_inventory
    for (const player of seasonPlayers) {
      const inventory = await ctx.db
        .query('player_inventory')
        .withIndex('by_seasonPlayerId', (q) => q.eq('seasonPlayerId', player._id))
        .collect();
      for (const item of inventory) {
        await ctx.db.delete(item._id);
      }
    }

    // Delete draft_state
    const draftState = await ctx.db
      .query('draft_state')
      .withIndex('by_seasonId', (q) => q.eq('seasonId', args.seasonId))
      .first();
    if (draftState) {
      await ctx.db.delete(draftState._id);
    }

    // Delete draft_selections
    const draftSelections = await ctx.db
      .query('draft_selections')
      .withIndex('by_seasonId', (q) => q.eq('seasonId', args.seasonId))
      .collect();
    for (const selection of draftSelections) {
      await ctx.db.delete(selection._id);
    }

    // Delete draft_boards and draft_prompts
    const draftBoard = await ctx.db
      .query('draft_boards')
      .withIndex('by_seasonId', (q) => q.eq('seasonId', args.seasonId))
      .first();
    if (draftBoard) {
      const prompts = await ctx.db
        .query('draft_prompts')
        .withIndex('by_boardId', (q) => q.eq('boardId', draftBoard._id))
        .collect();
      for (const prompt of prompts) {
        await ctx.db.delete(prompt._id);
      }
      await ctx.db.delete(draftBoard._id);
    }

    // Delete challenge_boards and board_challenges
    const challengeBoard = await ctx.db
      .query('challenge_boards')
      .withIndex('by_seasonId', (q) => q.eq('seasonId', args.seasonId))
      .first();
    if (challengeBoard) {
      const boardChallenges = await ctx.db
        .query('board_challenges')
        .withIndex('by_boardId', (q) => q.eq('boardId', challengeBoard._id))
        .collect();
      for (const challenge of boardChallenges) {
        await ctx.db.delete(challenge._id);
      }
      await ctx.db.delete(challengeBoard._id);
    }

    // Delete advantage_boards and board_advantages
    const advantageBoard = await ctx.db
      .query('advantage_boards')
      .withIndex('by_seasonId', (q) => q.eq('seasonId', args.seasonId))
      .first();
    if (advantageBoard) {
      const boardAdvantages = await ctx.db
        .query('board_advantages')
        .withIndex('by_boardId', (q) => q.eq('boardId', advantageBoard._id))
        .collect();
      for (const advantage of boardAdvantages) {
        await ctx.db.delete(advantage._id);
      }
      await ctx.db.delete(advantageBoard._id);
    }

    // Delete challenge_selections
    const challengeSelections = await ctx.db
      .query('challenge_selections')
      .withIndex('by_seasonId', (q) => q.eq('seasonId', args.seasonId))
      .collect();
    for (const selection of challengeSelections) {
      await ctx.db.delete(selection._id);
    }

    // Delete challenge_reveals
    const challengeReveals = await ctx.db
      .query('challenge_reveals')
      .withIndex('by_seasonId', (q) => q.eq('seasonId', args.seasonId))
      .collect();
    for (const reveal of challengeReveals) {
      await ctx.db.delete(reveal._id);
    }

    // Delete playlist_submissions and playlist_tracks
    const playlistSubmissions = await ctx.db
      .query('playlist_submissions')
      .withIndex('by_seasonId_weekNumber', (q) => q.eq('seasonId', args.seasonId))
      .collect();
    for (const submission of playlistSubmissions) {
      const tracks = await ctx.db
        .query('playlist_tracks')
        .withIndex('by_playlistSubmissionId', (q) => q.eq('playlistSubmissionId', submission._id))
        .collect();
      for (const track of tracks) {
        await ctx.db.delete(track._id);
      }
      await ctx.db.delete(submission._id);
    }

    // Delete presentation_state
    const presentationStates = await ctx.db
      .query('presentation_state')
      .withIndex('by_seasonId_weekNumber', (q) => q.eq('seasonId', args.seasonId))
      .collect();
    for (const state of presentationStates) {
      await ctx.db.delete(state._id);
    }

    // Delete voting_sessions and votes
    const votingSessions = await ctx.db
      .query('voting_sessions')
      .withIndex('by_seasonId_weekNumber', (q) => q.eq('seasonId', args.seasonId))
      .collect();
    for (const session of votingSessions) {
      const votes = await ctx.db
        .query('votes')
        .withIndex('by_sessionId', (q) => q.eq('sessionId', session._id))
        .collect();
      for (const vote of votes) {
        await ctx.db.delete(vote._id);
      }
      await ctx.db.delete(session._id);
    }

    // Delete game_events
    const gameEvents = await ctx.db
      .query('game_events')
      .withIndex('by_seasonId', (q) => q.eq('seasonId', args.seasonId))
      .collect();
    for (const event of gameEvents) {
      await ctx.db.delete(event._id);
    }

    // Delete season_players
    for (const player of seasonPlayers) {
      await ctx.db.delete(player._id);
    }

    // Finally, delete the season itself
    await ctx.db.delete(args.seasonId);

    return { success: true };
  },
});

// Query: Get advantage selection config for a season
export const getAdvantageSelectionConfig = query({
  args: { seasonId: v.id('seasons') },
  handler: async (ctx, args) => {
    const season = await ctx.db.get(args.seasonId);
    if (!season) {
      throw new Error('Season not found');
    }

    // Return config or default values
    if (season.advantageSelectionConfig) {
      return season.advantageSelectionConfig;
    }

    return {
      tier1Count: 2,
      tier2Count: 1,
      tier3Count: 0,
    };
  },
});

// Mutation: Update advantage selection config
export const updateAdvantageSelectionConfig = mutation({
  args: {
    seasonId: v.id('seasons'),
    config: v.object({
      tier1Count: v.number(),
      tier2Count: v.number(),
      tier3Count: v.number(),
    }),
    requesterId: v.id('users'),
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
    if (league.commissionerId.toString() !== args.requesterId.toString()) {
      throw new Error('Only commissioners can update advantage selection config');
    }

    // Validate counts are non-negative
    if (args.config.tier1Count < 0 || args.config.tier2Count < 0 || args.config.tier3Count < 0) {
      throw new Error('Tier counts must be non-negative integers');
    }

    // Update the season
    await ctx.db.patch(args.seasonId, {
      advantageSelectionConfig: args.config,
    });

    return await ctx.db.get(args.seasonId);
  },
});
