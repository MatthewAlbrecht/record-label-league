import { mutation, query } from './_generated/server';
import { v } from 'convex/values';
import type { Id } from 'convex/_generated/dataModel';
import { logEvent } from './events';

// Query: Get all Tier 1 advantages for a season
export const getTier1Advantages = query({
  args: { seasonId: v.id('seasons') },
  handler: async (ctx, args) => {
    // Get the advantage board for this season
    const board = await ctx.db
      .query('advantage_boards')
      .withIndex('by_seasonId', (q) => q.eq('seasonId', args.seasonId))
      .first();

    if (!board) {
      return [];
    }

    // Find the Tier 1 category
    const tier1Category = board.categories.find(
      (cat) => cat.title === 'Tier 1'
    );
    if (!tier1Category) {
      return [];
    }

    // Get all board_advantages for the Tier 1 category
    const boardAdvantages = await ctx.db
      .query('board_advantages')
      .withIndex('by_boardId', (q) => q.eq('boardId', board._id))
      .collect();

    const tier1Advantages = boardAdvantages.filter(
      (ba) => ba.categoryId === tier1Category.id
    );

    // Get canonical advantage details for each one
    const advantagesWithDetails = await Promise.all(
      tier1Advantages.map(async (ba) => {
        const canonical = await ctx.db.get(ba.canonicalAdvantageId);
        return {
          _id: ba._id,
          canonicalAdvantageId: ba.canonicalAdvantageId,
          code: canonical?.code || '',
          name: canonical?.name || '',
          description: canonical?.description || '',
          order: ba.order,
        };
      })
    );

    return advantagesWithDetails.sort((a, b) => a.order - b.order);
  },
});

// Query: Get all advantages in a player's inventory
export const getPlayerInventory = query({
  args: { seasonPlayerId: v.id('season_players') },
  handler: async (ctx, args) => {
    const inventory = await ctx.db
      .query('player_inventory')
      .withIndex('by_seasonPlayerId', (q) =>
        q.eq('seasonPlayerId', args.seasonPlayerId)
      )
      .collect();

    // Get canonical advantage details for each one
    const inventoryWithDetails = await Promise.all(
      inventory.map(async (inv) => {
        const canonical = await ctx.db
          .query('canonical_advantages')
          .withIndex('by_code', (q) => q.eq('code', inv.advantageCode))
          .first();

        return {
          ...inv,
          name: canonical?.name || '',
          description: canonical?.description || '',
        };
      })
    );

    return inventoryWithDetails;
  },
});

