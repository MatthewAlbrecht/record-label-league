import { mutation, query } from './_generated/server';
import { v } from 'convex/values';
import { logEvent } from './events';

/**
 * Get all available pool artists for a season
 */
export const getPoolArtists = query({
  args: {
    seasonId: v.id('seasons'),
  },
  handler: async (ctx, args) => {
    const poolEntries = await ctx.db
      .query('pool_entries')
      .withIndex('by_seasonId_status', (q) =>
        q.eq('seasonId', args.seasonId).eq('status', 'AVAILABLE')
      )
      .collect();

    // Enrich with artist details and player names
    const enrichedEntries = await Promise.all(
      poolEntries.map(async (entry) => {
        const artist = await ctx.db.get(entry.artistId);
        const cutByPlayer = entry.cutByPlayerId
          ? await ctx.db.get(entry.cutByPlayerId)
          : null;
        const cutFromPlayer = entry.cutFromPlayerId
          ? await ctx.db.get(entry.cutFromPlayerId)
          : null;

        return {
          ...entry,
          artist: artist
            ? { _id: artist._id, name: artist.name }
            : null,
          cutByPlayer: cutByPlayer
            ? { _id: cutByPlayer._id, labelName: cutByPlayer.labelName }
            : null,
          cutFromPlayer: cutFromPlayer
            ? { _id: cutFromPlayer._id, labelName: cutFromPlayer.labelName }
            : null,
        };
      })
    );

    return enrichedEntries;
  },
});

/**
 * Get pool artists for Chaos Week with Old/New categorization
 */
export const getPoolArtistsForChaos = query({
  args: {
    seasonId: v.id('seasons'),
    currentWeek: v.number(),
  },
  handler: async (ctx, args) => {
    const poolEntries = await ctx.db
      .query('pool_entries')
      .withIndex('by_seasonId_status', (q) =>
        q.eq('seasonId', args.seasonId).eq('status', 'AVAILABLE')
      )
      .collect();

    // Enrich and categorize
    const enrichedEntries = await Promise.all(
      poolEntries.map(async (entry) => {
        const artist = await ctx.db.get(entry.artistId);
        const cutByPlayer = entry.cutByPlayerId
          ? await ctx.db.get(entry.cutByPlayerId)
          : null;
        const cutFromPlayer = entry.cutFromPlayerId
          ? await ctx.db.get(entry.cutFromPlayerId)
          : null;

        return {
          ...entry,
          artist: artist
            ? { _id: artist._id, name: artist.name }
            : null,
          cutByPlayer: cutByPlayer
            ? { _id: cutByPlayer._id, labelName: cutByPlayer.labelName }
            : null,
          cutFromPlayer: cutFromPlayer
            ? { _id: cutFromPlayer._id, labelName: cutFromPlayer.labelName }
            : null,
          poolCategory:
            entry.enteredPoolWeek < args.currentWeek ? 'OLD' : 'NEW',
        };
      })
    );

    const oldPool = enrichedEntries.filter((e) => e.poolCategory === 'OLD');
    const newPool = enrichedEntries.filter((e) => e.poolCategory === 'NEW');

    return { oldPool, newPool };
  },
});

/**
 * Get all banished artists for a season (for history/admin)
 */
export const getBanishedArtists = query({
  args: {
    seasonId: v.id('seasons'),
  },
  handler: async (ctx, args) => {
    const banishedEntries = await ctx.db
      .query('pool_entries')
      .withIndex('by_seasonId_status', (q) =>
        q.eq('seasonId', args.seasonId).eq('status', 'BANISHED')
      )
      .collect();

    // Enrich with artist details
    const enrichedEntries = await Promise.all(
      banishedEntries.map(async (entry) => {
        const artist = await ctx.db.get(entry.artistId);
        return {
          ...entry,
          artist: artist
            ? { _id: artist._id, name: artist.name }
            : null,
        };
      })
    );

    return enrichedEntries;
  },
});

/**
 * Add an artist to the pool when cut from a roster
 */
