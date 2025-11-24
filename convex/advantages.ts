import { mutation, query } from './_generated/server';
import { v } from 'convex/values';
import type { Id } from 'convex/_generated/dataModel';

// Query: Get an advantage board with its advantages
export const getBoard = query({
  args: { seasonId: v.id('seasons') },
  handler: async (ctx, args) => {
    const board = await ctx.db
      .query('advantage_boards')
      .withIndex('by_seasonId', (q) => q.eq('seasonId', args.seasonId))
      .first();

    if (!board) return null;

    const boardAdvantages = await ctx.db
      .query('board_advantages')
      .withIndex('by_boardId', (q) => q.eq('boardId', board._id))
      .collect();

    const advantages = await Promise.all(
      boardAdvantages.map(async (ba) => {
        const canonical = await ctx.db.get(ba.canonicalAdvantageId);
        return {
          ...ba,
          canonical: canonical
            ? {
                code: canonical.code,
                name: canonical.name,
                description: canonical.description,
              }
            : null,
        };
      })
    );

    return {
      board,
      advantages: advantages.sort((a, b) => {
        // Sort by category, then by order within category
        const catComparison = a.categoryId.localeCompare(b.categoryId);
        if (catComparison !== 0) return catComparison;
        return a.order - b.order;
      }),
    };
  },
});

// Mutation: Create a new advantage board for a season
export const createBoard = mutation({
  args: { seasonId: v.id('seasons') },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('advantage_boards')
      .withIndex('by_seasonId', (q) => q.eq('seasonId', args.seasonId))
      .first();

    if (existing) {
      return existing;
    }

    // Initialize with tier categories
    const tier1Id = crypto.randomUUID();
    const tier2Id = crypto.randomUUID();
    const tier3Id = crypto.randomUUID();

    const boardId = await ctx.db.insert('advantage_boards', {
      seasonId: args.seasonId,
      categories: [
        { id: tier1Id, title: 'Tier 1' },
        { id: tier2Id, title: 'Tier 2' },
        { id: tier3Id, title: 'Tier 3' },
      ],
      createdAt: Date.now(),
    });

    return boardId;
  },
});

// Mutation: Add an advantage to a board
export const addAdvantage = mutation({
  args: {
    boardId: v.id('advantage_boards'),
    categoryId: v.string(),
    canonicalAdvantageId: v.id('canonical_advantages'),
  },
  handler: async (ctx, args) => {
    const board = await ctx.db.get(args.boardId);
    if (!board) throw new Error('Board not found');

    if (board.isLocked) throw new Error('Board is locked');

    const canonical = await ctx.db.get(args.canonicalAdvantageId);
    if (!canonical) throw new Error('Advantage not found');

    // Count existing advantages in this category
    const existing = await ctx.db
      .query('board_advantages')
      .withIndex('by_boardId', (q) => q.eq('boardId', args.boardId))
      .collect();

    const categoryCount = existing.filter(
      (a) => a.categoryId === args.categoryId
    ).length;

    const advantageId = await ctx.db.insert('board_advantages', {
      boardId: args.boardId,
      categoryId: args.categoryId,
      canonicalAdvantageId: args.canonicalAdvantageId,
      order: categoryCount,
      createdAt: Date.now(),
    });

    return advantageId;
  },
});

// Mutation: Remove an advantage from the board
export const removeAdvantage = mutation({
  args: { advantageId: v.id('board_advantages') },
  handler: async (ctx, args) => {
    const advantage = await ctx.db.get(args.advantageId);
    if (!advantage) throw new Error('Advantage not found');

    const board = await ctx.db.get(advantage.boardId);
    if (!board) throw new Error('Board not found');

    if (board.isLocked) throw new Error('Board is locked');

    // Reorder remaining advantages in the same category
    const remaining = await ctx.db
      .query('board_advantages')
      .withIndex('by_boardId', (q) => q.eq('boardId', advantage.boardId))
      .collect();

    const sameCategoryItems = remaining
      .filter(
        (a) =>
          a.categoryId === advantage.categoryId && a._id !== args.advantageId
      )
      .sort((a, b) => a.order - b.order);

    for (let i = 0; i < sameCategoryItems.length; i++) {
      await ctx.db.patch(sameCategoryItems[i]._id, { order: i });
    }

    await ctx.db.delete(args.advantageId);
  },
});

// Mutation: Reorder advantages within a category
export const reorderAdvantages = mutation({
  args: {
    categoryId: v.string(),
    advantageIds: v.array(v.id('board_advantages')),
  },
  handler: async (ctx, args) => {
    // Verify all advantages belong to the same category
    const advantages = await Promise.all(
      args.advantageIds.map((id) => ctx.db.get(id))
    );

    for (const advantage of advantages) {
      if (!advantage) throw new Error('Advantage not found');
      if (advantage.categoryId !== args.categoryId) {
        throw new Error('All advantages must belong to the same category');
      }

      const board = await ctx.db.get(advantage.boardId);
      if (!board) throw new Error('Board not found');
      if (board.isLocked) throw new Error('Board is locked');
    }

    // Update order for each advantage
    for (let i = 0; i < args.advantageIds.length; i++) {
      await ctx.db.patch(args.advantageIds[i], { order: i });
    }
  },
});

// Mutation: Lock the advantage board
export const lockBoard = mutation({
  args: { boardId: v.id('advantage_boards') },
  handler: async (ctx, args) => {
    const board = await ctx.db.get(args.boardId);
    if (!board) throw new Error('Board not found');

    if (board.isLocked) throw new Error('Board is already locked');

    await ctx.db.patch(args.boardId, {
      isLocked: true,
      lockedAt: Date.now(),
    });
  },
});

// Mutation: Unlock the advantage board
export const unlockBoard = mutation({
  args: { boardId: v.id('advantage_boards') },
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

// Mutation: Duplicate an advantage board from another season in the same league
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
      throw new Error('Only the commissioner can duplicate the advantage board');
    }

    const sourceBoard = await ctx.db
      .query('advantage_boards')
      .withIndex('by_seasonId', (q) => q.eq('seasonId', args.sourceSeasonId))
      .first();

    if (!sourceBoard) {
      throw new Error('Source season has no advantage board to duplicate');
    }

    const sourceItems = await ctx.db
      .query('board_advantages')
      .withIndex('by_boardId', (q) => q.eq('boardId', sourceBoard._id))
      .collect();

    let targetBoard = await ctx.db
      .query('advantage_boards')
      .withIndex('by_seasonId', (q) => q.eq('seasonId', args.targetSeasonId))
      .first();

    if (!targetBoard) {
      const boardId = await ctx.db.insert('advantage_boards', {
        seasonId: args.targetSeasonId,
        categories: [],
        createdAt: Date.now(),
      });
      targetBoard = await ctx.db.get(boardId);
    }

    // Delete existing advantages on the target board
    const existingItems = await ctx.db
      .query('board_advantages')
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

    // Recreate board advantages on the target board
    for (const item of sourceItems) {
      await ctx.db.insert('board_advantages', {
        boardId: targetBoard._id,
        categoryId: item.categoryId,
        canonicalAdvantageId: item.canonicalAdvantageId as Id<'canonical_advantages'>,
        order: item.order,
        createdAt: Date.now(),
      });
    }

    return { success: true };
  },
});