// Query: Get the advantage selection state for a season
export const getAdvantageSelectionState = query({
  args: { seasonId: v.id('seasons') },
  handler: async (ctx, args) => {
    // Get season and verify it exists
    const season = await ctx.db.get(args.seasonId);
    if (!season) {
      throw new Error('Season not found');
    }

    // Get advantage selection config (or use defaults)
    const config = season.advantageSelectionConfig || {
      tier1Count: 2,
      tier2Count: 1,
      tier3Count: 0,
    };

    // Get draft state to determine player order
    const draftState = await ctx.db
      .query('draft_state')
      .withIndex('by_seasonId', (q) => q.eq('seasonId', args.seasonId))
      .first();

    // Get all season players with details
    const allSeasonPlayers = await ctx.db
      .query('season_players')
      .withIndex('by_seasonId', (q) => q.eq('seasonId', args.seasonId))
      .collect();

    const playersWithDetails = await Promise.all(
      allSeasonPlayers.map(async (sp) => {
        const user = await ctx.db.get(sp.userId);
        if (!user) {
          throw new Error(`User not found for season player ${sp._id}`);
        }
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

    // Order players by draft order (from draft_state) or by draftPosition (fallback)
    let orderedPlayers: any[];
    let draftOrder: Id<'season_players'>[] = [];

    if (
      draftState &&
      draftState.draftOrder &&
      draftState.draftOrder.length > 0
    ) {
      // Use draft state order if available
      draftOrder = draftState.draftOrder;
      orderedPlayers = draftState.draftOrder
        .map((playerId) => playersWithDetails.find((p) => p._id === playerId))
        .filter(Boolean) as any[];
    } else {
      // Fallback: order by draftPosition
      orderedPlayers = playersWithDetails
        .filter(
          (p) => p.draftPosition !== null && p.draftPosition !== undefined
        )
        .sort((a, b) => (a.draftPosition ?? 0) - (b.draftPosition ?? 0));
      draftOrder = orderedPlayers.map((p) => p._id);
    }

    // Helper function to get advantages for a tier
    const getAdvantagesForTier = async (tierNumber: number) => {
      const allBoardAdvantages = await ctx.db
        .query('board_advantages')
        .collect();

      // Get the advantage board for this season
      const board = await ctx.db
        .query('advantage_boards')
        .withIndex('by_seasonId', (q) => q.eq('seasonId', args.seasonId))
        .first();

      if (!board) return [];

      // Find the tier category
      const tierCategory = board.categories.find(
        (cat) => cat.title === `Tier ${tierNumber}`
      );
      if (!tierCategory) return [];

      // Filter for this board and tier category
      const tierBoardAdvantages = allBoardAdvantages.filter(
        (ba) => ba.boardId === board._id && ba.categoryId === tierCategory.id
      );

      // Get canonical details
      const withDetails = await Promise.all(
        tierBoardAdvantages.map(async (ba) => {
          const canonical = await ctx.db.get(ba.canonicalAdvantageId);
          return {
            _id: ba._id,
            code: canonical?.code || '',
            name: canonical?.name || '',
            description: canonical?.description || '',
            order: ba.order,
            tier: tierNumber,
          };
        })
      );

      return withDetails.sort((a, b) => a.order - b.order);
    };

    // Get advantages for each tier based on config
    const tier1Advantages = config.tier1Count > 0 ? await getAdvantagesForTier(1) : [];
    const tier2Advantages = config.tier2Count > 0 ? await getAdvantagesForTier(2) : [];
    const tier3Advantages = config.tier3Count > 0 ? await getAdvantagesForTier(3) : [];

    // Get assigned advantages for each player with tier information
    const playerAssignments = await Promise.all(
      orderedPlayers.map(async (player) => {
        const allInventory = await ctx.db
          .query('player_inventory')
          .withIndex('by_seasonPlayerId', (q) =>
            q.eq('seasonPlayerId', player._id)
          )
          .collect();

        // Filter for STARTING in JavaScript (Convex filter doesn't work for string equality)
        const startingInventory = allInventory.filter(
          (inv) => inv.earnedVia === 'STARTING'
        );

        // Get the advantage board to determine tiers
        const board = await ctx.db
          .query('advantage_boards')
          .withIndex('by_seasonId', (q) => q.eq('seasonId', args.seasonId))
          .first();

    // Get all board advantages to map codes to tiers
    const allBoardAdvantages = board
      ? await ctx.db
          .query('board_advantages')
          .withIndex('by_boardId', (q) => q.eq('boardId', board._id))
          .collect()
      : [];

    // Create a map of advantage code to tier (more efficient for lookups)
    const codeToTierMap = new Map<string, number>();
    if (board) {
      // Get all canonical advantages in parallel
      const canonicalPromises = allBoardAdvantages.map(ba => ctx.db.get(ba.canonicalAdvantageId));
      const canonicals = await Promise.all(canonicalPromises);
      
      for (let i = 0; i < allBoardAdvantages.length; i++) {
        const ba = allBoardAdvantages[i];
        const canonical = canonicals[i];
        if (canonical) {
          const category = board.categories.find((c) => c.id === ba.categoryId);
          if (category) {
            const tierMatch = category.title.match(/Tier (\d+)/);
            if (tierMatch) {
              codeToTierMap.set(canonical.code, parseInt(tierMatch[1]));
            }
          }
        }
      }
    }

        // Get the advantage details with tier information
        const assignedAdvantages = await Promise.all(
          startingInventory.map(async (inv) => {
            const canonical = await ctx.db
              .query('canonical_advantages')
              .withIndex('by_code', (q) => q.eq('code', inv.advantageCode))
              .first();

            const tier = codeToTierMap.get(inv.advantageCode) || 0;

            return {
              code: inv.advantageCode,
              name: canonical?.name || '',
              earnedVia: inv.earnedVia,
              tier,
            };
          })
        );

        // Count advantages by tier
        const tier1Count = assignedAdvantages.filter((a) => a.tier === 1).length;
        const tier2Count = assignedAdvantages.filter((a) => a.tier === 2).length;
        const tier3Count = assignedAdvantages.filter((a) => a.tier === 3).length;

        return {
          playerId: player._id,
          labelName: player.labelName,
          displayName: player.user.displayName,
          assignedAdvantages,
          tier1Count,
          tier2Count,
          tier3Count,
        };
      })
    );

    return {
      seasonId: args.seasonId,
      draftOrder: draftOrder,
      players: orderedPlayers,
      playerAssignments,
      tier1Advantages,
      tier2Advantages,
      tier3Advantages,
      config,
    };
  },
});

// Mutation: Reset all starting advantages for a season
export const resetAllStartingAdvantages = mutation({
  args: {
    seasonId: v.id('seasons'),
    requestingUserId: v.id('users'),
  },
  handler: async (ctx, args) => {
    // Get season to verify it exists
    const season = await ctx.db.get(args.seasonId);
    if (!season) {
      throw new Error('Season not found');
    }

    // Get league to verify requester is commissioner
    const league = await ctx.db.get(season.leagueId);
    if (!league) {
      throw new Error('League not found');
    }

    if (league.commissionerId.toString() !== args.requestingUserId.toString()) {
      throw new Error('Only commissioners can reset advantages');
    }

    // Get all season players
    const allSeasonPlayers = await ctx.db
      .query('season_players')
      .withIndex('by_seasonId', (q) => q.eq('seasonId', args.seasonId))
      .collect();

    // Get all starting advantages for all players in this season
    const allInventory = await ctx.db.query('player_inventory').collect();

    // Filter for starting advantages from this season's players
    const startingAdvantages = allInventory.filter((inv) => {
      const playerInSeason = allSeasonPlayers.some(
        (sp) => sp._id === inv.seasonPlayerId
      );
      return inv.earnedVia === 'STARTING' && playerInSeason;
    });

    // Delete all starting advantages
    for (const advantage of startingAdvantages) {
      await ctx.db.delete(advantage._id);
    }

    // Log the event
    await logEvent(ctx, args.seasonId, 'ADVANTAGES_RESET', {
      count: startingAdvantages.length,
      type: 'STARTING',
    });

    return {
      deletedCount: startingAdvantages.length,
    };
  },
});

// Mutation: Assign a starting advantage to a player
export const assignStartingAdvantage = mutation({
  args: {
    seasonPlayerId: v.id('season_players'),
    advantageCode: v.string(),
    requestingUserId: v.id('users'),
  },
  handler: async (ctx, args) => {
    // Get the season player
    const seasonPlayer = await ctx.db.get(args.seasonPlayerId);
    if (!seasonPlayer) {
      throw new Error('Season player not found');
    }

    // Get season to check commissioner and get seasonId for logging
    const season = await ctx.db.get(seasonPlayer.seasonId);
    if (!season) {
      throw new Error('Season not found');
    }

    // Get league to verify requester is commissioner
    const league = await ctx.db.get(season.leagueId);
    if (!league) {
      throw new Error('League not found');
    }

    if (league.commissionerId.toString() !== args.requestingUserId.toString()) {
      throw new Error('Only commissioners can assign advantages');
    }

    // Get advantage selection config
    const config = season.advantageSelectionConfig || {
      tier1Count: 2,
      tier2Count: 1,
      tier3Count: 0,
    };

    // Verify the advantage exists
    const advantage = await ctx.db
      .query('canonical_advantages')
      .withIndex('by_code', (q) => q.eq('code', args.advantageCode))
      .first();

    if (!advantage) {
      throw new Error('Advantage not found');
    }

    // Determine the tier of this advantage
    const board = await ctx.db
      .query('advantage_boards')
      .withIndex('by_seasonId', (q) => q.eq('seasonId', season._id))
      .first();

    if (!board) {
      throw new Error('Advantage board not found for this season');
    }

    // Find which category this advantage belongs to
    const allBoardAdvantages = await ctx.db
      .query('board_advantages')
      .withIndex('by_boardId', (q) => q.eq('boardId', board._id))
      .collect();

    const boardAdvantage = allBoardAdvantages.find(
      (ba) => ba.canonicalAdvantageId === advantage._id
    );

    if (!boardAdvantage) {
      throw new Error('Advantage not found on board');
    }

    const category = board.categories.find((c) => c.id === boardAdvantage.categoryId);
    if (!category) {
      throw new Error('Category not found');
    }

    const tierMatch = category.title.match(/Tier (\d+)/);
    if (!tierMatch) {
      throw new Error('Invalid tier category');
    }

    const tier = parseInt(tierMatch[1]);

    // Get existing starting advantages
    const allPlayerInventory = await ctx.db
      .query('player_inventory')
      .withIndex('by_seasonPlayerId', (q) =>
        q.eq('seasonPlayerId', args.seasonPlayerId)
      )
      .collect();

    const existingStartingAdvantages = allPlayerInventory.filter(
      (inv) => inv.earnedVia === 'STARTING'
    );

    // Check if player already has this exact advantage
    const alreadyHasThisAdvantage = existingStartingAdvantages.some(
      (inv) => inv.advantageCode === args.advantageCode
    );

    if (alreadyHasThisAdvantage) {
      throw new Error('Player already has this advantage');
    }

    // Create code-to-tier map for efficient lookups
    const codeToTierMap = new Map<string, number>();
    for (const ba of allBoardAdvantages) {
      const category = board.categories.find((c) => c.id === ba.categoryId);
      if (category) {
        const tierMatch = category.title.match(/Tier (\d+)/);
        if (tierMatch) {
          const canonical = await ctx.db.get(ba.canonicalAdvantageId);
          if (canonical) {
            codeToTierMap.set(canonical.code, parseInt(tierMatch[1]));
          }
        }
      }
    }

    // Count existing advantages by tier using the map
    const existingTierCounts = { 1: 0, 2: 0, 3: 0 };
    for (const inv of existingStartingAdvantages) {
      const existingTier = codeToTierMap.get(inv.advantageCode);
      if (existingTier) {
        existingTierCounts[existingTier as keyof typeof existingTierCounts]++;
      }
    }

    // Validate against config limits
    const tierLimit = tier === 1 ? config.tier1Count : tier === 2 ? config.tier2Count : config.tier3Count;
    const currentTierCount = existingTierCounts[tier as keyof typeof existingTierCounts];

    if (currentTierCount >= tierLimit) {
      throw new Error(`Player already has the maximum number of Tier ${tier} advantages (${tierLimit})`);
    }

    // Create new inventory entry
    const inventoryId = await ctx.db.insert('player_inventory', {
      seasonPlayerId: args.seasonPlayerId,
      advantageCode: args.advantageCode,
      status: 'AVAILABLE',
      earnedWeek: 0, // Week 0 for starting advantages
      earnedVia: 'STARTING',
      createdAt: Date.now(),
    });

    // Log the event
    await logEvent(
      ctx,
      season._id,
      'ADVANTAGE_ASSIGNED',
      {
        player: seasonPlayer.labelName,
        advantage: advantage.name,
        advantageCode: args.advantageCode,
        status: 'AVAILABLE',
        earnedVia: 'STARTING',
      },
      args.requestingUserId
    );

    return await ctx.db.get(inventoryId);
  },
});
