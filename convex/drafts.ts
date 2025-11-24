import { mutation, query } from './_generated/server';
import { v } from 'convex/values';
import type { Id } from 'convex/_generated/dataModel';
import { logEvent } from './events';

// Query: Get a draft board with its prompts
export const getBoard = query({
  args: { seasonId: v.id('seasons') },
  handler: async (ctx, args) => {
    const board = await ctx.db
      .query('draft_boards')
      .withIndex('by_seasonId', (q) => q.eq('seasonId', args.seasonId))
      .first();

    if (!board) return null;

    const prompts = await ctx.db
      .query('draft_prompts')
      .withIndex('by_boardId', (q) => q.eq('boardId', board._id))
      .collect();

    return {
      board,
      prompts: prompts.sort((a, b) => a.order - b.order),
    };
  },
});

// Mutation: Duplicate a draft board from another season in the same league
export const duplicateBoardFromSeason = mutation({
  args: {
    targetSeasonId: v.id('seasons'),
    sourceSeasonId: v.id('seasons'),
    requestingUserId: v.id('users'),
  },
  handler: async (ctx, args) => {
    if (args.targetSeasonId === args.sourceSeasonId) {
      throw new Error('Cannot duplicate a board from the same season');
    }

    const targetSeason = await ctx.db.get(args.targetSeasonId);
    const sourceSeason = await ctx.db.get(args.sourceSeasonId);
    if (!targetSeason || !sourceSeason) {
      throw new Error('Season not found');
    }

    // Verify requester is commissioner of target season's league
    const targetLeague = await ctx.db.get(targetSeason.leagueId);
    if (!targetLeague) {
      throw new Error('League not found');
    }

    const isCommissioner =
      targetLeague.commissionerId.toString() ===
      args.requestingUserId.toString();
    if (!isCommissioner) {
      throw new Error('Only the commissioner can duplicate the draft board');
    }

    const sourceBoard = await ctx.db
      .query('draft_boards')
      .withIndex('by_seasonId', (q) => q.eq('seasonId', args.sourceSeasonId))
      .first();

    if (!sourceBoard) {
      throw new Error('Source season has no draft board to duplicate');
    }

    const sourcePrompts = await ctx.db
      .query('draft_prompts')
      .withIndex('by_boardId', (q) => q.eq('boardId', sourceBoard._id))
      .collect();

    let targetBoard = await ctx.db
      .query('draft_boards')
      .withIndex('by_seasonId', (q) => q.eq('seasonId', args.targetSeasonId))
      .first();

    if (!targetBoard) {
      const newBoardId = await ctx.db.insert('draft_boards', {
        seasonId: args.targetSeasonId,
        categories: [],
        createdAt: Date.now(),
      });
      targetBoard = await ctx.db.get(newBoardId);
    }

    // Delete existing prompts on the target board
    const existingPrompts = await ctx.db
      .query('draft_prompts')
      .withIndex('by_boardId', (q) => q.eq('boardId', targetBoard._id))
      .collect();

    for (const prompt of existingPrompts) {
      await ctx.db.delete(prompt._id);
    }

    // Copy categories from source board, and reset lock state
    await ctx.db.patch(targetBoard._id, {
      categories: sourceBoard.categories,
      isLocked: undefined,
      lockedAt: undefined,
    });

    // Recreate prompts on the target board
    for (const prompt of sourcePrompts) {
      await ctx.db.insert('draft_prompts', {
        boardId: targetBoard._id,
        categoryId: prompt.categoryId,
        text: prompt.text,
        order: prompt.order,
        isCanonical: prompt.isCanonical,
        canonicalId: prompt.canonicalId,
        status: 'OPEN',
        selectedByPlayerId: undefined,
        selectedAtRound: undefined,
        createdAt: Date.now(),
      });
    }

    return { success: true };
  },
});

// Mutation: Create a new draft board for a season
export const createBoard = mutation({
  args: { seasonId: v.id('seasons') },
  handler: async (ctx, args) => {
    // Check if board already exists
    const existing = await ctx.db
      .query('draft_boards')
      .withIndex('by_seasonId', (q) => q.eq('seasonId', args.seasonId))
      .first();

    if (existing) {
      return existing;
    }

    const boardId = await ctx.db.insert('draft_boards', {
      seasonId: args.seasonId,
      categories: [],
      createdAt: Date.now(),
    });

    return boardId;
  },
});

