import { mutation, query } from './_generated/server';
import { v } from 'convex/values';

// Query: Get all canonical prompts
export const getCanonicalPrompts = query({
  handler: async (ctx) => {
    const prompts = await ctx.db
      .query('canonical_draft_prompts')
      .order('desc')
      .collect();
    return prompts;
  },
});

// Mutation: Add a prompt to the canonical bank
export const addCanonicalPrompt = mutation({
  args: {
    text: v.string(),
    category: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Check for duplicates
    const existing = await ctx.db
      .query('canonical_draft_prompts')
      .withIndex('by_text', (q) => q.eq('text', args.text))
      .first();

    if (existing) {
      throw new Error('Prompt already exists in the bank');
    }

    const promptId = await ctx.db.insert('canonical_draft_prompts', {
      text: args.text,
      category: args.category,
      createdAt: Date.now(),
    });
    return promptId;
  },
});

// Mutation: Update a canonical prompt
export const updateCanonicalPrompt = mutation({
  args: {
    id: v.id('canonical_draft_prompts'),
    text: v.string(),
    category: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const prompt = await ctx.db.get(args.id);
    if (!prompt) throw new Error('Prompt not found');

    await ctx.db.patch(args.id, {
      text: args.text,
      category: args.category,
    });
  },
});

// Mutation: Delete a canonical prompt
export const deleteCanonicalPrompt = mutation({
  args: { id: v.id('canonical_draft_prompts') },
  handler: async (ctx, args) => {
    const prompt = await ctx.db.get(args.id);
    if (!prompt) throw new Error('Prompt not found');
    await ctx.db.delete(args.id);
  },
});

// Mutation: Seed canonical prompts with initial data
export const seedCanonicalPrompts = mutation({
  handler: async (ctx) => {
    // Check if already seeded
    const existing = await ctx.db.query('canonical_draft_prompts').first();
    if (existing) {
      return { message: 'Already seeded' };
    }

    const seedData = [
      'Must include a track released before 1990',
      'Must include a collaboration with another artist',
      'Must include a track that features horns',
      'All tracks must be from different albums',
      'Must include a live performance',
      'Must include a track produced by [specific producer]',
      'Must include a song with explicit lyrics',
      'All tracks must be under 3 minutes',
      'Must include a remix',
      'Must include a track from a motion picture soundtrack',
      'Must include an acoustic version',
      'All tracks must be from 2010 onwards',
      'Must include a track from a debut album',
      'Must include a feat. with a rapper',
      'Must include a country collaboration',
      'All tracks must have under 500K Spotify streams',
      'Must include a track with a music video',
      'Must include a cover song',
      'All artists must be from the same country',
      'Must include a track that charted in top 10',
    ];

    for (const text of seedData) {
      await ctx.db.insert('canonical_draft_prompts', {
        text,
        createdAt: Date.now(),
      });
    }

    return { message: 'Seeded successfully', count: seedData.length };
  },
});

// Query: Get all canonical challenge categories
export const getChallengeCategories = query({
  handler: async (ctx) => {
    const categories = await ctx.db
      .query('canonical_challenge_categories')
      .order('asc')
      .collect();
    return categories;
  },
});

// Mutation: Create a challenge category
export const createChallengeCategory = mutation({
  args: { name: v.string() },
  handler: async (ctx, args) => {
    const categoryId = await ctx.db.insert('canonical_challenge_categories', {
      name: args.name.trim(),
      createdAt: Date.now(),
    });
    return categoryId;
  },
});

// Query: Get all canonical challenges
export const getCanonicalChallenges = query({
  handler: async (ctx) => {
    const challenges = await ctx.db
      .query('canonical_challenges')
      .order('desc')
      .collect();

    // Join with categories
    const challengesWithCategories = await Promise.all(
      challenges.map(async (challenge) => {
        const category = await ctx.db.get(challenge.categoryId);
        return {
          ...challenge,
          category: category?.name,
        };
      })
    );

    return challengesWithCategories;
  },
});

// Query: Get a single canonical challenge by ID
export const getCanonicalChallenge = query({
  args: { id: v.id('canonical_challenges') },
  handler: async (ctx, args) => {
    const challenge = await ctx.db.get(args.id);
    if (!challenge) return null;

    const category = await ctx.db.get(challenge.categoryId);
    return {
      ...challenge,
      category: category?.name,
    };
  },
});

