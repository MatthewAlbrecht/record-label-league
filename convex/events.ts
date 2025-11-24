import { mutation, query } from './_generated/server';
import { v } from 'convex/values';
import type { Id } from 'convex/_generated/dataModel';

// Internal helper function to log events (called from within mutations)
export async function logEvent(
  ctx: any,
  seasonId: Id<'seasons'>,
  type: string,
  payload: any,
  actorId?: Id<'users'>
) {
  // Get season to extract currentWeek and currentPhase
  const season = await ctx.db.get(seasonId);
  if (!season) {
    throw new Error('Season not found');
  }

  // Insert event into game_events table
  await ctx.db.insert('game_events', {
    seasonId,
    weekNumber: season.currentWeek,
    currentPhase: season.currentPhase,
    type,
    actorId,
    payload,
    createdAt: Date.now(),
  });
}

// Query: Get all events for a season, paginated
export const getSeasonEvents = query({
  args: {
    seasonId: v.id('seasons'),
    limit: v.optional(v.number()),
    offset: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit || 50;
    const offset = args.offset || 0;

    // Get all events for this season, ordered by most recent first
    const events = await ctx.db
      .query('game_events')
      .withIndex('by_seasonId_createdAt', (q) =>
        q.eq('seasonId', args.seasonId)
      )
      .order('desc')
      .collect();

    // Apply pagination
    const paginatedEvents = events.slice(offset, offset + limit);

    // Enhance events with actor user details
    const eventsWithDetails = await Promise.all(
      paginatedEvents.map(async (event) => {
        let actor = null;
        if (event.actorId) {
          const user = await ctx.db.get(event.actorId);
          if (user) {
            actor = {
              id: user._id,
              email: user.email,
              displayName: user.displayName,
            };
          }
        }

        return {
          ...event,
          actor,
        };
      })
    );

    return {
      events: eventsWithDetails,
      total: events.length,
      hasMore: offset + limit < events.length,
    };
  },
});


