import { mutation, query } from './_generated/server';
import { v } from 'convex/values';
import { logEvent } from './events';
import { api } from './_generated/api';

/**
 * Initialize Growth Week roster evolution
 */
export const initializeGrowthWeekEvolution = mutation({
  args: {
    seasonId: v.id('seasons'),
    weekNumber: v.number(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Get season
    const season = await ctx.db.get(args.seasonId);
    if (!season) {
      throw new Error('Season not found');
    }

    // Check if evolution state already exists for this week
    const existingState = await ctx.db
      .query('roster_evolution_state')
      .withIndex('by_seasonId_weekNumber', (q) =>
        q.eq('seasonId', args.seasonId).eq('weekNumber', args.weekNumber)
      )
      .first();

    if (existingState) {
      throw new Error('Roster evolution already initialized for this week');
    }

    // Get roster evolution settings
    const settings = await ctx.db
      .query('roster_evolution_settings')
      .withIndex('by_seasonId', (q) => q.eq('seasonId', args.seasonId))
      .first();

    // Determine week type from settings (default to GROWTH)
    const weekTypeEntry = settings?.weekTypes.find(
      (w) => w.weekNumber === args.weekNumber
    );
    const weekType = weekTypeEntry?.type === 'CHAOS' ? 'CHAOS' : 'GROWTH';

    // Get growth week config
    const selfCutCount = settings?.growthWeek.selfCutCount ?? 1;
    const redraftCount = settings?.growthWeek.redraftCount ?? 1;

    // Check if this week includes Pool Draft
    const includesPoolDraft =
      settings?.poolDraftWeeks.includes(args.weekNumber) ?? false;

    // Get all players in season
    const players = await ctx.db
      .query('season_players')
      .withIndex('by_seasonId', (q) => q.eq('seasonId', args.seasonId))
      .collect();

    // Get weekly results for reverse standings order
    const weeklyResults = await ctx.db
      .query('weekly_results')
      .withIndex('by_seasonId_weekNumber', (q) =>
        q.eq('seasonId', args.seasonId).eq('weekNumber', args.weekNumber)
      )
      .collect();

    // Sort by placement descending (4th first, 1st last) for reverse standings
    const sortedResults = weeklyResults.sort(
      (a, b) => b.placement - a.placement
    );
    const redraftOrder =
      sortedResults.length > 0
        ? sortedResults.map((r) => r.seasonPlayerId)
        : players.map((p) => p._id); // Fallback if no results

    // Last place player picks the prompt (first in sorted results = worst placement)
    const promptPickerId =
      sortedResults.length > 0
        ? sortedResults[0].seasonPlayerId
        : players[0]?._id;

    // Initialize cuts required for each player
    const cutsRequired = players.map((player) => ({
      seasonPlayerId: player._id,
      selfCutCount,
      selfCutsCompleted: 0,
      opponentCutsRemaining: [] as (typeof players)[0]['_id'][],
      completed: false,
    }));

    // Initialize redraft picks tracking
    const redraftPicksCompleted = players.map((player) => ({
      seasonPlayerId: player._id,
      picksCompleted: 0,
    }));

    // Initialize pool draft picks tracking
    const poolDraftPicksCompleted = players.map((player) => ({
      seasonPlayerId: player._id,
      picksCompleted: 0,
    }));

    // Create roster evolution state
    const stateId = await ctx.db.insert('roster_evolution_state', {
      seasonId: args.seasonId,
      weekNumber: args.weekNumber,
      weekType: weekType as 'GROWTH' | 'CHAOS',
      currentPhase: 'SELF_CUT',
      promptPickerId, // Last place player picks the prompt
      selectedPromptId: undefined, // Will be set during PROMPT_SELECTION phase
      cutsRequired,
      redraftOrder,
      currentRedraftIndex: 0,
      redraftsPerPlayer: redraftCount,
      redraftRound: 1,
      redraftPicksCompleted,
      poolDraftOrder: redraftOrder, // Same order as redraft
      currentPoolDraftIndex: 0,
      includesPoolDraft,
      poolDraftPicksCompleted,
      createdAt: now,
    });

    // Log event
    await logEvent(ctx, args.seasonId, 'ROSTER_EVOLUTION_STARTED', {
      weekType,
      includesPoolDraft,
      selfCutCount,
      redraftCount,
      redraftOrder: redraftOrder.map((id) => id.toString()),
    });

    return stateId;
  },
});

/**
 * Get draft prompts for redraft selection (all prompts with status)
 */
export const getAvailableRedraftPrompts = query({
  args: {
    seasonId: v.id('seasons'),
  },
  handler: async (ctx, args) => {
    // Get draft board for this season
    const board = await ctx.db
      .query('draft_boards')
      .withIndex('by_seasonId', (q) => q.eq('seasonId', args.seasonId))
      .first();

    if (!board) {
      return null;
    }

    // Get ALL prompts (not just OPEN ones) so UI can show disabled state
    const allPrompts = await ctx.db
      .query('draft_prompts')
      .withIndex('by_boardId', (q) => q.eq('boardId', board._id))
      .collect();

    // Organize by category, keeping all prompts
    const categoriesWithPrompts = board.categories.map((cat) => {
      const categoryPrompts = allPrompts
        .filter((p) => p.categoryId === cat.id)
        .sort((a, b) => a.order - b.order);

      return {
        ...cat,
        prompts: categoryPrompts,
      };
    });

    const openPrompts = allPrompts.filter(
      (p) => (p.status || 'OPEN') === 'OPEN'
    );

    return {
      board,
      categories: categoriesWithPrompts,
      allPrompts,
      allOpenPrompts: openPrompts,
    };
  },
});

/**
 * Get current roster evolution state
 */
export const getRosterEvolutionState = query({
  args: {
    seasonId: v.id('seasons'),
    weekNumber: v.number(),
  },
  handler: async (ctx, args) => {
    const state = await ctx.db
      .query('roster_evolution_state')
      .withIndex('by_seasonId_weekNumber', (q) =>
        q.eq('seasonId', args.seasonId).eq('weekNumber', args.weekNumber)
      )
      .first();

    if (!state) {
      return null;
    }

    // Enrich with player details
    const playersMap = new Map<
      string,
      { _id: Id<'season_players'>; labelName: string }
    >();
    for (const playerId of state.redraftOrder) {
      const player = await ctx.db.get(playerId);
      if (player) {
        playersMap.set(playerId.toString(), {
          _id: player._id,
          labelName: player.labelName,
        });
      }
    }

    // Get current player for redraft
    const currentRedraftPlayerId =
      state.redraftOrder[state.currentRedraftIndex];
    const currentRedraftPlayer = currentRedraftPlayerId
      ? playersMap.get(currentRedraftPlayerId.toString())
      : null;

    // Get current player for pool draft
    const currentPoolDraftPlayerId =
      state.poolDraftOrder[state.currentPoolDraftIndex];
    const currentPoolDraftPlayer = currentPoolDraftPlayerId
      ? playersMap.get(currentPoolDraftPlayerId.toString())
      : null;

    // Get selected prompt details
    let selectedPrompt = null;
    if (state.selectedPromptId) {
      const prompt = await ctx.db.get(state.selectedPromptId);
      if (prompt) {
        selectedPrompt = {
          _id: prompt._id,
          text: prompt.text,
        };
      }
    }

    return {
      ...state,
      currentRedraftPlayer,
      currentPoolDraftPlayer,
      players: Object.fromEntries(playersMap),
      selectedPrompt,
    };
  },
});

/**
 * Cut an artist from player's roster (Growth Week self-cut)
 */
export const cutArtist = mutation({
  args: {
    seasonId: v.id('seasons'),
    weekNumber: v.number(),
    artistId: v.id('artists'),
    seasonPlayerId: v.id('season_players'),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Get roster evolution state
    const state = await ctx.db
      .query('roster_evolution_state')
      .withIndex('by_seasonId_weekNumber', (q) =>
        q.eq('seasonId', args.seasonId).eq('weekNumber', args.weekNumber)
      )
      .first();

    if (!state) {
      throw new Error('Roster evolution not initialized for this week');
    }

    if (state.currentPhase !== 'SELF_CUT') {
      throw new Error('Not in self-cut phase');
    }

    // Find player's cut requirement
    const playerCutIndex = state.cutsRequired.findIndex(
      (c) => c.seasonPlayerId.toString() === args.seasonPlayerId.toString()
    );
    if (playerCutIndex === -1) {
      throw new Error('Player not found in roster evolution');
    }

    const playerCut = state.cutsRequired[playerCutIndex];
    if (playerCut.completed) {
      throw new Error('Player has already completed their cuts');
    }

    if (playerCut.selfCutsCompleted >= playerCut.selfCutCount) {
      throw new Error('Player has already cut the required number of artists');
    }

    // Verify artist is on player's roster
    const rosterEntry = await ctx.db
      .query('roster_entries')
      .withIndex('by_seasonPlayerId', (q) =>
        q.eq('seasonPlayerId', args.seasonPlayerId)
      )
      .filter((q) =>
        q.and(
          q.eq(q.field('artistId'), args.artistId),
          q.eq(q.field('status'), 'ACTIVE')
        )
      )
      .first();

    if (!rosterEntry) {
      throw new Error('Artist not found on player roster');
    }

    // Update roster entry status to CUT
    await ctx.db.patch(rosterEntry._id, {
      status: 'CUT',
      cutAtWeek: args.weekNumber,
    });

    // Add artist to pool
    await ctx.db.insert('pool_entries', {
      seasonId: args.seasonId,
      artistId: args.artistId,
      status: 'AVAILABLE',
      enteredPoolAt: now,
      enteredPoolWeek: args.weekNumber,
      enteredVia: 'SELF_CUT',
      cutByPlayerId: args.seasonPlayerId,
      cutFromPlayerId: args.seasonPlayerId,
      createdAt: now,
    });

    // Update cuts tracking
    const updatedCutsRequired = [...state.cutsRequired];
    updatedCutsRequired[playerCutIndex] = {
      ...playerCut,
      selfCutsCompleted: playerCut.selfCutsCompleted + 1,
      completed: playerCut.selfCutsCompleted + 1 >= playerCut.selfCutCount,
    };

    // Check if all players have completed cuts
    const allCutsComplete = updatedCutsRequired.every((c) => c.completed);

    // Update state - transition to PROMPT_SELECTION when cuts complete
    await ctx.db.patch(state._id, {
      cutsRequired: updatedCutsRequired,
      currentPhase: allCutsComplete ? 'PROMPT_SELECTION' : 'SELF_CUT',
    });

    // Get artist and player for logging
    const artist = await ctx.db.get(args.artistId);
    const player = await ctx.db.get(args.seasonPlayerId);

    // Log event
    await logEvent(ctx, args.seasonId, 'ARTIST_CUT', {
      artistId: args.artistId,
      artistName: artist?.name,
      player: player?.labelName,
      reason: 'SELF_CUT',
    });

    return {
      allCutsComplete,
      nextPhase: allCutsComplete ? 'PROMPT_SELECTION' : 'SELF_CUT',
    };
  },
});

/**
 * Draft an artist during redraft phase
 */
export const draftArtist = mutation({
  args: {
    seasonId: v.id('seasons'),
    weekNumber: v.number(),
    artistName: v.string(),
    seasonPlayerId: v.id('season_players'),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Get roster evolution state
    const state = await ctx.db
      .query('roster_evolution_state')
      .withIndex('by_seasonId_weekNumber', (q) =>
        q.eq('seasonId', args.seasonId).eq('weekNumber', args.weekNumber)
      )
      .first();

    if (!state) {
      throw new Error('Roster evolution not initialized for this week');
    }

    if (state.currentPhase !== 'REDRAFT') {
      throw new Error('Not in redraft phase');
    }

    // Validate it's this player's turn
    const currentPlayerId = state.redraftOrder[state.currentRedraftIndex];
    if (currentPlayerId.toString() !== args.seasonPlayerId.toString()) {
      throw new Error('Not your turn to draft');
    }

    // Check if player has already completed all picks
    const playerPicksIndex = state.redraftPicksCompleted.findIndex(
      (p) => p.seasonPlayerId.toString() === args.seasonPlayerId.toString()
    );
    if (playerPicksIndex === -1) {
      throw new Error('Player not found in redraft tracking');
    }

    const playerPicks = state.redraftPicksCompleted[playerPicksIndex];
    if (playerPicks.picksCompleted >= state.redraftsPerPlayer) {
      throw new Error('Player has already completed all redraft picks');
    }

    // Check for duplicate artist name in season
    const existingArtist = await ctx.db
      .query('artists')
      .withIndex('by_name_seasonId', (q) =>
        q.eq('name', args.artistName).eq('seasonId', args.seasonId)
      )
      .first();

    if (existingArtist) {
      throw new Error('Artist already exists in this season');
    }

    // Create artist
    const artistId = await ctx.db.insert('artists', {
      name: args.artistName,
      seasonId: args.seasonId,
      createdAt: now,
    });

    // Get a prompt for the roster entry (use first available)
    const draftBoard = await ctx.db
      .query('draft_boards')
      .withIndex('by_seasonId', (q) => q.eq('seasonId', args.seasonId))
      .first();

    const prompt = draftBoard
      ? await ctx.db
          .query('draft_prompts')
          .withIndex('by_boardId', (q) => q.eq('boardId', draftBoard._id))
          .first()
      : null;

    if (!prompt) {
      throw new Error('No prompts available for roster entry');
    }

    // Create roster entry
    await ctx.db.insert('roster_entries', {
      seasonPlayerId: args.seasonPlayerId,
      artistId,
      promptId: prompt._id,
      status: 'ACTIVE',
      acquiredVia: 'POOL', // Using POOL as closest match for redraft
      acquiredAtWeek: args.weekNumber,
      acquiredAtRound: state.redraftRound,
      createdAt: now,
    });

    // Update picks completed
    const updatedRedraftPicksCompleted = [...state.redraftPicksCompleted];
    updatedRedraftPicksCompleted[playerPicksIndex] = {
      ...playerPicks,
      picksCompleted: playerPicks.picksCompleted + 1,
    };

    // Calculate next index (move to next player)
    let nextIndex = state.currentRedraftIndex + 1;
    let nextRound = state.redraftRound;

    // If we've gone through all players, check if round is complete
    if (nextIndex >= state.redraftOrder.length) {
      // Check if all players have completed this round
      const allCompletedRound = updatedRedraftPicksCompleted.every(
        (p) => p.picksCompleted >= state.redraftRound
      );

      if (allCompletedRound && state.redraftRound < state.redraftsPerPlayer) {
        // Move to next round, reset index
        nextRound = state.redraftRound + 1;
        nextIndex = 0;
      }
    }

    // Check if all redrafts are complete
    const allRedraftsComplete = updatedRedraftPicksCompleted.every(
      (p) => p.picksCompleted >= state.redraftsPerPlayer
    );

    // Determine next phase
    let nextPhase: typeof state.currentPhase = 'REDRAFT';
    if (allRedraftsComplete) {
      nextPhase = state.includesPoolDraft ? 'POOL_DRAFT' : 'COMPLETE';
    }

    // Update state
    await ctx.db.patch(state._id, {
      currentRedraftIndex:
        nextIndex >= state.redraftOrder.length ? 0 : nextIndex,
      redraftRound: nextRound,
      redraftPicksCompleted: updatedRedraftPicksCompleted,
      currentPhase: nextPhase,
      completedAt: nextPhase === 'COMPLETE' ? now : undefined,
    });

    // Get player for logging
    const player = await ctx.db.get(args.seasonPlayerId);

    // Log event
    await logEvent(ctx, args.seasonId, 'ARTIST_REDRAFTED', {
      artistId,
      artistName: args.artistName,
      player: player?.labelName,
      pickOrder: state.currentRedraftIndex + 1,
      round: state.redraftRound,
    });

    return {
      artistId,
      allRedraftsComplete,
      nextPhase,
    };
  },
});

/**
 * Draft an artist from the pool during POOL_DRAFT phase
 */
export const draftFromPoolPhase = mutation({
  args: {
    seasonId: v.id('seasons'),
    weekNumber: v.number(),
    artistId: v.id('artists'),
    seasonPlayerId: v.id('season_players'),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Get roster evolution state
    const state = await ctx.db
      .query('roster_evolution_state')
      .withIndex('by_seasonId_weekNumber', (q) =>
        q.eq('seasonId', args.seasonId).eq('weekNumber', args.weekNumber)
      )
      .first();

    if (!state) {
      throw new Error('Roster evolution not initialized for this week');
    }

    if (state.currentPhase !== 'POOL_DRAFT') {
      throw new Error('Not in pool draft phase');
    }

    // Validate it's the current player's turn (or commissioner)
    const currentPickerId = state.poolDraftOrder[state.currentPoolDraftIndex];
    const season = await ctx.db.get(args.seasonId);
    if (!season) {
      throw new Error('Season not found');
    }

    const league = await ctx.db.get(season.leagueId);
    if (!league) {
      throw new Error('League not found');
    }

    const requestingPlayer = await ctx.db.get(args.seasonPlayerId);
    if (!requestingPlayer) {
      throw new Error('Player not found');
    }

    const isCommissioner =
      league.commissionerId.toString() === requestingPlayer.userId.toString();
    const isCurrentPicker = args.seasonPlayerId === currentPickerId;

    if (!isCurrentPicker && !isCommissioner) {
      throw new Error('Not your turn to pick');
    }

    // The actual picker is always the current picker (commissioner drafts on behalf)
    const actualPickerId = currentPickerId;

    // Find the pool entry
    const poolEntry = await ctx.db
      .query('pool_entries')
      .withIndex('by_artistId', (q) => q.eq('artistId', args.artistId))
      .filter((q) => q.eq(q.field('seasonId'), args.seasonId))
      .filter((q) => q.eq(q.field('status'), 'AVAILABLE'))
      .first();

    if (!poolEntry) {
      throw new Error('Artist is not available in the pool');
    }

    // Update pool entry status to DRAFTED
    await ctx.db.patch(poolEntry._id, {
      status: 'DRAFTED',
      draftedByPlayerId: actualPickerId,
      draftedAtWeek: args.weekNumber,
    });

    // Find a default prompt for the roster entry
    const draftBoard = await ctx.db
      .query('draft_boards')
      .withIndex('by_seasonId', (q) => q.eq('seasonId', args.seasonId))
      .first();

    const prompt = draftBoard
      ? await ctx.db
          .query('draft_prompts')
          .withIndex('by_boardId', (q) => q.eq('boardId', draftBoard._id))
          .first()
      : null;

    if (!prompt) {
      throw new Error('No prompts available for roster entry');
    }

    // Create new roster entry for the actual picker
    await ctx.db.insert('roster_entries', {
      seasonPlayerId: actualPickerId,
      artistId: args.artistId,
      promptId: prompt._id,
      status: 'ACTIVE',
      acquiredVia: 'POOL',
      acquiredAtWeek: args.weekNumber,
      acquiredAtRound: 0,
      createdAt: now,
    });

    // Update pool draft picks completed
    const updatedPoolDraftPicksCompleted = state.poolDraftPicksCompleted.map(
      (p) =>
        p.seasonPlayerId === actualPickerId
          ? { ...p, picksCompleted: p.picksCompleted + 1 }
          : p
    );

    // Advance to next player
    const nextIndex = state.currentPoolDraftIndex + 1;
    const allPoolDraftsComplete = nextIndex >= state.poolDraftOrder.length;

    // Determine next phase
    const nextPhase = allPoolDraftsComplete ? 'COMPLETE' : 'POOL_DRAFT';

    // Update state
    await ctx.db.patch(state._id, {
      currentPoolDraftIndex: allPoolDraftsComplete
        ? state.currentPoolDraftIndex
        : nextIndex,
      poolDraftPicksCompleted: updatedPoolDraftPicksCompleted,
      currentPhase: nextPhase,
      completedAt: nextPhase === 'COMPLETE' ? now : undefined,
    });

    // Get artist and player for logging
    const artist = await ctx.db.get(args.artistId);
    const picker = await ctx.db.get(actualPickerId);

    // Log event
    await logEvent(ctx, args.seasonId, 'POOL_DRAFT_PICK', {
      week: args.weekNumber,
      player: picker?.labelName,
      artistId: args.artistId,
      artistName: artist?.name,
      pickOrder: state.currentPoolDraftIndex + 1,
      poolSizeAfter:
        (await ctx.db
          .query('pool_entries')
          .withIndex('by_seasonId_status', (q) =>
            q.eq('seasonId', args.seasonId).eq('status', 'AVAILABLE')
          )
          .collect()).length,
    });

    return {
      success: true,
      allPoolDraftsComplete,
      nextPhase,
    };
  },
});

/**
 * Get player's current roster for cutting
 */
export const getPlayerRosterForCutting = query({
  args: {
    seasonPlayerId: v.id('season_players'),
  },
  handler: async (ctx, args) => {
    const rosterEntries = await ctx.db
      .query('roster_entries')
      .withIndex('by_seasonPlayerId', (q) =>
        q.eq('seasonPlayerId', args.seasonPlayerId)
      )
      .filter((q) => q.eq(q.field('status'), 'ACTIVE'))
      .collect();

    // Enrich with artist details
    const enrichedRoster = await Promise.all(
      rosterEntries.map(async (entry) => {
        const artist = await ctx.db.get(entry.artistId);
        return {
          ...entry,
          artist: artist ? { _id: artist._id, name: artist.name } : null,
        };
      })
    );

    return enrichedRoster;
  },
});

/**
 * Get cut status for all players
 */
export const getCutStatus = query({
  args: {
    seasonId: v.id('seasons'),
    weekNumber: v.number(),
  },
  handler: async (ctx, args) => {
    const state = await ctx.db
      .query('roster_evolution_state')
      .withIndex('by_seasonId_weekNumber', (q) =>
        q.eq('seasonId', args.seasonId).eq('weekNumber', args.weekNumber)
      )
      .first();

    if (!state) {
      return null;
    }

    // Enrich with player details
    const enrichedCuts = await Promise.all(
      state.cutsRequired.map(async (cut) => {
        const player = await ctx.db.get(cut.seasonPlayerId);
        return {
          ...cut,
          player: player ? { labelName: player.labelName } : null,
        };
      })
    );

    return {
      currentPhase: state.currentPhase,
      cuts: enrichedCuts,
      allComplete: enrichedCuts.every((c) => c.completed),
    };
  },
});

/**
 * Complete roster evolution and advance to next phase
 */
export const completeRosterEvolution = mutation({
  args: {
    seasonId: v.id('seasons'),
    weekNumber: v.number(),
    requesterId: v.id('users'),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Get season
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
      throw new Error('Only commissioners can complete roster evolution');
    }

    // Get roster evolution state
    const state = await ctx.db
      .query('roster_evolution_state')
      .withIndex('by_seasonId_weekNumber', (q) =>
        q.eq('seasonId', args.seasonId).eq('weekNumber', args.weekNumber)
      )
      .first();

    if (!state) {
      throw new Error('Roster evolution not found for this week');
    }

    if (state.currentPhase !== 'COMPLETE') {
      throw new Error('Roster evolution is not complete yet');
    }

    // Update state with completion time
    await ctx.db.patch(state._id, {
      completedAt: now,
    });

    // Mark the redraft prompt as RETIRED (so it can't be reused)
    if (state.selectedPromptId) {
      await ctx.db.patch(state.selectedPromptId, {
        status: 'RETIRED',
      });
    }

    // Log roster evolution complete event
    await logEvent(
      ctx,
      args.seasonId,
      'ROSTER_EVOLUTION_COMPLETE',
      {
        weekType: state.weekType,
        weekNumber: args.weekNumber,
      },
      args.requesterId
    );

    // Advance to next week and challenge selection
    const nextWeek = season.currentWeek + 1;
    await ctx.db.patch(args.seasonId, {
      currentPhase: 'IN_SEASON_CHALLENGE_SELECTION',
      currentWeek: nextWeek,
    });

    // Log week advanced event
    await logEvent(
      ctx,
      args.seasonId,
      'WEEK_ADVANCED',
      {
        fromWeek: season.currentWeek,
        toWeek: nextWeek,
      },
      args.requesterId
    );

    return { success: true, nextWeek };
  },
});