// Mutation: Create a canonical challenge
export const createCanonicalChallenge = mutation({
  args: {
    title: v.string(),
    description: v.string(),
    emoji: v.string(),
    generalVibe: v.string(),
    categoryId: v.id('canonical_challenge_categories'),
    constraints: v.object({
      minTracks: v.number(),
      maxTracks: v.number(),
      rules: v.array(v.string()),
    }),
    awardCategories: v.array(
      v.object({
        id: v.string(),
        name: v.string(),
        description: v.string(),
        points: v.union(v.literal(1), v.literal(2), v.literal(3)),
      })
    ),
    options: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    // Validate 7 awards: 4x 1pt, 2x 2pt, 1x 3pt
    if (args.awardCategories.length !== 7) {
      throw new Error('Must have exactly 7 award categories');
    }
    const onePointers = args.awardCategories.filter(
      (a) => a.points === 1
    ).length;
    const twoPointers = args.awardCategories.filter(
      (a) => a.points === 2
    ).length;
    const threePointers = args.awardCategories.filter(
      (a) => a.points === 3
    ).length;
    if (onePointers !== 4 || twoPointers !== 2 || threePointers !== 1) {
      throw new Error(
        'Must have exactly 4 one-point, 2 two-point, and 1 three-point award'
      );
    }

    const challengeId = await ctx.db.insert('canonical_challenges', {
      title: args.title,
      description: args.description,
      emoji: args.emoji,
      generalVibe: args.generalVibe,
      categoryId: args.categoryId,
      constraints: args.constraints,
      awardCategories: args.awardCategories,
      options: args.options,
      createdAt: Date.now(),
    });
    return challengeId;
  },
});

// Mutation: Update a canonical challenge
export const updateCanonicalChallenge = mutation({
  args: {
    id: v.id('canonical_challenges'),
    title: v.string(),
    description: v.string(),
    emoji: v.string(),
    generalVibe: v.string(),
    categoryId: v.id('canonical_challenge_categories'),
    constraints: v.object({
      minTracks: v.number(),
      maxTracks: v.number(),
      rules: v.array(v.string()),
    }),
    awardCategories: v.array(
      v.object({
        id: v.string(),
        name: v.string(),
        description: v.string(),
        points: v.union(v.literal(1), v.literal(2), v.literal(3)),
      })
    ),
    options: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const challenge = await ctx.db.get(args.id);
    if (!challenge) throw new Error('Challenge not found');

    // Validate 7 awards: 4x 1pt, 2x 2pt, 1x 3pt
    if (args.awardCategories.length !== 7) {
      throw new Error('Must have exactly 7 award categories');
    }
    const onePointers = args.awardCategories.filter(
      (a) => a.points === 1
    ).length;
    const twoPointers = args.awardCategories.filter(
      (a) => a.points === 2
    ).length;
    const threePointers = args.awardCategories.filter(
      (a) => a.points === 3
    ).length;
    if (onePointers !== 4 || twoPointers !== 2 || threePointers !== 1) {
      throw new Error(
        'Must have exactly 4 one-point, 2 two-point, and 1 three-point award'
      );
    }

    await ctx.db.patch(args.id, {
      title: args.title,
      description: args.description,
      emoji: args.emoji,
      generalVibe: args.generalVibe,
      categoryId: args.categoryId,
      constraints: args.constraints,
      awardCategories: args.awardCategories,
      options: args.options,
    });
  },
});

// Mutation: Delete a canonical challenge
export const deleteCanonicalChallenge = mutation({
  args: { id: v.id('canonical_challenges') },
  handler: async (ctx, args) => {
    const challenge = await ctx.db.get(args.id);
    if (!challenge) throw new Error('Challenge not found');
    await ctx.db.delete(args.id);
  },
});

// Query: Get all canonical advantages
export const getCanonicalAdvantages = query({
  handler: async (ctx) => {
    const advantages = await ctx.db
      .query('canonical_advantages')
      .order('desc')
      .collect();
    return advantages;
  },
});

// Mutation: Create a canonical advantage
export const createCanonicalAdvantage = mutation({
  args: {
    code: v.string(),
    name: v.string(),
    description: v.string(),
    validPhases: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    // Check for duplicate code
    const existing = await ctx.db
      .query('canonical_advantages')
      .withIndex('by_code', (q) => q.eq('code', args.code))
      .first();

    if (existing) {
      throw new Error('Advantage with this code already exists');
    }

    const advantageId = await ctx.db.insert('canonical_advantages', {
      code: args.code.trim(),
      name: args.name.trim(),
      description: args.description.trim(),
      validPhases: args.validPhases,
      createdAt: Date.now(),
    });
    return advantageId;
  },
});

