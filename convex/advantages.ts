import { mutation, query } from './_generated/server';
import { v } from 'convex/values';
import type { Id } from './_generated/dataModel';
import { logEvent } from './events';

// Default advantage distribution settings
const DEFAULT_PLACEMENT_REWARDS = [
  { placement: 2 as const, tier: 1 as const, count: 1 },
  { placement: 3 as const, tier: 2 as const, count: 1 },
];

const DEFAULT_SWEEP_REWARDS = [
  { categoryPointValue: 1 as const, tier: 1 as const, count: 1 },
  { categoryPointValue: 2 as const, tier: 2 as const, count: 1 },
  { categoryPointValue: 3 as const, tier: 3 as const, count: 1 },
];

const DEFAULT_COOLDOWN_BY_TIER = [
  { tier: 1 as const, weeksDelay: 0 },
  { tier: 2 as const, weeksDelay: 1 },
  { tier: 3 as const, weeksDelay: 1 },
];

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

// ============================================
// ADVANTAGE DISTRIBUTION SETTINGS
// ============================================

// Query: Get advantage distribution settings for a season
export const getAdvantageDistributionSettings = query({
  args: { seasonId: v.id('seasons') },
  handler: async (ctx, args) => {
    const settings = await ctx.db
      .query('advantage_distribution_settings')
      .withIndex('by_seasonId', (q) => q.eq('seasonId', args.seasonId))
      .first();

    if (!settings) {
      // Return defaults
      return {
        seasonId: args.seasonId,
        placementRewards: DEFAULT_PLACEMENT_REWARDS,
        sweepRewards: DEFAULT_SWEEP_REWARDS,
        sweepsStack: false,
        maxSweepAdvantagesPerWeek: undefined,
        cooldownByTier: DEFAULT_COOLDOWN_BY_TIER,
        isDefault: true,
      };
    }

    return { ...settings, isDefault: false };
  },
});