/**
 * Select a prompt for the redraft phase (last place player only)
 */
export const selectRedraftPrompt = mutation({
  args: {
    seasonId: v.id('seasons'),
    weekNumber: v.number(),
    promptId: v.id('draft_prompts'),
    requestingUserId: v.id('users'),
  },
  handler: async (ctx, args) => {
    // Get roster evolution state
    const state = await ctx.db
      .query('roster_evolution_state')
      .withIndex('by_seasonId_weekNumber', (q) =>
        q.eq('seasonId', args.seasonId).eq('weekNumber', args.weekNumber)
      )
      .first();

    if (!state) {
      throw new Error('Roster evolution not initialized for this week');
    }

    if (state.currentPhase !== 'PROMPT_SELECTION') {
      throw new Error('Not in prompt selection phase');
    }

    // Get requesting user's season player
    const requestingPlayer = await ctx.db
      .query('season_players')
      .withIndex('by_seasonId', (q) => q.eq('seasonId', args.seasonId))
      .filter((q) => q.eq(q.field('userId'), args.requestingUserId))
      .first();

    // Get season and check if commissioner
    const season = await ctx.db.get(args.seasonId);
    if (!season) {
      throw new Error('Season not found');
    }
    const league = await ctx.db.get(season.leagueId);
    if (!league) {
      throw new Error('League not found');
    }
    const isCommissioner =
      league.commissionerId.toString() === args.requestingUserId.toString();

    // Validate: must be the prompt picker or commissioner
    if (
      !isCommissioner &&
      requestingPlayer?._id.toString() !== state.promptPickerId?.toString()
    ) {
      throw new Error(
        'Only the last place player or commissioner can select the prompt'
      );
    }

    // Validate prompt exists and is available
    const prompt = await ctx.db.get(args.promptId);
    if (!prompt) {
      throw new Error('Prompt not found');
    }
    if ((prompt.status || 'OPEN') !== 'OPEN') {
      throw new Error('Prompt is not available');
    }

    // Get prompt picker info for logging
    const promptPicker = state.promptPickerId
      ? await ctx.db.get(state.promptPickerId)
      : null;

    // Update state with selected prompt and advance to REDRAFT
    await ctx.db.patch(state._id, {
      selectedPromptId: args.promptId,
      currentPhase: 'REDRAFT',
    });

    // Log event
    await logEvent(
      ctx,
      args.seasonId,
      'REDRAFT_PROMPT_SELECTED',
      {
        promptId: args.promptId,
        promptText: prompt.text,
        selectedBy: promptPicker?.labelName || 'Unknown',
        selectedByCommissioner:
          isCommissioner &&
          requestingPlayer?._id.toString() !== state.promptPickerId?.toString(),
      },
      args.requestingUserId
    );

    return {
      success: true,
      promptText: prompt.text,
      nextPhase: 'REDRAFT',
    };
  },
});