// Mutation: Update a canonical advantage
export const updateCanonicalAdvantage = mutation({
  args: {
    id: v.id('canonical_advantages'),
    code: v.string(),
    name: v.string(),
    description: v.string(),
    validPhases: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const advantage = await ctx.db.get(args.id);
    if (!advantage) throw new Error('Advantage not found');

    // Check for duplicate code (excluding current advantage)
    if (args.code !== advantage.code) {
      const existing = await ctx.db
        .query('canonical_advantages')
        .withIndex('by_code', (q) => q.eq('code', args.code))
        .first();

      if (existing) {
        throw new Error('Advantage with this code already exists');
      }
    }

    await ctx.db.patch(args.id, {
      code: args.code.trim(),
      name: args.name.trim(),
      description: args.description.trim(),
      validPhases: args.validPhases,
    });
  },
});

// Mutation: Delete a canonical advantage
export const deleteCanonicalAdvantage = mutation({
  args: { id: v.id('canonical_advantages') },
  handler: async (ctx, args) => {
    const advantage = await ctx.db.get(args.id);
    if (!advantage) throw new Error('Advantage not found');
    await ctx.db.delete(args.id);
  },
});

// Mutation: Seed canonical advantages with initial data
export const seedCanonicalAdvantages = mutation({
  handler: async (ctx) => {
    // Check if already seeded
    const existing = await ctx.db.query('canonical_advantages').first();
    if (existing) {
      return { message: 'Already seeded' };
    }

    const seedData = [
      // Tier 1 Utility Advantages
      {
        code: 'DIRECTORS_CHAIR',
        name: "Director's Chair",
        description:
          'Reveal 3 challenges from the challenge board, then choose which one to play next.',
        tier: 1,
      },
      {
        code: 'LOANER',
        name: 'Loaner',
        description:
          "Borrow an opponent's artist for the next challenge; they can't use them.",
        tier: 1,
      },
      {
        code: 'INDUSTRY_PLANT',
        name: 'Industry Plant',
        description:
          'Force an opponent to include your artist in their playlist.',
        tier: 1,
      },
      {
        code: 'THE_MANDATE',
        name: 'The Mandate',
        description:
          'Force an opponent to use a specific artist from their roster.',
        tier: 1,
      },
      {
        code: 'IMMUNITY_IDOL',
        name: 'Immunity Idol',
        description: 'Immune to all negative prize effects for one round.',
        tier: 1,
      },
      {
        code: 'THE_WILD_CARD',
        name: 'The Wild Card',
        description: 'Use one song from any unrostered artist.',
        tier: 1,
      },
      {
        code: 'THEME_TILT',
        name: 'Theme Tilt',
        description:
          "You add a bonus rule to the week's playlist challenge. Must be agreed upon by all players.",
        tier: 1,
      },
      {
        code: 'TRADE_BLOCK',
        name: 'Trade Block',
        description:
          'Force two players to trade one roster artist of your choosing for one week. (2 protected artists)',
        tier: 1,
      },
      {
        code: 'SHADOW_REALM',
        name: 'Shadow Realm',
        description:
          'Banish half the Pool (rounded up). You choose which artists are banished.',
        tier: 1,
      },
      {
        code: 'THE_BREAKDOWN',
        name: 'The Breakdown',
        description:
          'Trade one Tier 3 advantage for two Tier 2 advantages, or one Tier 2 advantage for two Tier 1 advantages.',
        tier: 1,
      },
      {
        code: 'FREE_SPIN',
        name: 'Free Spin',
        description:
          'Spin a weighted wheel that can land on any advantage (weighted toward lower tiers).',
        tier: 1,
      },
      {
        code: 'RED_PEN',
        name: 'Red Pen',
        description: 'Remove a scoring category for everyone next challenge.',
        tier: 1,
      },
      {
        code: 'CRITICS_CHAIR',
        name: "Critic's Chair",
        description:
          'Sit out this challenge. You receive 3rd place points and a Tier 3 advantage at the end of the session.',
        tier: 1,
      },
      // Tier 2 Tactical Advantages
      {
        code: 'NEW_SIGNING',
        name: 'New Signing',
        description: 'Add any undrafted artist to your roster.',
        tier: 2,
      },
      {
        code: 'THE_EIGHTH_CRITERION',
        name: 'The Eighth Criterion',
        description:
          'Add an additional 2-point scoring category for the next round. Must be agreed upon by all players.',
        tier: 2,
      },
      {
        code: 'THE_MAGNIFIER',
        name: 'The Magnifier',
        description: 'Double the value of one scoring category for everyone.',
        tier: 2,
      },
      {
        code: 'BENCHED',
        name: 'Benched',
        description:
          'Select one artist from each opponent that becomes unusable next round. (2 protected artists)',
        tier: 2,
      },
      {
        code: 'SAFEHOUSE_TAG',
        name: 'Safehouse Tag',
        description: 'Protect +1 extra artist during Chaos Week.',
        tier: 2,
      },
      {
        code: 'POOL_WARDEN',
        name: 'Pool Warden',
        description:
          'Banish one artist from the Pool and add one Pool artist to your roster.',
        tier: 2,
      },
      {
        code: 'THE_BROKER',
        name: 'The Broker',
        description:
          "Force two other players to permanently trade one roster artist each. Each player picks 3 artists they want from the other's roster.",
        tier: 2,
      },
      {
        code: 'THE_REBUILD',
        name: 'The Rebuild',
        description:
          'Cut up to two artists and immediately redraft the same number.',
        tier: 2,
      },
      {
        code: 'THE_GAMBLE',
        name: 'The Gamble',
        description:
          'You may only play this advantage this week (no other advantages). You cannot earn any advantages this week through placement or sweeps. Your protection count is reduced by 1.',
        tier: 2,
      },
      {
        code: 'THE_TRIBUNAL',
        name: 'The Tribunal',
        description:
          'Trigger a special elimination round affecting two rosters.',
        tier: 2,
      },
      {
        code: 'THE_UPGRADE',
        name: 'The Upgrade',
        description:
          'When selecting an advantage, you may choose from one tier higher than normal.',
        tier: 2,
      },
      // Tier 3 Major Advantages
      {
        code: 'INDUCTED',
        name: 'Inducted',
        description:
          'Make one artist a Hall of Famer (+2 points every time they are used in a playlist).',
        tier: 3,
      },
      {
        code: 'FORCED_TRADE',
        name: 'Forced Trade',
        description:
          "Take an opponent's unprotected artist; they take one of your protected artists (3 protected).",
        tier: 3,
      },
      {
        code: 'THE_PURGE',
        name: 'The Purge',
        description:
          'Force each opponent to drop a protected artist to the pool (2 protected).',
        tier: 3,
      },
      {
        code: 'THE_FRANCHISE_TAG',
        name: 'The Franchise Tag',
        description:
          'Permanently protect one artist from all negative effects. Cannot be stolen, cut by other players, traded, or borrowed.',
        tier: 3,
      },
      {
        code: 'THE_REFRESH',
        name: 'The Refresh',
        description:
          'Replace up to 3 artists from your roster with artists from the Pool.',
        tier: 3,
      },
      {
        code: 'POOL_SWAP',
        name: 'Pool Swap',
        description:
          'Your roster becomes the Pool for one challenge. No other advantages can be used by other players this week related to the Pool.',
        tier: 3,
      },
    ];

    for (const data of seedData) {
      await ctx.db.insert('canonical_advantages', {
        code: data.code,
        name: data.name,
        description: data.description,
        createdAt: Date.now(),
      });
    }

    return { message: 'Seeded successfully', count: seedData.length };
  },
});