export const addToPool = mutation({
  args: {
    seasonId: v.id('seasons'),
    artistId: v.id('artists'),
    cutByPlayerId: v.id('season_players'),
    cutFromPlayerId: v.id('season_players'),
    reason: v.union(
      v.literal('SELF_CUT'),
      v.literal('CHAOS_CUT'),
      v.literal('OPPONENT_CUT')
    ),
    weekNumber: v.number(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Check if artist is already in pool with AVAILABLE status
    const existingEntry = await ctx.db
      .query('pool_entries')
      .withIndex('by_artistId', (q) => q.eq('artistId', args.artistId))
      .filter((q) => q.eq(q.field('seasonId'), args.seasonId))
      .filter((q) => q.eq(q.field('status'), 'AVAILABLE'))
      .first();

    if (existingEntry) {
      throw new Error('Artist is already in the pool');
    }

    // Create pool entry
    const poolEntryId = await ctx.db.insert('pool_entries', {
      seasonId: args.seasonId,
      artistId: args.artistId,
      status: 'AVAILABLE',
      enteredPoolAt: now,
      enteredPoolWeek: args.weekNumber,
      enteredVia: args.reason,
      cutByPlayerId: args.cutByPlayerId,
      cutFromPlayerId: args.cutFromPlayerId,
      createdAt: now,
    });

    // Get season and artist for logging
    const season = await ctx.db.get(args.seasonId);
    const artist = await ctx.db.get(args.artistId);
    const cutByPlayer = await ctx.db.get(args.cutByPlayerId);
    const cutFromPlayer = await ctx.db.get(args.cutFromPlayerId);

    // Log event
    await logEvent(ctx, {
      seasonId: args.seasonId,
      weekNumber: args.weekNumber,
      currentPhase: season?.currentPhase ?? 'ROSTER_CUTS',
      type: 'ARTIST_ADDED_TO_POOL',
      payload: {
        poolEntryId,
        artistId: args.artistId,
        artistName: artist?.name,
        cutBy: cutByPlayer?.labelName,
        cutFrom: cutFromPlayer?.labelName,
        reason: args.reason,
      },
    });

    return poolEntryId;
  },
});

/**
 * Draft an artist from the pool to a player's roster
 */
export const draftFromPool = mutation({
  args: {
    seasonId: v.id('seasons'),
    artistId: v.id('artists'),
    seasonPlayerId: v.id('season_players'),
    weekNumber: v.number(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

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
      draftedByPlayerId: args.seasonPlayerId,
      draftedAtWeek: args.weekNumber,
    });

    // Find a default prompt for the roster entry (use first available)
    const seasonPlayer = await ctx.db.get(args.seasonPlayerId);
    if (!seasonPlayer) {
      throw new Error('Season player not found');
    }

    const draftBoard = await ctx.db
      .query('draft_boards')
      .withIndex('by_seasonId', (q) => q.eq('seasonId', args.seasonId))
      .first();

    // Get first prompt as placeholder
    const prompt = draftBoard
      ? await ctx.db
          .query('draft_prompts')
          .withIndex('by_boardId', (q) => q.eq('boardId', draftBoard._id))
          .first()
      : null;

    if (!prompt) {
      throw new Error('No prompts available for roster entry');
    }

    // Create new roster entry
    const rosterEntryId = await ctx.db.insert('roster_entries', {
      seasonPlayerId: args.seasonPlayerId,
      artistId: args.artistId,
      promptId: prompt._id,
      status: 'ACTIVE',
      acquiredVia: 'POOL',
      acquiredAtWeek: args.weekNumber,
      acquiredAtRound: 0, // Pool picks don't have rounds
      createdAt: now,
    });

    // Get season, artist, and player for logging
    const season = await ctx.db.get(args.seasonId);
    const artist = await ctx.db.get(args.artistId);

    // Log event
    await logEvent(ctx, {
      seasonId: args.seasonId,
      weekNumber: args.weekNumber,
      currentPhase: season?.currentPhase ?? 'POOL_DRAFT',
      type: 'ARTIST_DRAFTED_FROM_POOL',
      payload: {
        poolEntryId: poolEntry._id,
        rosterEntryId,
        artistId: args.artistId,
        artistName: artist?.name,
        draftedBy: seasonPlayer.labelName,
      },
    });

    return rosterEntryId;
  },
});

/**
 * Banish artists from the pool (permanent removal)
 */
export const banishFromPool = mutation({
  args: {
    seasonId: v.id('seasons'),
    artistIds: v.array(v.id('artists')),
    weekNumber: v.number(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const banishedArtists: string[] = [];

    for (const artistId of args.artistIds) {
      // Find the pool entry
      const poolEntry = await ctx.db
        .query('pool_entries')
        .withIndex('by_artistId', (q) => q.eq('artistId', artistId))
        .filter((q) => q.eq(q.field('seasonId'), args.seasonId))
        .filter((q) => q.eq(q.field('status'), 'AVAILABLE'))
        .first();

      if (poolEntry) {
        // Update to BANISHED
        await ctx.db.patch(poolEntry._id, {
          status: 'BANISHED',
          banishedAtWeek: args.weekNumber,
        });

        const artist = await ctx.db.get(artistId);
        if (artist) {
          banishedArtists.push(artist.name);
        }
      }
    }

    // Get season for logging
    const season = await ctx.db.get(args.seasonId);

    // Log event
    await logEvent(ctx, {
      seasonId: args.seasonId,
      weekNumber: args.weekNumber,
      currentPhase: season?.currentPhase ?? 'POOL_DRAFT',
      type: 'ARTISTS_BANISHED',
      payload: {
        count: banishedArtists.length,
        artists: banishedArtists,
      },
    });

    return { banishedCount: banishedArtists.length };
  },
});

/**
 * Get pool count for a season
 */
export const getPoolCount = query({
  args: {
    seasonId: v.id('seasons'),
  },
  handler: async (ctx, args) => {
    const poolEntries = await ctx.db
      .query('pool_entries')
      .withIndex('by_seasonId_status', (q) =>
        q.eq('seasonId', args.seasonId).eq('status', 'AVAILABLE')
      )
      .collect();

    return poolEntries.length;
  },
});