/**
 * Rollback roster evolution to the start of the SELF_CUT phase
 * Reverses all cuts, redrafts, and resets state
 */
export const rollbackRosterEvolution = mutation({
  args: {
    seasonId: v.id('seasons'),
    weekNumber: v.number(),
    requesterId: v.id('users'),
  },
  handler: async (ctx, args) => {
    // Validate season exists and is in ROSTER_EVOLUTION phase
    const season = await ctx.db.get(args.seasonId);
    if (!season) {
      throw new Error('Season not found');
    }

    if (season.currentPhase !== 'ROSTER_EVOLUTION') {
      throw new Error('Season is not in ROSTER_EVOLUTION phase');
    }

    // Verify requester is commissioner
    const league = await ctx.db.get(season.leagueId);
    if (!league) {
      throw new Error('League not found');
    }
    if (league.commissionerId.toString() !== args.requesterId.toString()) {
      throw new Error('Only commissioners can rollback roster evolution');
    }

    // Get roster evolution state
    const state = await ctx.db
      .query('roster_evolution_state')
      .withIndex('by_seasonId_weekNumber', (q) =>
        q.eq('seasonId', args.seasonId).eq('weekNumber', args.weekNumber)
      )
      .first();

    if (!state) {
      throw new Error('Roster evolution state not found for this week');
    }

    // 1. Find pool entries created this week and restore cut artists
    const poolEntries = await ctx.db
      .query('pool_entries')
      .withIndex('by_seasonId', (q) => q.eq('seasonId', args.seasonId))
      .filter((q) => q.eq(q.field('enteredPoolWeek'), args.weekNumber))
      .collect();

    let cutsRestored = 0;
    for (const poolEntry of poolEntries) {
      // Find the corresponding roster entry (CUT status, matching artist and player)
      const rosterEntry = await ctx.db
        .query('roster_entries')
        .withIndex('by_artistId', (q) => q.eq('artistId', poolEntry.artistId))
        .filter((q) =>
          q.and(
            q.eq(q.field('seasonPlayerId'), poolEntry.cutFromPlayerId),
            q.eq(q.field('status'), 'CUT')
          )
        )
        .first();

      if (rosterEntry) {
        // Restore roster entry to ACTIVE
        await ctx.db.patch(rosterEntry._id, {
          status: 'ACTIVE',
        });
        cutsRestored++;
      }

      // Delete the pool entry
      await ctx.db.delete(poolEntry._id);
    }

    // 2. Find and remove redrafted artists
    // Get all season players to find roster entries
    const seasonPlayers = await ctx.db
      .query('season_players')
      .withIndex('by_seasonId', (q) => q.eq('seasonId', args.seasonId))
      .collect();

    let redraftsRemoved = 0;
    let poolDraftsReverted = 0;
    for (const player of seasonPlayers) {
      // Find roster entries acquired this week via POOL (redraft or pool draft)
      const poolAcquiredEntries = await ctx.db
        .query('roster_entries')
        .withIndex('by_seasonPlayerId', (q) =>
          q.eq('seasonPlayerId', player._id)
        )
        .filter((q) =>
          q.and(
            q.eq(q.field('acquiredAtWeek'), args.weekNumber),
            q.eq(q.field('acquiredVia'), 'POOL')
          )
        )
        .collect();

      for (const entry of poolAcquiredEntries) {
        // Check if this was a pool draft (existing artist from pool) or a redraft (new artist)
        // Pool drafts have pool_entries with status DRAFTED, redrafts create new artists
        const poolEntry = await ctx.db
          .query('pool_entries')
          .withIndex('by_artistId', (q) => q.eq('artistId', entry.artistId))
          .filter((q) =>
            q.and(
              q.eq(q.field('seasonId'), args.seasonId),
              q.eq(q.field('status'), 'DRAFTED'),
              q.eq(q.field('draftedAtWeek'), args.weekNumber)
            )
          )
          .first();

        if (poolEntry) {
          // This was a pool draft - revert pool entry to AVAILABLE
          await ctx.db.patch(poolEntry._id, {
            status: 'AVAILABLE',
            draftedByPlayerId: undefined,
            draftedAtWeek: undefined,
          });
          // Delete the roster entry (artist stays in pool)
          await ctx.db.delete(entry._id);
          poolDraftsReverted++;
        } else {
          // This was a redraft (new artist) - delete both artist and roster entry
          await ctx.db.delete(entry.artistId);
          await ctx.db.delete(entry._id);
          redraftsRemoved++;
        }
      }
    }

    // 3. Recalculate promptPickerId (last place player from weekly results)
    const weeklyResults = await ctx.db
      .query('weekly_results')
      .withIndex('by_seasonId_weekNumber', (q) =>
        q.eq('seasonId', args.seasonId).eq('weekNumber', args.weekNumber)
      )
      .collect();

    // Sort by placement (highest = last place)
    const sortedResults = weeklyResults.sort(
      (a, b) => b.placement - a.placement
    );
    const promptPickerId =
      sortedResults.length > 0
        ? sortedResults[0].seasonPlayerId
        : seasonPlayers[0]?._id;

    // 4. Reset the roster evolution state
    const resetCutsRequired = state.cutsRequired.map((cut) => ({
      ...cut,
      selfCutsCompleted: 0,
      completed: false,
    }));

    const resetRedraftPicksCompleted = state.redraftPicksCompleted.map(
      (pick) => ({
        ...pick,
        picksCompleted: 0,
      })
    );

    const resetPoolDraftPicksCompleted = state.poolDraftPicksCompleted.map(
      (pick) => ({
        ...pick,
        picksCompleted: 0,
      })
    );

    await ctx.db.patch(state._id, {
      currentPhase: 'SELF_CUT',
      selectedPromptId: undefined,
      promptPickerId, // Recalculate prompt picker
      cutsRequired: resetCutsRequired,
      currentRedraftIndex: 0,
      redraftRound: 1,
      redraftPicksCompleted: resetRedraftPicksCompleted,
      currentPoolDraftIndex: 0,
      poolDraftPicksCompleted: resetPoolDraftPicksCompleted,
      completedAt: undefined,
    });

    // 5. Delete game events for this week's roster evolution
    const eventTypes = [
      'ROSTER_EVOLUTION_STARTED',
      'ARTIST_CUT',
      'ARTIST_REDRAFTED',
      'REDRAFT_PROMPT_SELECTED',
      'ARTIST_DRAFTED_FROM_POOL',
      'ROSTER_EVOLUTION_COMPLETE',
    ];

    const events = await ctx.db
      .query('game_events')
      .withIndex('by_seasonId_createdAt', (q) =>
        q.eq('seasonId', args.seasonId)
      )
      .filter((q) => q.eq(q.field('weekNumber'), args.weekNumber))
      .collect();

    let eventsDeleted = 0;
    for (const event of events) {
      if (eventTypes.includes(event.type)) {
        await ctx.db.delete(event._id);
        eventsDeleted++;
      }
    }

    // Log the rollback event
    await logEvent(
      ctx,
      args.seasonId,
      'ROSTER_EVOLUTION_ROLLBACK',
      {
        weekNumber: args.weekNumber,
        cutsRestored,
        redraftsRemoved,
        poolDraftsReverted,
        eventsDeleted,
      },
      args.requesterId
    );

    return {
      success: true,
      cutsRestored,
      redraftsRemoved,
      poolDraftsReverted,
      eventsDeleted,
    };
  },
});