// Query: Debug - Get all season data
export const getSeasonDebugData = query({
  args: { seasonId: v.id('seasons') },
  handler: async (ctx, args) => {
    const season = await ctx.db.get(args.seasonId);
    if (!season) throw new Error('Season not found');

    // Fetch all related data
    const seasonPlayers = await ctx.db
      .query('season_players')
      .withIndex('by_seasonId', (q) => q.eq('seasonId', args.seasonId))
      .collect();

    const playerInventory = await ctx.db
      .query('player_inventory')
      .collect();

    const playerInventoryForSeason = playerInventory.filter((inv) => {
      return seasonPlayers.some((sp) => sp._id.toString() === inv.seasonPlayerId.toString());
    });

    const draftBoard = await ctx.db
      .query('draft_boards')
      .withIndex('by_seasonId', (q) => q.eq('seasonId', args.seasonId))
      .first();

    const draftPrompts = draftBoard
      ? await ctx.db
          .query('draft_prompts')
          .withIndex('by_boardId', (q) => q.eq('boardId', draftBoard._id))
          .collect()
      : [];

    const challengeBoard = await ctx.db
      .query('challenge_boards')
      .withIndex('by_seasonId', (q) => q.eq('seasonId', args.seasonId))
      .first();

    const boardChallenges = challengeBoard
      ? await ctx.db
          .query('board_challenges')
          .withIndex('by_boardId', (q) => q.eq('boardId', challengeBoard._id))
          .collect()
      : [];

    const advantageBoard = await ctx.db
      .query('advantage_boards')
      .withIndex('by_seasonId', (q) => q.eq('seasonId', args.seasonId))
      .first();

    const boardAdvantages = advantageBoard
      ? await ctx.db
          .query('board_advantages')
          .withIndex('by_boardId', (q) => q.eq('boardId', advantageBoard._id))
          .collect()
      : [];

    const draftState = await ctx.db
      .query('draft_state')
      .withIndex('by_seasonId', (q) => q.eq('seasonId', args.seasonId))
      .first();

    const draftSelections = await ctx.db
      .query('draft_selections')
      .withIndex('by_seasonId', (q) => q.eq('seasonId', args.seasonId))
      .collect();

    const rosterEntries = await ctx.db
      .query('roster_entries')
      .collect();

    const rosterEntriesForSeason = rosterEntries.filter((re) => {
      return seasonPlayers.some((sp) => sp._id.toString() === re.seasonPlayerId.toString());
    });

    const challengeSelections = await ctx.db
      .query('challenge_selections')
      .withIndex('by_seasonId', (q) => q.eq('seasonId', args.seasonId))
      .collect();

    const challengeReveals = await ctx.db
      .query('challenge_reveals')
      .withIndex('by_seasonId', (q) => q.eq('seasonId', args.seasonId))
      .collect();

    // Presentation state for current week
    const presentationStates = await ctx.db
      .query('presentation_state')
      .withIndex('by_seasonId_weekNumber', (q) =>
        q.eq('seasonId', args.seasonId).eq('weekNumber', season.currentWeek)
      )
      .collect();

    // Voting sessions
    const votingSessions = await ctx.db
      .query('voting_sessions')
      .withIndex('by_seasonId_weekNumber', (q) =>
        q.eq('seasonId', args.seasonId).eq('weekNumber', season.currentWeek)
      )
      .collect();

    // Challenge option selections
    const challengeOptionSelections = await ctx.db
      .query('challenge_option_selections')
      .withIndex('by_seasonId_weekNumber', (q) =>
        q.eq('seasonId', args.seasonId).eq('weekNumber', season.currentWeek)
      )
      .collect();

    return {
      season,
      seasonPlayers: seasonPlayers.length,
      seasonPlayersData: seasonPlayers,
      playerInventory: playerInventoryForSeason.length,
      playerInventoryData: playerInventoryForSeason,
      draftBoard: draftBoard ? 'exists' : 'null',
      draftBoardData: draftBoard,
      draftPrompts: draftPrompts.length,
      draftPromptsData: draftPrompts,
      challengeBoard: challengeBoard ? 'exists' : 'null',
      challengeBoardData: challengeBoard,
      boardChallenges: boardChallenges.length,
      boardChallengesData: boardChallenges,
      advantageBoard: advantageBoard ? 'exists' : 'null',
      advantageBoardData: advantageBoard,
      boardAdvantages: boardAdvantages.length,
      boardAdvantagesData: boardAdvantages,
      draftState: draftState ? 'exists' : 'null',
      draftStateData: draftState,
      draftSelections: draftSelections.length,
      draftSelectionsData: draftSelections,
      rosterEntries: rosterEntriesForSeason.length,
      rosterEntriesData: rosterEntriesForSeason,
      challengeSelections: challengeSelections.length,
      challengeSelectionsData: challengeSelections,
      challengeReveals: challengeReveals.length,
      challengeRevealsData: challengeReveals,
      presentationState: presentationStates.length > 0 ? 'exists' : 'null',
      presentationStateData: presentationStates[0] || null,
      votingSession: votingSessions.length > 0 ? 'exists' : 'null',
      votingSessionData: votingSessions[0] || null,
      challengeOptionSelections: challengeOptionSelections.length,
      challengeOptionSelectionsData: challengeOptionSelections,
    };
  },
});
