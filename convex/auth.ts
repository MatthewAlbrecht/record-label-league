import { action } from './_generated/server';
import { v } from 'convex/values';
import { api } from './_generated/api';

export const signup = action({
  args: {
    email: v.string(),
    password: v.string(),
    displayName: v.string(),
  },
  handler: async (
    ctx,
    args
  ): Promise<{
    success: boolean;
    userId: string;
    user: { id: string; email: string; displayName: string };
  }> => {
    // Check if email already exists
    const existingUser = await ctx.runQuery(api.users.getUserByEmail, {
      email: args.email,
    });

    if (existingUser) {
      throw new Error('Email already exists');
    }

    // Create new user
    const userId: string = await ctx.runMutation(api.users.createUser, {
      email: args.email,
      password: args.password,
      displayName: args.displayName,
    });

    return {
      success: true,
      userId,
      user: {
        id: userId,
        email: args.email,
        displayName: args.displayName,
      },
    };
  },
});

export const login = action({
  args: {
    email: v.string(),
    password: v.string(),
  },
  handler: async (
    ctx,
    args
  ): Promise<{
    success: boolean;
    user: { id: string; email: string; displayName: string };
  }> => {
    // Get user by email
    const user: {
      _id: string;
      email: string;
      password: string;
      displayName: string;
    } | null = await ctx.runQuery(api.users.getUserByEmail, {
      email: args.email,
    });

    if (!user) {
      throw new Error('User not found');
    }

    // TODO: Phase 1 - Use bcrypt to compare hashed passwords
    if (user.password !== args.password) {
      throw new Error('Invalid password');
    }

    return {
      success: true,
      user: {
        id: user._id,
        email: user.email,
        displayName: user.displayName,
      },
    };
  },
});
