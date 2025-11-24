import { mutation, query } from './_generated/server';
import { v } from 'convex/values';
import type { Id } from 'convex/_generated/dataModel';
import { logEvent } from './events';

// Query: Get a challenge board with its challenges
export const getBoard = query({
  args: { seasonId: v.id('seasons') },
  handler: async (ctx, args) => {
    const board = await ctx.db
      .query('challenge_boards')
      .withIndex('by_seasonId', (q) => q.eq('seasonId', args.seasonId))
      .first();

    if (!board) return null;

    const boardChallenges = await ctx.db
      .query('board_challenges')
      .withIndex('by_boardId', (q) => q.eq('boardId', board._id))
      .collect();

    const challenges = await Promise.all(
      boardChallenges.map(async (bc) => {
        const canonical = await ctx.db.get(bc.canonicalChallengeId);
        const category = canonical
          ? await ctx.db.get(canonical.categoryId)
          : null;
        return {
          ...bc,
          canonical: canonical
            ? {
                ...canonical,
                category: category?.name,
              }
            : null,
        };
      })
    );

    return {
      board,
      challenges: challenges.sort((a, b) => a.order - b.order),
    };
  },
});

// Mutation: Duplicate a challenge board from another season in the same league
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
      targetLeague.commissionerId.toString() === args.requestingUserId.toString();
    if (!isCommissioner) {
      throw new Error('Only the commissioner can duplicate the challenge board');
    }

    const sourceBoard = await ctx.db
      .query('challenge_boards')
      .withIndex('by_seasonId', (q) => q.eq('seasonId', args.sourceSeasonId))
      .first();

    if (!sourceBoard) {
      throw new Error('Source season has no challenge board to duplicate');
    }

    const sourceItems = await ctx.db
      .query('board_challenges')
      .withIndex('by_boardId', (q) => q.eq('boardId', sourceBoard._id))
      .collect();

    let targetBoard = await ctx.db
      .query('challenge_boards')
      .withIndex('by_seasonId', (q) => q.eq('seasonId', args.targetSeasonId))
      .first();

    if (!targetBoard) {
      const newBoardId = await ctx.db.insert('challenge_boards', {
        seasonId: args.targetSeasonId,
        categories: [],
        createdAt: Date.now(),
      });
      targetBoard = await ctx.db.get(newBoardId);
    }

    // Delete existing challenges on the target board
    const existingItems = await ctx.db
      .query('board_challenges')
      .withIndex('by_boardId', (q) => q.eq('boardId', targetBoard._id))
      .collect();

    for (const item of existingItems) {
      await ctx.db.delete(item._id);
    }

    // Copy categories from source board, and reset lock state
    await ctx.db.patch(targetBoard._id, {
      categories: sourceBoard.categories,
      isLocked: undefined,
      lockedAt: undefined,
    });

    // Recreate board challenges on the target board
    for (const item of sourceItems) {
      await ctx.db.insert('board_challenges', {
        boardId: targetBoard._id,
        categoryId: item.categoryId,
        canonicalChallengeId: item.canonicalChallengeId,
        order: item.order,
        createdAt: Date.now(),
      });
    }

    return { success: true };
  },
});

// Mutation: Create a new challenge board for a season
export const createBoard = mutation({
  args: { seasonId: v.id('seasons') },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('challenge_boards')
      .withIndex('by_seasonId', (q) => q.eq('seasonId', args.seasonId))
      .first();

    if (existing) {
      return existing;
    }

    const boardId = await ctx.db.insert('challenge_boards', {
      seasonId: args.seasonId,
      categories: [],
      createdAt: Date.now(),
    });

    return boardId;
  },
});

