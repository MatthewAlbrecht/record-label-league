import { mutation, query } from './_generated/server';
import { v } from 'convex/values';
import { logEvent } from './events';

// Default roster evolution settings (8-week cycle)
function getDefaultRosterEvolutionSettings(totalWeeks: number = 8) {
  // Default: Weeks 4 and 8 are Chaos, all others are Growth
  const weekTypes = Array.from({ length: totalWeeks }, (_, i) => ({
    weekNumber: i + 1,
    type: ((i + 1) % 4 === 0 ? 'CHAOS' : 'GROWTH') as 'GROWTH' | 'CHAOS' | 'SKIP',
  }));

  return {
    weekTypes,
    growthWeek: {
      selfCutCount: 1,
      redraftCount: 1,
    },
    poolDraftWeeks: [2, 6], // Default: Week 2 and 6 include Pool Draft
    poolDraftCount: 1,
    chaosWeek: {
      baseProtectionCount: 3,
      firstPlaceProtectionReduction: 1, // 1st place protects 3-1=2
      opponentCutsPerPlayer: 1, // Cut 1 from each opponent
      redraftTargetRosterSize: 8, // Refill to baseline
      includesPoolDraft: true,
      poolDraftCount: 1,
      banishOldPool: true,
    },
    chaosAdvantageDraft: {
      enabled: true,
      advantageCount: 5, // One more than player count
      tier: 3 as const,
    },
  };
}

// Query: Get roster evolution settings for a season
export const getRosterEvolutionSettings = query({
  args: { seasonId: v.id('seasons') },
  handler: async (ctx, args) => {
    const settings = await ctx.db
      .query('roster_evolution_settings')
      .withIndex('by_seasonId', (q) => q.eq('seasonId', args.seasonId))
      .first();

    if (!settings) {
      // Return defaults
      const defaults = getDefaultRosterEvolutionSettings();
      return {
        seasonId: args.seasonId,
        ...defaults,
        isDefault: true,
      };
    }

    return { ...settings, isDefault: false };
  },
});

// Query: Get the week type for a specific week
export const getWeekType = query({
  args: {
    seasonId: v.id('seasons'),
    weekNumber: v.number(),
  },
  handler: async (ctx, args) => {
    const settings = await ctx.db
      .query('roster_evolution_settings')
      .withIndex('by_seasonId', (q) => q.eq('seasonId', args.seasonId))
      .first();

    if (!settings) {
      // Use defaults
      const defaults = getDefaultRosterEvolutionSettings();
      const weekType = defaults.weekTypes.find((w) => w.weekNumber === args.weekNumber);
      return weekType?.type ?? 'GROWTH';
    }

    const weekType = settings.weekTypes.find((w) => w.weekNumber === args.weekNumber);
    return weekType?.type ?? 'GROWTH';
  },
});

// Query: Get Growth Week configuration
export const getGrowthWeekConfig = query({
  args: { seasonId: v.id('seasons') },
  handler: async (ctx, args) => {
    const settings = await ctx.db
      .query('roster_evolution_settings')
      .withIndex('by_seasonId', (q) => q.eq('seasonId', args.seasonId))
      .first();

    if (!settings) {
      const defaults = getDefaultRosterEvolutionSettings();
      return defaults.growthWeek;
    }

    return settings.growthWeek;
  },
});

// Query: Get Chaos Week configuration
export const getChaosWeekConfig = query({
  args: { seasonId: v.id('seasons') },
  handler: async (ctx, args) => {
    const settings = await ctx.db
      .query('roster_evolution_settings')
      .withIndex('by_seasonId', (q) => q.eq('seasonId', args.seasonId))
      .first();

    if (!settings) {
      const defaults = getDefaultRosterEvolutionSettings();
      return defaults.chaosWeek;
    }

    return settings.chaosWeek;
  },
});

// Query: Check if a week includes Pool Draft
export const isPoolDraftWeek = query({
  args: {
    seasonId: v.id('seasons'),
    weekNumber: v.number(),
  },
  handler: async (ctx, args) => {
    const settings = await ctx.db
      .query('roster_evolution_settings')
      .withIndex('by_seasonId', (q) => q.eq('seasonId', args.seasonId))
      .first();

    if (!settings) {
      const defaults = getDefaultRosterEvolutionSettings();
      return defaults.poolDraftWeeks.includes(args.weekNumber);
    }

    // Check if it's a Chaos Week with Pool Draft
    const weekType = settings.weekTypes.find((w) => w.weekNumber === args.weekNumber);
    if (weekType?.type === 'CHAOS' && settings.chaosWeek.includesPoolDraft) {
      return true;
    }

    // Check if it's in the regular Pool Draft weeks
    return settings.poolDraftWeeks.includes(args.weekNumber);
  },
});