// Mutation: Add a category to a board
export const addCategory = mutation({
  args: { boardId: v.id('draft_boards'), title: v.string() },
  handler: async (ctx, args) => {
    const board = await ctx.db.get(args.boardId);
    if (!board) throw new Error('Board not found');

    if (board.isLocked) throw new Error('Board is locked');

    const categoryId = crypto.randomUUID();
    const newCategories = [
      ...board.categories,
      { id: categoryId, title: args.title },
    ];

    await ctx.db.patch(args.boardId, { categories: newCategories });
    return categoryId;
  },
});

// Mutation: Add a custom prompt to a category
export const addPrompt = mutation({
  args: {
    boardId: v.id('draft_boards'),
    categoryId: v.string(),
    text: v.string(),
  },
  handler: async (ctx, args) => {
    const board = await ctx.db.get(args.boardId);
    if (!board) throw new Error('Board not found');

    if (board.isLocked) throw new Error('Board is locked');

    // Count existing prompts in this category to determine order
    const existingCount = await ctx.db
      .query('draft_prompts')
      .withIndex('by_boardId', (q) => q.eq('boardId', args.boardId))
      .collect();

    const categoryPrompts = existingCount.filter(
      (p) => p.categoryId === args.categoryId
    );

    const promptId = await ctx.db.insert('draft_prompts', {
      boardId: args.boardId,
      categoryId: args.categoryId,
      text: args.text,
      order: categoryPrompts.length,
      isCanonical: false,
      createdAt: Date.now(),
    });

    return promptId;
  },
});

// Mutation: Import a canonical prompt to a category
export const importCanonicalPrompt = mutation({
  args: {
    boardId: v.id('draft_boards'),
    categoryId: v.string(),
    canonicalId: v.id('canonical_draft_prompts'),
  },
  handler: async (ctx, args) => {
    const canonical = await ctx.db.get(args.canonicalId);
    if (!canonical) throw new Error('Canonical prompt not found');

    const board = await ctx.db.get(args.boardId);
    if (!board) throw new Error('Board not found');

    if (board.isLocked) throw new Error('Board is locked');

    // Count existing prompts in this category
    const existingCount = await ctx.db
      .query('draft_prompts')
      .withIndex('by_boardId', (q) => q.eq('boardId', args.boardId))
      .collect();

    const categoryPrompts = existingCount.filter(
      (p) => p.categoryId === args.categoryId
    );

    const promptId = await ctx.db.insert('draft_prompts', {
      boardId: args.boardId,
      categoryId: args.categoryId,
      text: canonical.text,
      order: categoryPrompts.length,
      isCanonical: true,
      canonicalId: args.canonicalId,
      createdAt: Date.now(),
    });

    return promptId;
  },
});

// Mutation: Delete a prompt
export const deletePrompt = mutation({
  args: { promptId: v.id('draft_prompts') },
  handler: async (ctx, args) => {
    const prompt = await ctx.db.get(args.promptId);
    if (!prompt) throw new Error('Prompt not found');

    // Reorder remaining prompts in the same category
    const remaining = await ctx.db
      .query('draft_prompts')
      .withIndex('by_boardId', (q) => q.eq('boardId', prompt.boardId))
      .collect();

    const sameCategoryPrompts = remaining
      .filter(
        (p) => p.categoryId === prompt.categoryId && p._id !== args.promptId
      )
      .sort((a, b) => a.order - b.order);

    for (let i = 0; i < sameCategoryPrompts.length; i++) {
      await ctx.db.patch(sameCategoryPrompts[i]._id, { order: i });
    }

    await ctx.db.delete(args.promptId);
  },
});

// Mutation: Delete a category and its prompts
export const deleteCategory = mutation({
  args: { boardId: v.id('draft_boards'), categoryId: v.string() },
  handler: async (ctx, args) => {
    const board = await ctx.db.get(args.boardId);
    if (!board) throw new Error('Board not found');

    // Remove category from board
    const updatedCategories = board.categories.filter(
      (c) => c.id !== args.categoryId
    );
    await ctx.db.patch(args.boardId, { categories: updatedCategories });

    // Delete all prompts in this category
    const prompts = await ctx.db
      .query('draft_prompts')
      .withIndex('by_boardId', (q) => q.eq('boardId', args.boardId))
      .collect();

    const categoryPrompts = prompts.filter(
      (p) => p.categoryId === args.categoryId
    );

    for (const prompt of categoryPrompts) {
      await ctx.db.delete(prompt._id);
    }
  },
});