// Mutation: Add a category to a board
export const addCategory = mutation({
  args: { boardId: v.id('challenge_boards'), title: v.string() },
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

// Mutation: Add a challenge to a category on the board
export const addChallenge = mutation({
  args: {
    boardId: v.id('challenge_boards'),
    categoryId: v.string(),
    canonicalChallengeId: v.id('canonical_challenges'),
  },
  handler: async (ctx, args) => {
    const board = await ctx.db.get(args.boardId);
    if (!board) throw new Error('Board not found');

    if (board.isLocked) throw new Error('Board is locked');

    const canonical = await ctx.db.get(args.canonicalChallengeId);
    if (!canonical) throw new Error('Challenge not found');

    // Count existing challenges in this category to determine order
    const existing = await ctx.db
      .query('board_challenges')
      .withIndex('by_boardId', (q) => q.eq('boardId', args.boardId))
      .collect();

    const categoryCount = existing.filter(
      (c) => c.categoryId === args.categoryId
    ).length;

    const challengeId = await ctx.db.insert('board_challenges', {
      boardId: args.boardId,
      categoryId: args.categoryId,
      canonicalChallengeId: args.canonicalChallengeId,
      order: categoryCount,
      createdAt: Date.now(),
    });

    return challengeId;
  },
});

// Mutation: Remove a challenge from the board
export const removeChallenge = mutation({
  args: { challengeId: v.id('board_challenges') },
  handler: async (ctx, args) => {
    const challenge = await ctx.db.get(args.challengeId);
    if (!challenge) throw new Error('Challenge not found');

    const board = await ctx.db.get(challenge.boardId);
    if (!board) throw new Error('Board not found');

    if (board.isLocked) throw new Error('Board is locked');

    // Reorder remaining challenges in the same category
    const remaining = await ctx.db
      .query('board_challenges')
      .withIndex('by_boardId', (q) => q.eq('boardId', challenge.boardId))
      .collect();

    const sameCategoryItems = remaining
      .filter(
        (c) =>
          c.categoryId === challenge.categoryId && c._id !== args.challengeId
      )
      .sort((a, b) => a.order - b.order);

    for (let i = 0; i < sameCategoryItems.length; i++) {
      await ctx.db.patch(sameCategoryItems[i]._id, { order: i });
    }

    await ctx.db.delete(args.challengeId);
  },
});

// Mutation: Delete a category and its challenges
export const deleteCategory = mutation({
  args: {
    boardId: v.id('challenge_boards'),
    categoryId: v.string(),
  },
  handler: async (ctx, args) => {
    const board = await ctx.db.get(args.boardId);
    if (!board) throw new Error('Board not found');

    if (board.isLocked) throw new Error('Board is locked');

    // Remove category from board
    const updatedCategories = board.categories.filter(
      (c) => c.id !== args.categoryId
    );
    await ctx.db.patch(args.boardId, { categories: updatedCategories });

    // Delete all challenges in this category
    const challenges = await ctx.db
      .query('board_challenges')
      .withIndex('by_boardId', (q) => q.eq('boardId', args.boardId))
      .collect();

    const categoryItems = challenges.filter(
      (c) => c.categoryId === args.categoryId
    );

    for (const item of categoryItems) {
      await ctx.db.delete(item._id);
    }
  },
});

// Mutation: Lock the challenge board
export const lockBoard = mutation({
  args: { boardId: v.id('challenge_boards') },
  handler: async (ctx, args) => {
    const board = await ctx.db.get(args.boardId);
    if (!board) throw new Error('Board not found');

    if (board.isLocked) throw new Error('Board is already locked');

    // Count total challenges
    const challenges = await ctx.db
      .query('board_challenges')
      .withIndex('by_boardId', (q) => q.eq('boardId', args.boardId))
      .collect();

    if (challenges.length < 30) {
      throw new Error(
        `Board must have at least 30 challenges to lock (current: ${challenges.length})`
      );
    }

    await ctx.db.patch(args.boardId, {
      isLocked: true,
      lockedAt: Date.now(),
    });
  },
});

// Mutation: Unlock the challenge board
export const unlockBoard = mutation({
  args: { boardId: v.id('challenge_boards') },
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

// Mutation: Reorder challenges within a category
export const reorderChallenges = mutation({
  args: {
    categoryId: v.string(),
    challengeIds: v.array(v.id('board_challenges')),
  },
  handler: async (ctx, args) => {
    // Verify all challenges belong to the same category
    const challenges = await Promise.all(
      args.challengeIds.map((id) => ctx.db.get(id))
    );

    for (const challenge of challenges) {
      if (!challenge) throw new Error('Challenge not found');
      if (challenge.categoryId !== args.categoryId) {
        throw new Error('All challenges must belong to the same category');
      }

      const board = await ctx.db.get(challenge.boardId);
      if (!board) throw new Error('Board not found');
      if (board.isLocked) throw new Error('Board is locked');
    }

    // Update order for each challenge
    for (let i = 0; i < args.challengeIds.length; i++) {
      await ctx.db.patch(args.challengeIds[i], { order: i });
    }
  },
});

// Helper: Get which player picks for a given week
export async function getPickerForWeek(
  ctx: any,
  seasonId: Id<'seasons'>,
  weekNumber: number
): Promise<Id<'season_players'> | null> {
  // Get season to check status
  const season = await ctx.db.get(seasonId);
  if (!season) {
    return null;
  }

  // Only return picker if season is in progress
  if (season.status !== 'IN_PROGRESS') {
    return null;
  }

  // Week 0 or negative weeks don't have pickers
  if (weekNumber < 1) {
    return null;
  }

  const players = await ctx.db
    .query('season_players')
    .withIndex('by_seasonId', (q) => q.eq('seasonId', seasonId))
    .collect();

  if (players.length === 0) {
    return null;
  }

  // Calculate picker based on draft position and week
  // Formula: (draftPosition + weekNumber - 2) % playerCount
  const playerCount = players.length;
  const pickerIndex = (weekNumber - 1) % playerCount;

  // Sort by draft position to get the correct player
  const sortedPlayers = players.sort((a, b) => {
    const aPosNorm = (a.draftPosition ?? 1) - 1;
    const bPosNorm = (b.draftPosition ?? 1) - 1;
    return aPosNorm - bPosNorm;
  });

  // Safety check: ensure pickerIndex is valid
  if (pickerIndex < 0 || pickerIndex >= sortedPlayers.length) {
    return null;
  }

  return sortedPlayers[pickerIndex]?._id ?? null;
}

// Query: Get all challenge selection data for the page
export const getChallengeSelectionPageData = query({
  args: {
    seasonId: v.id('seasons'),
  },
  handler: async (ctx, args) => {
    const season = await ctx.db.get(args.seasonId);
    if (!season) {
      throw new Error('Season not found');
    }

    const weekNumber = season.currentWeek;

    // Get the board and challenges
    const board = await ctx.db
      .query('challenge_boards')
      .withIndex('by_seasonId', (q) => q.eq('seasonId', args.seasonId))
      .first();

    if (!board) {
      throw new Error('Challenge board not found');
    }

    const boardChallenges = await ctx.db
      .query('board_challenges')
      .withIndex('by_boardId', (q) => q.eq('boardId', board._id))
      .collect();

    // Get all previous selections for this season
    const allSelections = await ctx.db
      .query('challenge_selections')
      .withIndex('by_seasonId', (q) => q.eq('seasonId', args.seasonId))
      .collect();

    // Get selection for current week
    const currentWeekSelection = allSelections.find(
      (s) => s.weekNumber === weekNumber
    );

    // Get all reveals for this season
    const allReveals = await ctx.db
      .query('challenge_reveals')
      .withIndex('by_seasonId', (q) => q.eq('seasonId', args.seasonId))
      .collect();

    // Enrich board challenges with canonical data
    const enrichedChallenges = await Promise.all(
      boardChallenges.map(async (bc) => {
        const canonical = await ctx.db.get(bc.canonicalChallengeId);
        const category = canonical
          ? await ctx.db.get(canonical.categoryId)
          : null;

        // Check if this challenge was selected in any week
        const selection = allSelections.find(
          (s) => s.boardChallengeId === bc._id
        );
        const isSelected = !!selection;

        // Check if this challenge has been revealed in any week
        const reveal = allReveals.find((r) => r.boardChallengeId === bc._id);
        const isRevealed = !!reveal;

        return {
          ...bc,
          canonical: canonical
            ? {
                title: canonical.title,
                description: canonical.description,
                emoji: canonical.emoji,
                generalVibe: canonical.generalVibe,
                constraints: canonical.constraints,
                awardCategories: canonical.awardCategories,
                category: category?.name,
              }
            : null,
          isRevealed,
          revealedAtWeek: reveal?.revealedAtWeek,
          isSelected,
          selectedAtWeek: selection?.weekNumber,
        };
      })
    );

    // Get the picker for this week
    const pickerId = await getPickerForWeek(ctx, args.seasonId, weekNumber);
    if (!pickerId) {
      return null;
    }
    const picker = await ctx.db.get(pickerId);
    const pickerUser = picker ? await ctx.db.get(picker.userId) : null;

    // Count reveals for current picker this week
    const revealsThisWeek = allReveals.filter(
      (r) =>
        r.revealedAtWeek === weekNumber && r.revealedByPlayerId === pickerId
    ).length;

    // Get all season players for reference
    const allPlayers = await ctx.db
      .query('season_players')
      .withIndex('by_seasonId', (q) => q.eq('seasonId', args.seasonId))
      .collect();

    return {
      season: {
        name: season.name,
        currentWeek: weekNumber,
        currentPhase: season.currentPhase,
      },
      board,
      challenges: enrichedChallenges.sort((a, b) => a.order - b.order),
      picker: picker
        ? {
            _id: picker._id,
            labelName: picker.labelName,
            displayName: pickerUser?.displayName,
          }
        : null,
      currentSelection: currentWeekSelection,
      allSelections,
      allReveals,
      revealsThisWeek,
      allPlayers: allPlayers.length,
    };
  },
});

// Mutation: Reveal a challenge
export const revealChallenge = mutation({
  args: {
    seasonId: v.id('seasons'),
    boardChallengeId: v.id('board_challenges'),
    requestingUserId: v.id('users'),
  },
  handler: async (ctx, args) => {
    const season = await ctx.db.get(args.seasonId);
    if (!season) {
      throw new Error('Season not found');
    }

    const weekNumber = season.currentWeek;

    // Get the current picker for this week
    const pickerId = await getPickerForWeek(ctx, args.seasonId, weekNumber);
    if (!pickerId) {
      throw new Error('No picker available for this week');
    }

    // Find the season player for the requesting user
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
      throw new Error('Requesting user is not a player in this season');
    }

    // Check if requester is picker or commissioner (get commissioner from season)
    const league = await ctx.db.get(season.leagueId);
    const isCommissioner =
      league?.commissionerId.toString() === args.requestingUserId.toString();
    const isPicker = requestingPlayer._id.toString() === pickerId.toString();

    if (!isPicker && !isCommissioner) {
      throw new Error('Only the picker or commissioner can reveal challenges');
    }

    // When commissioner reveals, use the picker's ID for tracking
    const playerIdForReveal = isCommissioner ? pickerId : requestingPlayer._id;

    // Check reveal limit - count reveals by the player who will be recorded (picker if commissioner, requesting player otherwise)
    const revealsThisWeek = await ctx.db
      .query('challenge_reveals')
      .withIndex('by_seasonId', (q) => q.eq('seasonId', args.seasonId))
      .collect()
      .then((reveals) =>
        reveals.filter(
          (r) =>
            r.revealedAtWeek === weekNumber &&
            r.revealedByPlayerId === playerIdForReveal
        )
      );

    // Commissioners have unlimited reveals, but regular players are limited to 2
    if (!isCommissioner && revealsThisWeek.length >= 2) {
      throw new Error('You have already revealed 2 challenges this week');
    }

    // Check if already revealed
    const existing = await ctx.db
      .query('challenge_reveals')
      .withIndex('by_boardChallengeId', (q) =>
        q.eq('boardChallengeId', args.boardChallengeId)
      )
      .collect()
      .then((reveals) =>
        reveals.find((r) => r.seasonId.toString() === args.seasonId.toString())
      );

    if (existing) {
      throw new Error('This challenge has already been revealed');
    }

    // Create the reveal record (use picker's ID if commissioner is revealing)
    const revealId = await ctx.db.insert('challenge_reveals', {
      seasonId: args.seasonId,
      boardChallengeId: args.boardChallengeId,
      revealedByPlayerId: playerIdForReveal,
      revealedAtWeek: weekNumber,
      createdAt: Date.now(),
    });

    return await ctx.db.get(revealId);
  },
});

// Mutation: Select a challenge for the week
export const selectChallenge = mutation({
  args: {
    seasonId: v.id('seasons'),
    boardChallengeId: v.id('board_challenges'),
    requestingUserId: v.id('users'),
  },
  handler: async (ctx, args) => {
    const season = await ctx.db.get(args.seasonId);
    if (!season) {
      throw new Error('Season not found');
    }

    const weekNumber = season.currentWeek;

    // Get the current picker for this week
    const pickerId = await getPickerForWeek(ctx, args.seasonId, weekNumber);
    if (!pickerId) {
      throw new Error('No picker available for this week');
    }

    // Check if requester is commissioner
    const league = await ctx.db.get(season.leagueId);
    const isCommissioner =
      league?.commissionerId.toString() === args.requestingUserId.toString();

    // Find the season player for the requesting user (if they're a player)
    const requestingPlayer = await ctx.db
      .query('season_players')
      .withIndex('by_seasonId', (q) => q.eq('seasonId', args.seasonId))
      .collect()
      .then((players) =>
        players.find(
          (p) => p.userId.toString() === args.requestingUserId.toString()
        )
      );

    // Validate the requester is either the picker or the commissioner
    if (!isCommissioner) {
      if (!requestingPlayer) {
        throw new Error('Requesting user is not a player in this season');
      }
      if (requestingPlayer._id.toString() !== pickerId.toString()) {
        throw new Error(
          'Only the assigned picker can select a challenge this week'
        );
      }
    }

    // Use picker's ID for the selection (whether picker or commissioner selects)
    const playerIdForSelection = pickerId;

    // Check if a challenge has already been selected this week
    const existingSelection = await ctx.db
      .query('challenge_selections')
      .withIndex('by_seasonId_weekNumber', (q) =>
        q.eq('seasonId', args.seasonId).eq('weekNumber', weekNumber)
      )
      .first();

    if (existingSelection) {
      throw new Error('A challenge has already been selected for this week');
    }

    // Validate the challenge hasn't been selected in any prior week
    const previousSelections = await ctx.db
      .query('challenge_selections')
      .withIndex('by_seasonId', (q) => q.eq('seasonId', args.seasonId))
      .collect();

    if (
      previousSelections.some(
        (s) => s.boardChallengeId === args.boardChallengeId
      )
    ) {
      throw new Error(
        'This challenge has already been selected in a previous week'
      );
    }

    // Get challenge details for logging
    const boardChallenge = await ctx.db.get(args.boardChallengeId);
    if (!boardChallenge) {
      throw new Error('Challenge not found');
    }

    const canonical = await ctx.db.get(boardChallenge.canonicalChallengeId);
    const category = canonical ? await ctx.db.get(canonical.categoryId) : null;

    // Get picker player info for logging
    const pickerPlayer = await ctx.db.get(pickerId);
    if (!pickerPlayer) {
      throw new Error('Picker player not found');
    }

    // Create the selection record (use picker's ID)
    const selectionId = await ctx.db.insert('challenge_selections', {
      seasonId: args.seasonId,
      weekNumber: weekNumber,
      boardChallengeId: args.boardChallengeId,
      selectedByPlayerId: playerIdForSelection,
      createdAt: Date.now(),
    });

    // Log the event (use picker's info, note if commissioner selected)
    await logEvent(
      ctx,
      args.seasonId,
      'CHALLENGE_SELECTED',
      {
        week: weekNumber,
        player: pickerPlayer.labelName,
        challenge: {
          title: canonical?.title || 'Unknown',
          description: canonical?.description || '',
        },
        category: category?.name || 'Unknown',
        selectedByCommissioner: isCommissioner,
      },
      args.requestingUserId
    );

    // Only automatically advance to PLAYLIST_SUBMISSION if challenge has no options
    // If challenge has options, stay in IN_SEASON_CHALLENGE_SELECTION phase
    if (!canonical?.options || canonical.options.length === 0) {
      await ctx.db.patch(args.seasonId, {
        currentPhase: 'PLAYLIST_SUBMISSION',
      });

      // Log phase advancement
      await logEvent(
        ctx,
        args.seasonId,
        'PHASE_ADVANCED',
        {
          from: 'IN_SEASON_CHALLENGE_SELECTION',
          to: 'PLAYLIST_SUBMISSION',
        },
        args.requestingUserId
      );
    }

    return await ctx.db.get(selectionId);
  },
});

// Mutation: Reset challenge selection for current week (God Mode - Commissioner Only)
export const resetChallengeSelection = mutation({
  args: {
    seasonId: v.id('seasons'),
    requestingUserId: v.id('users'),
  },
  handler: async (ctx, args) => {
    const season = await ctx.db.get(args.seasonId);
    if (!season) {
      throw new Error('Season not found');
    }

    // Verify requester is commissioner
    const league = await ctx.db.get(season.leagueId);
    if (
      !league ||
      league.commissionerId.toString() !== args.requestingUserId.toString()
    ) {
      throw new Error('Only the commissioner can reset challenge selection');
    }

    const weekNumber = season.currentWeek;

    // Delete all reveals for this week
    const reveals = await ctx.db
      .query('challenge_reveals')
      .withIndex('by_seasonId', (q) => q.eq('seasonId', args.seasonId))
      .collect();

    const revealsThisWeek = reveals.filter(
      (r) => r.revealedAtWeek === weekNumber
    );
    for (const reveal of revealsThisWeek) {
      await ctx.db.delete(reveal._id);
    }

    // Delete selection for this week
    const selections = await ctx.db
      .query('challenge_selections')
      .withIndex('by_seasonId_weekNumber', (q) =>
        q.eq('seasonId', args.seasonId).eq('weekNumber', weekNumber)
      )
      .collect();

    for (const selection of selections) {
      await ctx.db.delete(selection._id);
    }

    // Log the reset event
    await logEvent(
      ctx,
      args.seasonId,
      'CHALLENGE_SELECTION_RESET',
      {
        week: weekNumber,
        resetBy: 'COMMISSIONER',
      },
      args.requestingUserId
    );

    return {
      deletedReveals: revealsThisWeek.length,
      deletedSelections: selections.length,
    };
  },
});

// Query: Get the current week's selected challenge
export const getCurrentChallenge = query({
  args: {
    seasonId: v.id('seasons'),
  },
  handler: async (ctx, args) => {
    const season = await ctx.db.get(args.seasonId);
    if (!season) {
      throw new Error('Season not found');
    }

    // Return null if season is not in progress
    if (season.status !== 'IN_PROGRESS') {
      return null;
    }

    const weekNumber = season.currentWeek;

    // Get the selection for current week
    const selection = await ctx.db
      .query('challenge_selections')
      .withIndex('by_seasonId_weekNumber', (q) =>
        q.eq('seasonId', args.seasonId).eq('weekNumber', weekNumber)
      )
      .first();

    if (!selection) {
      return null;
    }

    // Get board challenge
    const boardChallenge = await ctx.db.get(selection.boardChallengeId);
    if (!boardChallenge) {
      throw new Error('Board challenge not found');
    }

    // Get canonical challenge details
    const canonical = await ctx.db.get(boardChallenge.canonicalChallengeId);
    if (!canonical) {
      throw new Error('Canonical challenge not found');
    }

    // Get category
    const category = await ctx.db.get(canonical.categoryId);

    // Get picker player info
    const picker = await ctx.db.get(selection.selectedByPlayerId);
    if (!picker) {
      throw new Error('Picker player not found');
    }

    const pickerUser = await ctx.db.get(picker.userId);

    // Award categories are already populated in canonical, just use them
    const enrichedAwardCategories = canonical.awardCategories || [];

    return {
      weekNumber,
      picker: {
        _id: picker._id,
        labelName: picker.labelName,
        displayName: pickerUser?.displayName,
      },
      challenge: {
        _id: canonical._id,
        emoji: canonical.emoji,
        title: canonical.title,
        description: canonical.description,
        generalVibe: canonical.generalVibe,
        constraints: canonical.constraints,
        awardCategories: enrichedAwardCategories,
        category: category?.name || 'Unknown',
        options: canonical.options,
      },
    };
  },
});

// Query: Get option selection status for current challenge
export const getOptionSelectionStatus = query({
  args: {
    seasonId: v.id('seasons'),
  },
  handler: async (ctx, args) => {
    const season = await ctx.db.get(args.seasonId);
    if (!season) {
      throw new Error('Season not found');
    }

    const weekNumber = season.currentWeek;

    // Get the challenge selection for this week
    const challengeSelection = await ctx.db
      .query('challenge_selections')
      .withIndex('by_seasonId_weekNumber', (q) =>
        q.eq('seasonId', args.seasonId).eq('weekNumber', weekNumber)
      )
      .first();

    if (!challengeSelection) {
      return null; // No challenge selected yet
    }

    // Get board challenge and canonical challenge
    const boardChallenge = await ctx.db.get(challengeSelection.boardChallengeId);
    if (!boardChallenge) {
      throw new Error('Board challenge not found');
    }

    const canonical = await ctx.db.get(boardChallenge.canonicalChallengeId);
    if (!canonical) {
      throw new Error('Canonical challenge not found');
    }

    // If challenge has no options, return null
    if (!canonical.options || canonical.options.length === 0) {
      return null;
    }

    // Get all season players and calculate standings (reverse order: 4th → 3rd → 2nd → 1st)
    const allPlayers = await ctx.db
      .query('season_players')
      .withIndex('by_seasonId', (q) => q.eq('seasonId', args.seasonId))
      .collect();

    // Sort by totalPoints descending (1st place has highest points)
    const sortedPlayers = allPlayers.sort((a, b) => b.totalPoints - a.totalPoints);
    
    // Reverse order for selection: 4th → 3rd → 2nd → 1st
    const selectionOrder = [...sortedPlayers].reverse();

    // Get all option selections for this challenge selection
    const optionSelections = await ctx.db
      .query('challenge_option_selections')
      .withIndex('by_challengeSelectionId', (q) =>
        q.eq('challengeSelectionId', challengeSelection._id)
      )
      .collect();

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

    // Determine whose turn it is
    const selectionsCount = enrichedSelections.length;
    const totalPlayers = selectionOrder.length;
    let currentTurnPlayer = null;
    let isComplete = false;

    if (selectionsCount < totalPlayers) {
      // Next player in selection order
      currentTurnPlayer = selectionOrder[selectionsCount];
    } else {
      isComplete = true;
    }

    // Get selected options
    const selectedOptions = new Set(enrichedSelections.map((s) => s.selectedOption));
    const availableOptions = canonical.options.filter(
      (opt) => !selectedOptions.has(opt)
    );

    // Enrich selection order with user info
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

    return {
      challengeSelectionId: challengeSelection._id,
      options: canonical.options,
      selectionOrder: enrichedSelectionOrder,
      currentTurnPlayer: currentTurnPlayer
        ? {
            _id: currentTurnPlayer._id,
            labelName: currentTurnPlayer.labelName,
            displayName: (await ctx.db.get(currentTurnPlayer.userId))?.displayName || 'Unknown',
          }
        : null,
      selections: enrichedSelections,
      isComplete,
      availableOptions,
    };
  },
});

// Mutation: Select a challenge option
export const selectChallengeOption = mutation({
  args: {
    seasonId: v.id('seasons'),
    selectedOption: v.string(),
    requestingUserId: v.id('users'),
    seasonPlayerIdToSelectFor: v.optional(v.id('season_players')),
  },
  handler: async (ctx, args) => {
    const season = await ctx.db.get(args.seasonId);
    if (!season) {
      throw new Error('Season not found');
    }

    const weekNumber = season.currentWeek;

    // Get the challenge selection for this week
    const challengeSelection = await ctx.db
      .query('challenge_selections')
      .withIndex('by_seasonId_weekNumber', (q) =>
        q.eq('seasonId', args.seasonId).eq('weekNumber', weekNumber)
      )
      .first();

    if (!challengeSelection) {
      throw new Error('No challenge selected for this week');
    }

    // Get board challenge and canonical challenge
    const boardChallenge = await ctx.db.get(challengeSelection.boardChallengeId);
    if (!boardChallenge) {
      throw new Error('Board challenge not found');
    }

    const canonical = await ctx.db.get(boardChallenge.canonicalChallengeId);
    if (!canonical) {
      throw new Error('Canonical challenge not found');
    }

    // Validate challenge has options
    if (!canonical.options || canonical.options.length === 0) {
      throw new Error('This challenge does not have options');
    }

    // Validate selected option is valid
    if (!canonical.options.includes(args.selectedOption)) {
      throw new Error('Invalid option selected');
    }

    // Check if requester is commissioner
    const league = await ctx.db.get(season.leagueId);
    if (!league) {
      throw new Error('League not found');
    }
    const isCommissioner =
      league.commissionerId.toString() === args.requestingUserId.toString();

    // Determine which player to select for
    let playerToSelectFor;

    if (args.seasonPlayerIdToSelectFor) {
      // Commissioner is selecting for a specific player
      if (!isCommissioner) {
        throw new Error('Only commissioners can select options for other players');
      }
      playerToSelectFor = await ctx.db.get(args.seasonPlayerIdToSelectFor);
      if (!playerToSelectFor) {
        throw new Error('Player not found');
      }
    } else {
      // Regular player selecting their own
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
      playerToSelectFor = requestingPlayer;
    }

    // Check if player already selected an option
    const existingSelection = await ctx.db
      .query('challenge_option_selections')
      .withIndex('by_challengeSelectionId', (q) =>
        q.eq('challengeSelectionId', challengeSelection._id)
      )
      .collect()
      .then((selections) =>
        selections.find(
          (s) => s.seasonPlayerId.toString() === playerToSelectFor._id.toString()
        )
      );

    if (existingSelection) {
      throw new Error(
        isCommissioner
          ? 'This player has already selected an option'
          : 'You have already selected an option'
      );
    }

    // Check if option is already selected
    const optionAlreadySelected = await ctx.db
      .query('challenge_option_selections')
      .withIndex('by_challengeSelectionId', (q) =>
        q.eq('challengeSelectionId', challengeSelection._id)
      )
      .collect()
      .then((selections) =>
        selections.some((s) => s.selectedOption === args.selectedOption)
      );

    if (optionAlreadySelected) {
      throw new Error('This option has already been selected');
    }

    // Calculate selection order and validate it's the player's turn (unless commissioner)
    if (!isCommissioner) {
      const allPlayers = await ctx.db
        .query('season_players')
        .withIndex('by_seasonId', (q) => q.eq('seasonId', args.seasonId))
        .collect();

      const sortedPlayers = allPlayers.sort((a, b) => b.totalPoints - a.totalPoints);
      const selectionOrder = [...sortedPlayers].reverse();

      // Get current selections count
      const currentSelections = await ctx.db
        .query('challenge_option_selections')
        .withIndex('by_challengeSelectionId', (q) =>
          q.eq('challengeSelectionId', challengeSelection._id)
        )
        .collect();

      const selectionsCount = currentSelections.length;

      // Check if it's the player's turn
      if (selectionsCount < selectionOrder.length) {
        const expectedPlayer = selectionOrder[selectionsCount];
        if (expectedPlayer._id.toString() !== playerToSelectFor._id.toString()) {
          throw new Error('It is not your turn to select an option');
        }
      } else {
        throw new Error('All options have been selected');
      }
    }

    // Create the option selection
    const selectionId = await ctx.db.insert('challenge_option_selections', {
      challengeSelectionId: challengeSelection._id,
      seasonId: args.seasonId,
      weekNumber: weekNumber,
      seasonPlayerId: playerToSelectFor._id,
      selectedOption: args.selectedOption,
      createdAt: Date.now(),
    });

    // Log event
    await logEvent(
      ctx,
      args.seasonId,
      'CHALLENGE_OPTION_SELECTED',
      {
        week: weekNumber,
        player: playerToSelectFor.labelName,
        option: args.selectedOption,
        challenge: {
          title: canonical.title,
        },
        selectedByCommissioner: isCommissioner,
      },
      args.requestingUserId
    );

    return await ctx.db.get(selectionId);
  },
});

// Mutation: Advance to playlist submission phase (after option selection is complete)
export const advanceToSubmissionPhase = mutation({
  args: {
    seasonId: v.id('seasons'),
    requestingUserId: v.id('users'),
  },
  handler: async (ctx, args) => {
    const season = await ctx.db.get(args.seasonId);
    if (!season) {
      throw new Error('Season not found');
    }

    // Check if requester is commissioner
    const league = await ctx.db.get(season.leagueId);
    if (!league) {
      throw new Error('League not found');
    }
    const isCommissioner =
      league.commissionerId.toString() === args.requestingUserId.toString();

    if (!isCommissioner) {
      throw new Error('Only commissioners can advance phases');
    }

    // Validate we're in the right phase
    if (season.currentPhase !== 'IN_SEASON_CHALLENGE_SELECTION') {
      throw new Error('Not in challenge selection phase');
    }

    const weekNumber = season.currentWeek;

    // Get the challenge selection for this week
    const challengeSelection = await ctx.db
      .query('challenge_selections')
      .withIndex('by_seasonId_weekNumber', (q) =>
        q.eq('seasonId', args.seasonId).eq('weekNumber', weekNumber)
      )
      .first();

    if (!challengeSelection) {
      throw new Error('No challenge selected for this week');
    }

    // Get board challenge and canonical challenge
    const boardChallenge = await ctx.db.get(challengeSelection.boardChallengeId);
    if (!boardChallenge) {
      throw new Error('Board challenge not found');
    }

    const canonical = await ctx.db.get(boardChallenge.canonicalChallengeId);
    if (!canonical) {
      throw new Error('Canonical challenge not found');
    }

    // If challenge has options, verify all options are selected
    if (canonical.options && canonical.options.length > 0) {
      const allPlayers = await ctx.db
        .query('season_players')
        .withIndex('by_seasonId', (q) => q.eq('seasonId', args.seasonId))
        .collect();

      const optionSelections = await ctx.db
        .query('challenge_option_selections')
        .withIndex('by_challengeSelectionId', (q) =>
          q.eq('challengeSelectionId', challengeSelection._id)
        )
        .collect();

      // All players should have selected (4 players select from 5 options, leaving 1 unselected)
      if (optionSelections.length < allPlayers.length) {
        throw new Error(
          'Cannot advance: not all players have selected their options'
        );
      }
    }

    // Advance to PLAYLIST_SUBMISSION phase
    await ctx.db.patch(args.seasonId, {
      currentPhase: 'PLAYLIST_SUBMISSION',
    });

    // Log phase advancement
    await logEvent(
      ctx,
      args.seasonId,
      'PHASE_ADVANCED',
      {
        from: 'IN_SEASON_CHALLENGE_SELECTION',
        to: 'PLAYLIST_SUBMISSION',
        week: weekNumber,
      },
      args.requestingUserId
    );

    return { success: true };
  },
});