// Mutation: Save advantage distribution settings
export const saveAdvantageDistributionSettings = mutation({
  args: {
    seasonId: v.id('seasons'),
    placementRewards: v.array(
      v.object({
        placement: v.union(v.literal(1), v.literal(2), v.literal(3), v.literal(4)),
        tier: v.union(v.literal(1), v.literal(2), v.literal(3)),
        count: v.number(),
      })
    ),
    sweepRewards: v.array(
      v.object({
        categoryPointValue: v.union(v.literal(1), v.literal(2), v.literal(3)),
        tier: v.union(v.literal(1), v.literal(2), v.literal(3)),
        count: v.number(),
      })
    ),
    sweepsStack: v.boolean(),
    maxSweepAdvantagesPerWeek: v.optional(v.number()),
    cooldownByTier: v.array(
      v.object({
        tier: v.union(v.literal(1), v.literal(2), v.literal(3)),
        weeksDelay: v.number(),
      })
    ),
    requestingUserId: v.id('users'),
  },
  handler: async (ctx, args) => {
    const season = await ctx.db.get(args.seasonId);
    if (!season) throw new Error('Season not found');

    // Check if requester is commissioner
    const league = await ctx.db.get(season.leagueId);
    if (!league) throw new Error('League not found');
    if (league.commissionerId.toString() !== args.requestingUserId.toString()) {
      throw new Error('Only commissioners can update advantage distribution settings');
    }

    // Check for existing settings
    const existing = await ctx.db
      .query('advantage_distribution_settings')
      .withIndex('by_seasonId', (q) => q.eq('seasonId', args.seasonId))
      .first();

    const now = Date.now();

    if (existing) {
      await ctx.db.patch(existing._id, {
        placementRewards: args.placementRewards,
        sweepRewards: args.sweepRewards,
        sweepsStack: args.sweepsStack,
        maxSweepAdvantagesPerWeek: args.maxSweepAdvantagesPerWeek,
        cooldownByTier: args.cooldownByTier,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert('advantage_distribution_settings', {
        seasonId: args.seasonId,
        placementRewards: args.placementRewards,
        sweepRewards: args.sweepRewards,
        sweepsStack: args.sweepsStack,
        maxSweepAdvantagesPerWeek: args.maxSweepAdvantagesPerWeek,
        cooldownByTier: args.cooldownByTier,
        createdAt: now,
        updatedAt: now,
      });
    }

    // Log event
    await logEvent(
      ctx,
      args.seasonId,
      'ADVANTAGE_SETTINGS_UPDATED',
      {
        placementRewards: args.placementRewards,
        sweepRewards: args.sweepRewards,
        sweepsStack: args.sweepsStack,
        maxSweepAdvantagesPerWeek: args.maxSweepAdvantagesPerWeek,
        cooldownByTier: args.cooldownByTier,
      },
      args.requestingUserId
    );

    return { success: true };
  },
});

// ============================================
// ADVANTAGE AWARDING
// ============================================

// Helper: Get cooldown for a tier
function getCooldownForTier(
  cooldownByTier: { tier: 1 | 2 | 3; weeksDelay: number }[],
  tier: 1 | 2 | 3
): number {
  const config = cooldownByTier.find((c) => c.tier === tier);
  return config?.weeksDelay ?? (tier === 1 ? 0 : 1); // Default: T1=0, T2/T3=1
}

// Helper: Get a random advantage code for a tier from the season's advantage board
async function getRandomAdvantageForTier(
  ctx: any,
  seasonId: Id<'seasons'>,
  tier: 1 | 2 | 3
): Promise<string | null> {
  // Get the advantage board for this season
  const board = await ctx.db
    .query('advantage_boards')
    .withIndex('by_seasonId', (q: any) => q.eq('seasonId', seasonId))
    .first();

  if (!board) return null;

  // Find the category that matches this tier
  const tierCategory = board.categories.find(
    (c: { id: string; title: string }) =>
      c.title.toLowerCase().includes(`tier ${tier}`) ||
      c.title.toLowerCase() === `tier${tier}` ||
      c.title === `Tier ${tier}`
  );

  if (!tierCategory) return null;

  // Get all advantages in this category
  const boardAdvantages = await ctx.db
    .query('board_advantages')
    .withIndex('by_boardId', (q: any) => q.eq('boardId', board._id))
    .collect();

  const tierAdvantages = boardAdvantages.filter(
    (a: any) => a.categoryId === tierCategory.id
  );

  if (tierAdvantages.length === 0) return null;

  // Pick a random one
  const randomIndex = Math.floor(Math.random() * tierAdvantages.length);
  const selectedBoardAdvantage = tierAdvantages[randomIndex];

  // Get the canonical advantage to get its code
  const canonical = await ctx.db.get(selectedBoardAdvantage.canonicalAdvantageId);
  return canonical?.code ?? null;
}

// Internal helper: Award advantages (can be called from other modules)
export async function awardAdvantagesInternal(
  ctx: any,
  seasonId: Id<'seasons'>,
  weekNumber: number,
  requestingUserId?: Id<'users'>
) {
  const season = await ctx.db.get(seasonId);
  if (!season) throw new Error('Season not found');

  // Get distribution settings (or defaults)
  const settingsDoc = await ctx.db
    .query('advantage_distribution_settings')
    .withIndex('by_seasonId', (q: any) => q.eq('seasonId', seasonId))
    .first();

  const settings = settingsDoc ?? {
    placementRewards: DEFAULT_PLACEMENT_REWARDS,
    sweepRewards: DEFAULT_SWEEP_REWARDS,
    sweepsStack: false,
    maxSweepAdvantagesPerWeek: undefined,
    cooldownByTier: DEFAULT_COOLDOWN_BY_TIER,
  };

  // Get weekly results
  const weeklyResults = await ctx.db
    .query('weekly_results')
    .withIndex('by_seasonId_weekNumber', (q: any) =>
      q.eq('seasonId', seasonId).eq('weekNumber', weekNumber)
    )
    .collect();

  if (weeklyResults.length === 0) {
    // No results yet - skip advantage awarding
    return { skipped: true, reason: 'No weekly results found' };
  }

  // Get voting session for sweep detection
  const votingSession = await ctx.db
    .query('voting_sessions')
    .withIndex('by_seasonId_weekNumber', (q: any) =>
      q.eq('seasonId', seasonId).eq('weekNumber', weekNumber)
    )
    .first();

  if (!votingSession) {
    return { skipped: true, reason: 'No voting session found' };
  }

  // Get all votes for sweep detection
  const allVotes = await ctx.db
    .query('votes')
    .withIndex('by_sessionId', (q: any) => q.eq('sessionId', votingSession._id))
    .collect();

  // Get season players
  const seasonPlayers = await ctx.db
    .query('season_players')
    .withIndex('by_seasonId', (q: any) => q.eq('seasonId', seasonId))
    .collect();

  const totalPlayers = seasonPlayers.length;

  // Check if advantages already awarded for this week
  const existingAwards = await ctx.db
    .query('advantage_awards')
    .withIndex('by_seasonId_weekNumber', (q: any) =>
      q.eq('seasonId', seasonId).eq('weekNumber', weekNumber)
    )
    .collect();

  if (existingAwards.length > 0) {
    return { alreadyAwarded: true, awards: existingAwards };
  }

  const awards: {
    seasonPlayerId: Id<'season_players'>;
    tier: 1 | 2 | 3;
    awardedVia: 'PLACEMENT' | 'SWEEP';
    placementRank?: number;
    sweepCategoryId?: string;
  }[] = [];

  // ============================================
  // 1. DETECT SWEEPS
  // ============================================
  const sweepsByPlayer: Map<string, { categoryId: string; pointValue: 1 | 2 | 3 }[]> = new Map();

  for (const category of votingSession.categories) {
    const categoryVotes = allVotes.filter((v: any) => v.categoryId === category.id);
    
    // A sweep is when one player gets all votes in a category
    // Since players can't vote for themselves, a sweep means getting all (totalPlayers - 1) votes
    if (categoryVotes.length === totalPlayers) {
      // Count votes per nominated player
      const votesByNominee: Map<string, number> = new Map();
      for (const vote of categoryVotes) {
        const nomineeId = vote.nominatedPlayerId.toString();
        votesByNominee.set(nomineeId, (votesByNominee.get(nomineeId) || 0) + 1);
      }

      // Check if any player got all votes (totalPlayers - 1, since they can't vote for themselves)
      const votesNeededForSweep = totalPlayers - 1;
      for (const [nomineeId, voteCount] of votesByNominee.entries()) {
        if (voteCount === votesNeededForSweep) {
          // This is a sweep!
          const existing = sweepsByPlayer.get(nomineeId) || [];
          existing.push({ categoryId: category.id, pointValue: category.pointValue });
          sweepsByPlayer.set(nomineeId, existing);

          // Log sweep detected
          const player = seasonPlayers.find((p: any) => p._id.toString() === nomineeId);
          await logEvent(
            ctx,
            seasonId,
            'SWEEP_DETECTED',
            {
              week: weekNumber,
              player: player?.labelName || 'Unknown',
              category: category.title,
              pointValue: category.pointValue,
            },
            undefined
          );
        }
      }
    }
  }

  // ============================================
  // 2. AWARD SWEEP ADVANTAGES
  // ============================================
  for (const [playerIdStr, sweeps] of sweepsByPlayer.entries()) {
    const playerId = playerIdStr as Id<'season_players'>;
    let sweepAwardsForPlayer = 0;

    for (const sweep of sweeps) {
      // Check stacking rules
      if (!settings.sweepsStack && sweepAwardsForPlayer >= 1) {
        break;
      }
      if (
        settings.maxSweepAdvantagesPerWeek !== undefined &&
        sweepAwardsForPlayer >= settings.maxSweepAdvantagesPerWeek
      ) {
        break;
      }

      // Find the sweep reward config for this category point value
      const sweepReward = settings.sweepRewards.find(
        (r: any) => r.categoryPointValue === sweep.pointValue
      );

      if (sweepReward) {
        for (let i = 0; i < sweepReward.count; i++) {
          if (
            settings.maxSweepAdvantagesPerWeek !== undefined &&
            sweepAwardsForPlayer >= settings.maxSweepAdvantagesPerWeek
          ) {
            break;
          }

          // Create award slot (no random assignment - will be selected later)
          awards.push({
            seasonPlayerId: playerId,
            tier: sweepReward.tier,
            awardedVia: 'SWEEP',
            sweepCategoryId: sweep.categoryId,
          });
          sweepAwardsForPlayer++;
        }
      }
    }
  }

  // ============================================
  // 3. AWARD PLACEMENT ADVANTAGES
  // ============================================
  for (const result of weeklyResults) {
    const placementRewards = settings.placementRewards.filter(
      (r: any) => r.placement === result.placement
    );

    for (const reward of placementRewards) {
      for (let i = 0; i < reward.count; i++) {
        // Create award slot (no random assignment - will be selected later)
        awards.push({
          seasonPlayerId: result.seasonPlayerId,
          tier: reward.tier,
          awardedVia: 'PLACEMENT',
          placementRank: result.placement,
        });
      }
    }
  }

  // ============================================
  // 4. CREATE RECORDS
  // ============================================
  const now = Date.now();
  const createdAwards: any[] = [];

  for (const award of awards) {
    const cooldownWeeks = getCooldownForTier(
      settings.cooldownByTier as { tier: 1 | 2 | 3; weeksDelay: number }[],
      award.tier
    );
    const canUseAfterWeek = weekNumber + cooldownWeeks;

    // Create advantage_awards record (with placeholder code - will be updated when selected)
    const awardId = await ctx.db.insert('advantage_awards', {
      seasonId,
      weekNumber,
      seasonPlayerId: award.seasonPlayerId,
      advantageCode: `Tier ${award.tier} Selection`, // Placeholder - will be updated when advantage is selected
      tier: award.tier,
      awardedVia: award.awardedVia,
      placementRank: award.placementRank,
      sweepCategoryId: award.sweepCategoryId,
      earnedWeek: weekNumber,
      canUseAfterWeek,
      createdAt: now,
    });

    // Don't create player_inventory record yet - will be created when advantage is selected

    // Log advantage slot created event
    const player = seasonPlayers.find(
      (p: any) => p._id.toString() === award.seasonPlayerId.toString()
    );
    await logEvent(
      ctx,
      seasonId,
      'ADVANTAGE_SLOT_CREATED',
      {
        week: weekNumber,
        player: player?.labelName || 'Unknown',
        tier: award.tier,
        awardedVia: award.awardedVia,
        placementRank: award.placementRank,
      },
      requestingUserId
    );

    createdAwards.push({ ...award, _id: awardId, canUseAfterWeek });
  }

  return { success: true, awards: createdAwards };
}

// Mutation: Award advantages based on weekly results
export const awardAdvantages = mutation({
  args: {
    seasonId: v.id('seasons'),
    weekNumber: v.number(),
    requestingUserId: v.optional(v.id('users')), // Optional for system calls
  },
  handler: async (ctx, args) => {
    return await awardAdvantagesInternal(
      ctx,
      args.seasonId,
      args.weekNumber,
      args.requestingUserId
    );
  },
});

// Query: Get advantages awarded for a specific week
export const getWeekAdvantages = query({
  args: {
    seasonId: v.id('seasons'),
    weekNumber: v.number(),
  },
  handler: async (ctx, args) => {
    const awards = await ctx.db
      .query('advantage_awards')
      .withIndex('by_seasonId_weekNumber', (q) =>
        q.eq('seasonId', args.seasonId).eq('weekNumber', args.weekNumber)
      )
      .collect();

    // Enrich with player names and advantage details
    const enrichedAwards = await Promise.all(
      awards.map(async (award) => {
        const seasonPlayer = await ctx.db.get(award.seasonPlayerId);
        
        // Check if this is a pending selection placeholder (handle both old and new formats)
        const isPendingSelection = 
          award.advantageCode === 'PENDING_SELECTION' ||
          (award.advantageCode.startsWith('Tier ') && award.advantageCode.endsWith(' Selection'));
        
        let advantageName: string;
        let advantageDescription: string;
        
        if (isPendingSelection) {
          // Format as "Tier X Selection" (use tier from award if old format)
          if (award.advantageCode === 'PENDING_SELECTION') {
            advantageName = `Tier ${award.tier} Selection`;
          } else {
            advantageName = award.advantageCode;
          }
          advantageDescription = '';
        } else {
          // Look up the actual advantage
          const canonicalAdvantage = await ctx.db
            .query('canonical_advantages')
            .withIndex('by_code', (q) => q.eq('code', award.advantageCode))
            .first();
          
          advantageName = canonicalAdvantage?.name || award.advantageCode;
          advantageDescription = canonicalAdvantage?.description || '';
        }

        return {
          ...award,
          playerName: seasonPlayer?.labelName || 'Unknown',
          advantageName,
          advantageDescription,
        };
      })
    );

    return enrichedAwards;
  },
});

// Query: Get player inventory with advantage details
export const getPlayerInventory = query({
  args: { seasonPlayerId: v.id('season_players') },
  handler: async (ctx, args) => {
    const inventory = await ctx.db
      .query('player_inventory')
      .withIndex('by_seasonPlayerId', (q) => q.eq('seasonPlayerId', args.seasonPlayerId))
      .collect();

    // Enrich with advantage details
    const enrichedInventory = await Promise.all(
      inventory.map(async (item) => {
        const canonicalAdvantage = await ctx.db
          .query('canonical_advantages')
          .withIndex('by_code', (q) => q.eq('code', item.advantageCode))
          .first();

        return {
          ...item,
          advantageName: canonicalAdvantage?.name || item.advantageCode,
          advantageDescription: canonicalAdvantage?.description || '',
        };
      })
    );

    return enrichedInventory;
  },
});

