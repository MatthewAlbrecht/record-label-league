import { mutation, query } from './_generated/server';
import { v } from 'convex/values';

export const createUser = mutation({
  args: {
    email: v.string(),
    password: v.string(),
    displayName: v.string(),
  },
  handler: async (ctx, args) => {
    // Check if email already exists
    const existingUser = await ctx.db
      .query('users')
      .withIndex('by_email', (q) => q.eq('email', args.email))
      .first();

    if (existingUser) {
      throw new Error('Email already exists');
    }

    // Create new user
    const userId = await ctx.db.insert('users', {
      email: args.email,
      password: args.password,
      displayName: args.displayName,
      createdAt: Date.now(),
    });

    return userId;
  },
});

export const getUserByEmail = query({
  args: {
    email: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query('users')
      .withIndex('by_email', (q) => q.eq('email', args.email))
      .first();

    return user;
  },
});

export const updateDisplayName = mutation({
  args: {
    userId: v.id('users'),
    displayName: v.string(),
  },
  handler: async (ctx, args) => {
    // Update the user's display name
    await ctx.db.patch(args.userId, {
      displayName: args.displayName,
    });

    // Return the updated user
    const updatedUser = await ctx.db.get(args.userId);
    return updatedUser;
  },
});

export const getUserById = query({
  args: {
    userId: v.id('users'),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    return user;
  },
});