// Mutation: Lock the draft board
export const lockBoard = mutation({
  args: { boardId: v.id('draft_boards') },
  handler: async (ctx, args) => {
    const board = await ctx.db.get(args.boardId);
    if (!board) throw new Error('Board not found');

    if (board.isLocked) throw new Error('Board is already locked');

    // Count total prompts
    const prompts = await ctx.db
      .query('draft_prompts')
      .withIndex('by_boardId', (q) => q.eq('boardId', args.boardId))
      .collect();

    if (prompts.length < 16) {
      throw new Error('Board must have at least 16 prompts to lock');
    }

    await ctx.db.patch(args.boardId, {
      isLocked: true,
      lockedAt: Date.now(),
    });
  },
});

// Mutation: Unlock the draft board
export const unlockBoard = mutation({
  args: { boardId: v.id('draft_boards') },
  handler: async (ctx, args) => {
    const board = await ctx.db.get(args.boardId);
    if (!board) throw new Error('Board not found');

    if (!board.isLocked) throw new Error('Board is not locked');

    await ctx.db.patch(args.boardId, {
      isLocked: false,
      lockedAt: undefined,
    });
  },
});

// Mutation: Initialize draft (called when entering DRAFTING phase)
export const initializeDraft = mutation({
  args: { seasonId: v.id('seasons') },
  handler: async (ctx, args) => {
    // Check if draft state already exists
    const existingDraftState = await ctx.db
      .query('draft_state')
      .withIndex('by_seasonId', (q) => q.eq('seasonId', args.seasonId))
      .first();

    if (existingDraftState) {
      return existingDraftState;
    }

    // Get all season players for this season
    const seasonPlayers = await ctx.db
      .query('season_players')
      .withIndex('by_seasonId', (q) => q.eq('seasonId', args.seasonId))
      .collect();

    if (seasonPlayers.length === 0) {
      throw new Error('No players in season');
    }

    // Randomize draft order by shuffling seasonPlayers
    const draftOrder = seasonPlayers
      .map((p) => p._id)
      .sort(() => Math.random() - 0.5);

    // Create draft state
    const draftStateId = await ctx.db.insert('draft_state', {
      seasonId: args.seasonId,
      currentRound: 1,
      currentPickerIndex: 0, // First player in randomized order
      draftOrder,
      isComplete: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    // Log event for draft initialization (phase advance)
    const season2 = await ctx.db.get(args.seasonId);
    await logEvent(ctx, args.seasonId, 'PHASE_ADVANCED', {
      from: 'SEASON_SETUP',
      to: 'DRAFTING',
      draftOrderInitialized: true,
    });

    return await ctx.db.get(draftStateId);
  },
});

// Query: Get full draft state with all related data
export const getDraftState = query({
  args: { seasonId: v.id('seasons') },
  handler: async (ctx, args) => {
    // Get draft state
    const draftState = await ctx.db
      .query('draft_state')
      .withIndex('by_seasonId', (q) => q.eq('seasonId', args.seasonId))
      .first();

    if (!draftState) {
      return null;
    }

    // Get current picker player
    const currentPickerPlayerId =
      draftState.draftOrder[draftState.currentPickerIndex];
    const currentPicker = await ctx.db.get(currentPickerPlayerId);

    // Get all season players with user details
    const allSeasonPlayers = await ctx.db
      .query('season_players')
      .withIndex('by_seasonId', (q) => q.eq('seasonId', args.seasonId))
      .collect();

    const playersWithDetails = await Promise.all(
      allSeasonPlayers.map(async (sp) => {
        const user = await ctx.db.get(sp.userId);
        return {
          ...sp,
          user: {
            id: user._id,
            email: user.email,
            displayName: user.displayName,
          },
        };
      })
    );

    // Get draft board
    const board = await ctx.db
      .query('draft_boards')
      .withIndex('by_seasonId', (q) => q.eq('seasonId', args.seasonId))
      .first();

    if (!board) {
      throw new Error('Draft board not found');
    }

    // Get all prompts for this board
    const allPrompts = await ctx.db
      .query('draft_prompts')
      .withIndex('by_boardId', (q) => q.eq('boardId', board._id))
      .collect();

    // Organize prompts by status
    const availablePrompts = allPrompts.filter(
      (p) => (p.status || 'OPEN') === 'OPEN'
    );
    const selectedPrompts = allPrompts.filter((p) => p.status === 'SELECTED');

    // Get all rosters (artists for each player)
    const rosters = await Promise.all(
      allSeasonPlayers.map(async (sp) => {
        const entries = await ctx.db
          .query('roster_entries')
          .withIndex('by_seasonPlayerId', (q) => q.eq('seasonPlayerId', sp._id))
          .collect();

        const artists = await Promise.all(
          entries.map(async (entry) => {
            const artist = await ctx.db.get(entry.artistId);
            const prompt = await ctx.db.get(entry.promptId);
            return {
              ...artist,
              rosterEntry: entry,
              prompt: prompt ? { id: prompt._id, text: prompt.text } : null,
            };
          })
        );

        return {
          player: playersWithDetails.find((p) => p._id === sp._id),
          artists,
        };
      })
    );

    // Get draft history (all selections in order)
    const draftHistory = await ctx.db
      .query('draft_selections')
      .withIndex('by_seasonId', (q) => q.eq('seasonId', args.seasonId))
      .collect();

    const historyWithDetails = await Promise.all(
      draftHistory.map(async (selection) => {
        const player = await ctx.db.get(selection.selectedByPlayerId);
        const prompt = await ctx.db.get(selection.promptId);
        const user = await ctx.db.get(player.userId);
        return {
          ...selection,
          player: { ...player, user },
          prompt,
        };
      })
    );

    const currentPlayerDetails = playersWithDetails.find(
      (p) => p._id === currentPickerPlayerId
    );

    return {
      draftState,
      currentPlayer: currentPlayerDetails,
      currentRound: draftState.currentRound,
      currentPickerIndex: draftState.currentPickerIndex,
      draftOrder: draftState.draftOrder,
      isComplete: draftState.isComplete,
      availablePrompts,
      selectedPrompts,
      allPrompts,
      rosters,
      draftHistory: historyWithDetails,
      board,
    };
  },
});

// Mutation: Select a prompt (category pick by current player)
export const selectPrompt = mutation({
  args: {
    seasonId: v.id('seasons'),
    promptId: v.id('draft_prompts'),
    requestingUserId: v.id('users'),
  },
  handler: async (ctx, args) => {
    // Get draft state
    const draftState = await ctx.db
      .query('draft_state')
      .withIndex('by_seasonId', (q) => q.eq('seasonId', args.seasonId))
      .first();

    if (!draftState) {
      throw new Error('Draft not initialized');
    }

    if (draftState.isComplete) {
      throw new Error('Draft is complete');
    }

    // Get the prompt
    const prompt = await ctx.db.get(args.promptId);
    if (!prompt) {
      throw new Error('Prompt not found');
    }

    // Validate prompt is OPEN
    if ((prompt.status || 'OPEN') !== 'OPEN') {
      throw new Error('Prompt is not available');
    }

    // Get current picker
    const currentPickerPlayerId =
      draftState.draftOrder[draftState.currentPickerIndex];

    if (!currentPickerPlayerId) {
      throw new Error('Invalid draft state - no current picker');
    }

    // Get season and commissioner info
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

    // Get the requesting user's season player
    const requestingSeasonPlayer = await ctx.db
      .query('season_players')
      .withIndex('by_seasonId', (q) => q.eq('seasonId', args.seasonId))
      .filter((q) => q.eq(q.field('userId'), args.requestingUserId))
      .first();

    // Check authorization: either it's the requesting player's turn, or requester is commissioner
    if (!isCommissioner) {
      // Non-commissioner must be the current picker
      if (
        !requestingSeasonPlayer ||
        requestingSeasonPlayer._id.toString() !==
          currentPickerPlayerId.toString()
      ) {
        throw new Error("It's not your turn to select a prompt");
      }
    }

    // Update prompt status to SELECTED
    await ctx.db.patch(args.promptId, {
      status: 'SELECTED',
      selectedByPlayerId: currentPickerPlayerId,
      selectedAtRound: draftState.currentRound,
    });

    // Create draft selection record
    await ctx.db.insert('draft_selections', {
      seasonId: args.seasonId,
      promptId: args.promptId,
      selectedByPlayerId: currentPickerPlayerId as Id<'season_players'>,
      round: draftState.currentRound,
      createdAt: Date.now(),
    });

    // Log event
    const currentPickerUser = await ctx.db.get(currentPickerPlayerId);
    const currentPickerUserDetails = await ctx.db.get(currentPickerUser.userId);
    const promptDetails = await ctx.db.get(args.promptId);
    await logEvent(
      ctx,
      args.seasonId,
      'PROMPT_SELECTED',
      {
        player: currentPickerUserDetails.displayName,
        prompt: promptDetails.text,
        category: prompt.categoryId,
        round: draftState.currentRound,
      },
      currentPickerUser.userId
    );

    // Return success indicator (client will refetch via query)
    return { success: true };
  },
});

// Mutation: Draft an artist for the current player
export const draftArtist = mutation({
  args: {
    seasonId: v.id('seasons'),
    promptId: v.id('draft_prompts'),
    artistName: v.string(),
    requestingUserId: v.id('users'),
  },
  handler: async (ctx, args) => {
    // Get draft state
    const draftState = await ctx.db
      .query('draft_state')
      .withIndex('by_seasonId', (q) => q.eq('seasonId', args.seasonId))
      .first();

    if (!draftState) {
      throw new Error('Draft not initialized');
    }

    if (draftState.isComplete) {
      throw new Error('Draft is complete');
    }

    // Get the prompt
    const prompt = await ctx.db.get(args.promptId);
    if (!prompt) {
      throw new Error('Prompt not found');
    }

    // Validate prompt was selected for this round
    if (
      prompt.status !== 'SELECTED' ||
      prompt.selectedAtRound !== draftState.currentRound
    ) {
      throw new Error('Prompt must be selected first');
    }

    // Get current picker
    const currentPickerPlayerId =
      draftState.draftOrder[draftState.currentPickerIndex];

    // Get the player who selected this prompt
    const promptSelector = await ctx.db.get(prompt.selectedByPlayerId);
    if (!promptSelector) {
      throw new Error('Prompt selector not found');
    }

    // The prompt was selected by ONE player, but all players in the round draft from it
    // So we just need to verify it's someone's turn (current picker is valid)
    if (!currentPickerPlayerId) {
      throw new Error('Invalid draft state - no current picker');
    }

    // Get season and commissioner info for authorization
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

    // Get the requesting user's season player
    const requestingSeasonPlayer = await ctx.db
      .query('season_players')
      .withIndex('by_seasonId', (q) => q.eq('seasonId', args.seasonId))
      .filter((q) => q.eq(q.field('userId'), args.requestingUserId))
      .first();

    // Check authorization: either it's the requesting player's turn (for their own player) or requester is commissioner
    if (!isCommissioner) {
      // Non-commissioner must be the current picker
      if (
        !requestingSeasonPlayer ||
        requestingSeasonPlayer._id.toString() !==
          currentPickerPlayerId.toString()
      ) {
        throw new Error("It's not your turn to draft an artist");
      }
    }

    // Check for duplicate artist in this season
    const existingArtist = await ctx.db
      .query('artists')
      .withIndex('by_name_seasonId', (q) =>
        q.eq('name', args.artistName).eq('seasonId', args.seasonId)
      )
      .first();

    // Check if any roster entry already has this artist
    if (existingArtist) {
      const existingEntry = await ctx.db
        .query('roster_entries')
        .withIndex('by_artistId', (q) => q.eq('artistId', existingArtist._id))
        .first();

      if (existingEntry) {
        throw new Error(`Artist "${args.artistName}" already drafted`);
      }
    }

    // Create or get artist
    let artistId: any;
    if (existingArtist) {
      artistId = existingArtist._id;
    } else {
      artistId = await ctx.db.insert('artists', {
        name: args.artistName,
        seasonId: args.seasonId,
        createdAt: Date.now(),
      });
    }

    // Create roster entry
    await ctx.db.insert('roster_entries', {
      seasonPlayerId: currentPickerPlayerId,
      artistId,
      promptId: args.promptId,
      status: 'ACTIVE',
      acquiredVia: 'DRAFT',
      acquiredAtWeek: 0, // Draft happens in week 0 (preseason)
      acquiredAtRound: draftState.currentRound,
      createdAt: Date.now(),
    });

    // Log event
    const currentPickerUserData = await ctx.db.get(currentPickerPlayerId);
    const currentPickerUserDetails2 = await ctx.db.get(
      currentPickerUserData.userId
    );
    const promptDetails2 = await ctx.db.get(args.promptId);
    await logEvent(
      ctx,
      args.seasonId,
      'DRAFT_PICK',
      {
        round: draftState.currentRound,
        player: currentPickerUserDetails2.displayName,
        prompt: promptDetails2.text,
        artist: args.artistName,
      },
      currentPickerUserData.userId
    );

    // Count how many players have already picked this round for this category
    const categorySelections = await ctx.db
      .query('draft_selections')
      .withIndex('by_seasonId', (q) => q.eq('seasonId', args.seasonId))
      .collect();

    const thisRoundInCategory = categorySelections.filter(
      (sel) =>
        sel.round === draftState.currentRound &&
        // Check if the prompt is in the same category
        prompt.categoryId === prompt.categoryId // This is checking prompt
    );

    // Get all season players to check who has picked this round
    const allSeasonPlayers = await ctx.db
      .query('season_players')
      .withIndex('by_seasonId', (q) => q.eq('seasonId', args.seasonId))
      .collect();

    const playersWhoPickedThisRound = new Set<string>();

    for (const sp of allSeasonPlayers) {
      const rosterEntriesForPlayer = await ctx.db
        .query('roster_entries')
        .withIndex('by_seasonPlayerId', (q) => q.eq('seasonPlayerId', sp._id))
        .collect();

      // Check if this player has any artist picked in the current round
      const hasPickedThisRound = rosterEntriesForPlayer.some(
        (r) => r.acquiredAtRound === draftState.currentRound
      );

      if (hasPickedThisRound) {
        playersWhoPickedThisRound.add(sp._id.toString());
      }
    }

    // Get number of players in draft
    const numPlayers = draftState.draftOrder.length;

    // Advance turn with snake draft logic
    let newPickerIndex = draftState.currentPickerIndex;
    let newRound = draftState.currentRound;
    let isComplete = false;

    // If all players have picked this round, advance to next round
    if (playersWhoPickedThisRound.size === numPlayers) {
      // Retire the selected prompt for this round since it's done
      // Clear selectedAtRound to ensure clean state for next round
      await ctx.db.patch(args.promptId, {
        status: 'RETIRED',
        selectedAtRound: undefined,
      });

      newRound = draftState.currentRound + 1;

      // Snake draft pattern: pairs of rounds snake within each pair
      // Rounds 1-2: 1→2→3→4, then 4→3→2→1
      // Rounds 3-4: 2→3→4→1, then 1→4→3→2
      // Rounds 5-6: 3→4→1→2, then 2→1→4→3
      // Rounds 7-8: 4→1→2→3, then 3→2→1→4

      if (newRound > 8) {
        isComplete = true;
        newPickerIndex = 0;
      } else {
        // Determine if this is an odd or even round within a pair (1-2, 3-4, 5-6, 7-8)
        const pairNumber = Math.ceil(newRound / 2); // 1, 2, 3, or 4
        const isFirstRoundOfPair = newRound % 2 === 1;

        if (isFirstRoundOfPair) {
          // First round of pair: start with (pairNumber - 1) player
          // Pair 1 starts with P0 (1), Pair 2 starts with P1 (2), etc.
          newPickerIndex = (pairNumber - 1) % numPlayers;
        } else {
          // Second round of pair (snake): start from opposite end
          // After pair 1 first round (P0→P1→P2→P3), reverse to (P3→P2→P1→P0)
          const startOfPair = (pairNumber - 1) % numPlayers;
          newPickerIndex = (startOfPair + numPlayers - 1) % numPlayers; // Last player in forward order
        }
      }
    } else {
      // Continue current round, advance to next player
      const currentRoundIsOdd = draftState.currentRound % 2 === 1;
      if (currentRoundIsOdd) {
        // First round of pair: go forward
        newPickerIndex = (draftState.currentPickerIndex + 1) % numPlayers;
      } else {
        // Second round of pair: go backward
        newPickerIndex =
          (draftState.currentPickerIndex - 1 + numPlayers) % numPlayers;
      }
    }

    // Update draft state
    await ctx.db.patch(draftState._id, {
      currentRound: newRound,
      currentPickerIndex: newPickerIndex,
      isComplete,
      updatedAt: Date.now(),
    });

    // If complete, advance season phase to ADVANTAGE_SELECTION
    if (isComplete) {
      await ctx.db.patch(args.seasonId, {
        currentPhase: 'ADVANTAGE_SELECTION',
      });
    }

    // Return success indicator (client will refetch via query)
    return { success: true };
  },
});

// Query: Get a specific player's roster
export const getPlayerRoster = query({
  args: { seasonPlayerId: v.id('season_players') },
  handler: async (ctx, args) => {
    const entries = await ctx.db
      .query('roster_entries')
      .withIndex('by_seasonPlayerId', (q) =>
        q.eq('seasonPlayerId', args.seasonPlayerId)
      )
      .collect();

    const roster = await Promise.all(
      entries.map(async (entry) => {
        const artist = await ctx.db.get(entry.artistId);
        const prompt = await ctx.db.get(entry.promptId);
        return {
          artist,
          entry,
          prompt: { id: prompt._id, text: prompt.text },
        };
      })
    );

    return roster;
  },
});

// Query: Get draft board with prompts organized by category
export const getDraftBoard = query({
  args: { seasonId: v.id('seasons') },
  handler: async (ctx, args) => {
    const board = await ctx.db
      .query('draft_boards')
      .withIndex('by_seasonId', (q) => q.eq('seasonId', args.seasonId))
      .first();

    if (!board) {
      return null;
    }

    const allPrompts = await ctx.db
      .query('draft_prompts')
      .withIndex('by_boardId', (q) => q.eq('boardId', board._id))
      .collect();

    // Organize by category
    const categoriesWithPrompts = board.categories.map((cat) => {
      const categoryPrompts = allPrompts
        .filter((p) => p.categoryId === cat.id)
        .sort((a, b) => a.order - b.order);

      return {
        ...cat,
        prompts: categoryPrompts,
      };
    });

    return {
      board,
      categories: categoriesWithPrompts,
      allPrompts,
    };
  },
});

// Mutation: Reset draft to initial state (commissioner only)
export const resetDraft = mutation({
  args: {
    seasonId: v.id('seasons'),
    requestingUserId: v.id('users'),
    randomizeDraftOrder: v.optional(v.boolean()), // Default false to preserve current order
  },
  handler: async (ctx, args) => {
    // Get season and verify commissioner
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
    if (!isCommissioner) {
      throw new Error('Only commissioners can reset the draft');
    }

    // Delete all draft_selections
    const draftSelections = await ctx.db
      .query('draft_selections')
      .withIndex('by_seasonId', (q) => q.eq('seasonId', args.seasonId))
      .collect();

    for (const selection of draftSelections) {
      await ctx.db.delete(selection._id);
    }

    // Delete all roster_entries for this season
    const seasonPlayers = await ctx.db
      .query('season_players')
      .withIndex('by_seasonId', (q) => q.eq('seasonId', args.seasonId))
      .collect();

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

    // Delete all artists for this season
    const artists = await ctx.db
      .query('artists')
      .withIndex('by_seasonId', (q) => q.eq('seasonId', args.seasonId))
      .collect();

    for (const artist of artists) {
      await ctx.db.delete(artist._id);
    }

    // Reset all draft_prompts to OPEN status
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

    // Reinitialize draft state
    const existingDraftState = await ctx.db
      .query('draft_state')
      .withIndex('by_seasonId', (q) => q.eq('seasonId', args.seasonId))
      .first();

    // Determine draft order - randomize only if explicitly requested
    let draftOrder: any;
    if (args.randomizeDraftOrder) {
      // Randomize draft order
      draftOrder = seasonPlayers
        .map((p) => p._id)
        .sort(() => Math.random() - 0.5);
    } else {
      // Preserve current draft order
      if (existingDraftState) {
        draftOrder = existingDraftState.draftOrder;
      } else {
        // Fallback: keep original order if no existing state
        draftOrder = seasonPlayers.map((p) => p._id);
      }
    }

    if (existingDraftState) {
      // Update existing draft state
      await ctx.db.patch(existingDraftState._id, {
        currentRound: 1,
        currentPickerIndex: 0,
        draftOrder,
        isComplete: false,
        updatedAt: Date.now(),
      });
    } else {
      // Create new draft state
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

    // Reset season phase back to DRAFTING
    await ctx.db.patch(args.seasonId, {
      currentPhase: 'DRAFTING',
    });

    // Log event
    await logEvent(ctx, args.seasonId, 'DRAFT_RESET', {
      from: season.currentPhase,
      to: 'DRAFTING',
      message: 'Draft reset to beginning - all picks cleared',
    });

    return { success: true, message: 'Draft reset to initial state' };
  },
});
