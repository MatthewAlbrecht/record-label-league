import { mutation, query } from './_generated/server';
import { v } from 'convex/values';

export const createLeague = mutation({
  args: {
    name: v.string(),
  },
  handler: async (ctx, args) => {
    // Get the current user from the session (we'll use auth context to pass userId)
    // For now, we need a userId argument since Convex doesn't have built-in getCurrentUser
    // This will be passed from the client
    throw new Error('This mutation requires userId from client');
  },
});

export const createLeagueWithUserId = mutation({
  args: {
    name: v.string(),
    userId: v.id('users'),
  },
  handler: async (ctx, args) => {
    // Create the league
    const leagueId = await ctx.db.insert('leagues', {
      name: args.name,
      commissionerId: args.userId,
      createdAt: Date.now(),
    });

    // Add the creator as COMMISSIONER
    await ctx.db.insert('league_members', {
      leagueId,
      userId: args.userId,
      role: 'COMMISSIONER',
      joinedAt: Date.now(),
    });

    return leagueId;
  },
});

export const addMember = mutation({
  args: {
    leagueId: v.id('leagues'),
    email: v.string(),
    role: v.union(
      v.literal('COMMISSIONER'),
      v.literal('PLAYER'),
      v.literal('SPECTATOR')
    ),
    requesterId: v.id('users'),
  },
  handler: async (ctx, args) => {
    // Check if requester is commissioner
    const league = await ctx.db.get(args.leagueId);
    if (!league) {
      throw new Error('League not found');
    }

    if (league.commissionerId.toString() !== args.requesterId.toString()) {
      throw new Error('Only commissioners can add members');
    }

    // Get user by email
    const targetUser = await ctx.db
      .query('users')
      .withIndex('by_email', (q) => q.eq('email', args.email))
      .first();

    if (!targetUser) {
      throw new Error('User not found');
    }

    // Check if user is already a member
    const existingMember = await ctx.db
      .query('league_members')
      .withIndex('by_leagueId', (q) => q.eq('leagueId', args.leagueId))
      .filter((m) => m.eq(m.field('userId'), targetUser._id))
      .first();

    if (existingMember) {
      throw new Error('User is already a member of this league');
    }

    // Count current members (for max members check if needed)
    const memberCount = await ctx.db
      .query('league_members')
      .withIndex('by_leagueId', (q) => q.eq('leagueId', args.leagueId))
      .collect();

    // Add member (assuming max members is flexible for now)
    const memberId = await ctx.db.insert('league_members', {
      leagueId: args.leagueId,
      userId: targetUser._id,
      role: args.role,
      joinedAt: Date.now(),
    });

    return memberId;
  },
});

export const getLeague = query({
  args: {
    leagueId: v.id('leagues'),
  },
  handler: async (ctx, args) => {
    const league = await ctx.db.get(args.leagueId);
    if (!league) {
      throw new Error('League not found');
    }

    // Get all members
    const members = await ctx.db
      .query('league_members')
      .withIndex('by_leagueId', (q) => q.eq('leagueId', args.leagueId))
      .collect();

    // Get user details for each member
    const membersWithDetails = await Promise.all(
      members.map(async (member) => {
        const user = await ctx.db.get(member.userId);
        return {
          ...member,
          user: {
            id: user?._id,
            email: user?.email,
            displayName: user?.displayName,
          },
        };
      })
    );

    // Get commissioner details
    const commissioner = await ctx.db.get(league.commissionerId);

    return {
      ...league,
      commissioner: {
        id: commissioner?._id,
        email: commissioner?.email,
        displayName: commissioner?.displayName,
      },
      members: membersWithDetails,
    };
  },
});

export const listLeaguesForUser = query({
  args: {
    userId: v.id('users'),
  },
  handler: async (ctx, args) => {
    // Get all league memberships for the user
    const memberships = await ctx.db
      .query('league_members')
      .withIndex('by_userId', (q) => q.eq('userId', args.userId))
      .collect();

    // Get league details for each membership
    const leagues = await Promise.all(
      memberships.map(async (membership) => {
        const league = await ctx.db.get(membership.leagueId);
        const commissioner = await ctx.db.get(league.commissionerId);
        return {
          ...league,
          role: membership.role,
          commissioner: {
            id: commissioner?._id,
            email: commissioner?.email,
            displayName: commissioner?.displayName,
          },
        };
      })
    );

    return leagues;
  },
});