// Mutation: Save roster evolution settings
export const saveRosterEvolutionSettings = mutation({
  args: {
    seasonId: v.id('seasons'),
    weekTypes: v.array(
      v.object({
        weekNumber: v.number(),
        type: v.union(v.literal('GROWTH'), v.literal('CHAOS'), v.literal('SKIP')),
      })
    ),
    growthWeek: v.object({
      selfCutCount: v.number(),
      redraftCount: v.number(),
    }),
    poolDraftWeeks: v.array(v.number()),
    poolDraftCount: v.number(),
    chaosWeek: v.object({
      baseProtectionCount: v.number(),
      firstPlaceProtectionReduction: v.number(),
      opponentCutsPerPlayer: v.number(),
      redraftTargetRosterSize: v.number(),
      includesPoolDraft: v.boolean(),
      poolDraftCount: v.number(),
      banishOldPool: v.boolean(),
    }),
    chaosAdvantageDraft: v.object({
      enabled: v.boolean(),
      advantageCount: v.number(),
      tier: v.union(v.literal(1), v.literal(2), v.literal(3)),
    }),
    requestingUserId: v.id('users'),
  },
  handler: async (ctx, args) => {
    const season = await ctx.db.get(args.seasonId);
    if (!season) throw new Error('Season not found');

    // Check if requester is commissioner
    const league = await ctx.db.get(season.leagueId);
    if (!league) throw new Error('League not found');
    if (league.commissionerId.toString() !== args.requestingUserId.toString()) {
      throw new Error('Only commissioners can update roster evolution settings');
    }

    // Validate settings
    // 1. At least 1 Chaos Week if banishment is enabled
    const chaosWeeks = args.weekTypes.filter((w) => w.type === 'CHAOS');
    if (args.chaosWeek.banishOldPool && chaosWeeks.length === 0) {
      throw new Error('At least one Chaos Week is required if banishment is enabled');
    }

    // 2. Protection count should be reasonable
    if (args.chaosWeek.baseProtectionCount < 0) {
      throw new Error('Base protection count cannot be negative');
    }

    // 3. Cuts and redrafts should be non-negative
    if (args.growthWeek.selfCutCount < 0 || args.growthWeek.redraftCount < 0) {
      throw new Error('Cut and redraft counts cannot be negative');
    }

    // Check for existing settings
    const existing = await ctx.db
      .query('roster_evolution_settings')
      .withIndex('by_seasonId', (q) => q.eq('seasonId', args.seasonId))
      .first();

    const now = Date.now();

    if (existing) {
      await ctx.db.patch(existing._id, {
        weekTypes: args.weekTypes,
        growthWeek: args.growthWeek,
        poolDraftWeeks: args.poolDraftWeeks,
        poolDraftCount: args.poolDraftCount,
        chaosWeek: args.chaosWeek,
        chaosAdvantageDraft: args.chaosAdvantageDraft,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert('roster_evolution_settings', {
        seasonId: args.seasonId,
        weekTypes: args.weekTypes,
        growthWeek: args.growthWeek,
        poolDraftWeeks: args.poolDraftWeeks,
        poolDraftCount: args.poolDraftCount,
        chaosWeek: args.chaosWeek,
        chaosAdvantageDraft: args.chaosAdvantageDraft,
        createdAt: now,
        updatedAt: now,
      });
    }

    // Log event
    await logEvent(
      ctx,
      args.seasonId,
      'ROSTER_EVOLUTION_SETTINGS_UPDATED',
      {
        weekTypes: args.weekTypes,
        growthWeek: args.growthWeek,
        poolDraftWeeks: args.poolDraftWeeks,
        poolDraftCount: args.poolDraftCount,
        chaosWeek: args.chaosWeek,
        chaosAdvantageDraft: args.chaosAdvantageDraft,
      },
      args.requestingUserId
    );

    return { success: true };
  },
});

// Mutation: Reset to default settings
export const resetToDefaults = mutation({
  args: {
    seasonId: v.id('seasons'),
    requestingUserId: v.id('users'),
    totalWeeks: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const season = await ctx.db.get(args.seasonId);
    if (!season) throw new Error('Season not found');

    // Check if requester is commissioner
    const league = await ctx.db.get(season.leagueId);
    if (!league) throw new Error('League not found');
    if (league.commissionerId.toString() !== args.requestingUserId.toString()) {
      throw new Error('Only commissioners can reset roster evolution settings');
    }

    // Get defaults
    const defaults = getDefaultRosterEvolutionSettings(args.totalWeeks ?? 8);

    // Check for existing settings
    const existing = await ctx.db
      .query('roster_evolution_settings')
      .withIndex('by_seasonId', (q) => q.eq('seasonId', args.seasonId))
      .first();

    const now = Date.now();

    if (existing) {
      await ctx.db.patch(existing._id, {
        weekTypes: defaults.weekTypes,
        growthWeek: defaults.growthWeek,
        poolDraftWeeks: defaults.poolDraftWeeks,
        poolDraftCount: defaults.poolDraftCount,
        chaosWeek: defaults.chaosWeek,
        chaosAdvantageDraft: defaults.chaosAdvantageDraft,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert('roster_evolution_settings', {
        seasonId: args.seasonId,
        weekTypes: defaults.weekTypes,
        growthWeek: defaults.growthWeek,
        poolDraftWeeks: defaults.poolDraftWeeks,
        poolDraftCount: defaults.poolDraftCount,
        chaosWeek: defaults.chaosWeek,
        chaosAdvantageDraft: defaults.chaosAdvantageDraft,
        createdAt: now,
        updatedAt: now,
      });
    }

    // Log event
    await logEvent(
      ctx,
      args.seasonId,
      'ROSTER_EVOLUTION_SETTINGS_RESET',
      { totalWeeks: args.totalWeeks ?? 8 },
      args.requestingUserId
    );

    return { success: true };
  },
});

