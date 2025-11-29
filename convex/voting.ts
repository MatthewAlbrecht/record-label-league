import { mutation, query } from './_generated/server';
import { v } from 'convex/values';
import type { Id } from './_generated/dataModel';
import { logEvent } from './events';

// Helper: Get current challenge's award categories
async function getCurrentChallengeAwardCategories(
  ctx: any,
  seasonId: Id<'seasons'>,
  weekNumber: number
) {
  // Get the selection for current week
  const selection = await ctx.db
    .query('challenge_selections')
    .withIndex('by_seasonId_weekNumber', (q) =>
      q.eq('seasonId', seasonId).eq('weekNumber', weekNumber)
    )
    .first();

  if (!selection) {
    throw new Error('No challenge selected for this week');
  }

  // Get board challenge
  const boardChallenge = await ctx.db.get(selection.boardChallengeId);
  if (!boardChallenge) {
    throw new Error('Board challenge not found');
  }

  // Get canonical challenge details
  const canonical = await ctx.db.get(boardChallenge.canonicalChallengeId);
  if (!canonical) {
    throw new Error('Canonical challenge not found');
  }

  if (!canonical.awardCategories || canonical.awardCategories.length !== 7) {
    throw new Error('Challenge must have exactly 7 award categories');
  }

  // Sort categories: 1pt first, then 2pt, then 3pt (marquee) last
  const sortedCategories = [...canonical.awardCategories].sort((a, b) => {
    if (a.points !== b.points) {
      return a.points - b.points; // 1 < 2 < 3
    }
    return 0;
  });

  // Ensure marquee (3pt) is last
  const threePointers = sortedCategories.filter((c) => c.points === 3);
  const others = sortedCategories.filter((c) => c.points !== 3);
  const finalOrder = [...others, ...threePointers];

  return finalOrder.map((cat, index) => ({
    id: cat.id,
    title: cat.name,
    description: cat.description,
    pointValue: cat.points as 1 | 2 | 3,
    order: index,
  }));
}

// Mutation: Open voting session
export const openVotingSession = mutation({
  args: {
    seasonId: v.id('seasons'),
    weekNumber: v.number(),
    revealMode: v.union(v.literal('IMMEDIATE'), v.literal('ON_REVEAL')),
    requestingUserId: v.id('users'),
  },
  handler: async (ctx, args) => {
    const season = await ctx.db.get(args.seasonId);
    if (!season) {
      throw new Error('Season not found');
    }

    // Check if requester is commissioner
    const league = await ctx.db.get(season.leagueId);
    if (!league) {
      throw new Error('League not found');
    }
    if (league.commissionerId.toString() !== args.requestingUserId.toString()) {
      throw new Error('Only commissioners can open voting sessions');
    }

    // Validate phase
    if (season.currentPhase !== 'VOTING') {
      throw new Error('Season must be in VOTING phase');
    }

    // Check if session already exists
    const existingSession = await ctx.db
      .query('voting_sessions')
      .withIndex('by_seasonId_weekNumber', (q) =>
        q.eq('seasonId', args.seasonId).eq('weekNumber', args.weekNumber)
      )
      .first();

    if (existingSession) {
      throw new Error('Voting session already exists for this week');
    }

    // Get award categories from current challenge
    const categories = await getCurrentChallengeAwardCategories(
      ctx,
      args.seasonId,
      args.weekNumber
    );

    // Create voting session
    const sessionId = await ctx.db.insert('voting_sessions', {
      seasonId: args.seasonId,
      weekNumber: args.weekNumber,
      status: 'PENDING',
      currentCategoryIndex: -1,
      categories,
      revealMode: args.revealMode,
      openedAt: Date.now(),
    });

    // Log event
    await logEvent(
      ctx,
      args.seasonId,
      'VOTING_OPENED',
      {
        week: args.weekNumber,
        categories: categories.map((c) => c.title),
        revealMode: args.revealMode,
      },
      args.requestingUserId
    );

    return sessionId;
  },
});

// Mutation: Start next category
export const startNextCategory = mutation({
  args: {
    seasonId: v.id('seasons'),
    weekNumber: v.number(),
    requestingUserId: v.id('users'),
  },
  handler: async (ctx, args) => {
    const season = await ctx.db.get(args.seasonId);
    if (!season) {
      throw new Error('Season not found');
    }

    // Check if requester is commissioner
    const league = await ctx.db.get(season.leagueId);
    if (!league) {
      throw new Error('League not found');
    }
    if (league.commissionerId.toString() !== args.requestingUserId.toString()) {
      throw new Error('Only commissioners can start categories');
    }

    // Get voting session
    const session = await ctx.db
      .query('voting_sessions')
      .withIndex('by_seasonId_weekNumber', (q) =>
        q.eq('seasonId', args.seasonId).eq('weekNumber', args.weekNumber)
      )
      .first();

    if (!session) {
      throw new Error('Voting session not found');
    }

    // Validate bounds
    if (session.currentCategoryIndex >= session.categories.length - 1) {
      throw new Error('All categories have been started');
    }

    // Increment category index
    const newIndex = session.currentCategoryIndex + 1;
    await ctx.db.patch(session._id, {
      currentCategoryIndex: newIndex,
      status: 'OPEN',
    });

    const category = session.categories[newIndex];

    // Log event
    await logEvent(
      ctx,
      args.seasonId,
      'CATEGORY_STARTED',
      {
        week: args.weekNumber,
        categoryIndex: newIndex,
        categoryTitle: category.title,
      },
      args.requestingUserId
    );

    return { categoryIndex: newIndex, category };
  },
});

// Mutation: Cast vote
export const castVote = mutation({
  args: {
    seasonId: v.id('seasons'),
    weekNumber: v.number(),
    categoryId: v.string(),
    nominatedPlayerId: v.id('season_players'),
    requestingUserId: v.id('users'),
    voterPlayerId: v.optional(v.id('season_players')), // For commissioners to vote on behalf of others
  },
  handler: async (ctx, args) => {
    const season = await ctx.db.get(args.seasonId);
    if (!season) {
      throw new Error('Season not found');
    }

    // Get voting session
    const session = await ctx.db
      .query('voting_sessions')
      .withIndex('by_seasonId_weekNumber', (q) =>
        q.eq('seasonId', args.seasonId).eq('weekNumber', args.weekNumber)
      )
      .first();

    if (!session) {
      throw new Error('Voting session not found');
    }

    // Validate session is OPEN
    if (session.status !== 'OPEN') {
      throw new Error('Voting session is not open');
    }

    // Validate current category matches
    const currentCategory = session.categories[session.currentCategoryIndex];
    if (!currentCategory || currentCategory.id !== args.categoryId) {
      throw new Error('Can only vote for current active category');
    }

    // Get voter (season player)
    const seasonPlayers = await ctx.db
      .query('season_players')
      .withIndex('by_seasonId', (q) => q.eq('seasonId', args.seasonId))
      .collect();

    // Check if commissioner is voting on behalf of someone else
    let voter;
    if (args.voterPlayerId) {
      // Commissioner voting on behalf of another player
      const league = await ctx.db.get(season.leagueId);
      if (!league) {
        throw new Error('League not found');
      }
      if (
        league.commissionerId.toString() !== args.requestingUserId.toString()
      ) {
        throw new Error(
          'Only commissioners can vote on behalf of other players'
        );
      }
      voter = seasonPlayers.find(
        (p) => p._id.toString() === args.voterPlayerId.toString()
      );
      if (!voter) {
        throw new Error('Voter player not found');
      }
    } else {
      // Regular player voting for themselves
      voter = seasonPlayers.find(
        (p) => p.userId.toString() === args.requestingUserId.toString()
      );
      if (!voter) {
        throw new Error('Voter not found');
      }
    }

    // Validate voter is not nominated player
    if (voter._id.toString() === args.nominatedPlayerId.toString()) {
      throw new Error('Cannot vote for yourself');
    }

    // Validate nominated player exists
    const nominatedPlayer = seasonPlayers.find(
      (p) => p._id.toString() === args.nominatedPlayerId.toString()
    );
    if (!nominatedPlayer) {
      throw new Error('Nominated player not found');
    }

    // Check for existing vote
    const allVotesForSession = await ctx.db
      .query('votes')
      .withIndex('by_voterId_sessionId', (q) =>
        q.eq('voterId', voter._id).eq('sessionId', session._id)
      )
      .collect();

    const existingVote = allVotesForSession.find(
      (v) => v.categoryId === args.categoryId
    );

    if (existingVote) {
      // Update existing vote
      await ctx.db.patch(existingVote._id, {
        nominatedPlayerId: args.nominatedPlayerId,
        createdAt: Date.now(),
      });
    } else {
      // Create new vote
      await ctx.db.insert('votes', {
        sessionId: session._id,
        seasonId: args.seasonId,
        weekNumber: args.weekNumber,
        voterId: voter._id,
        categoryId: args.categoryId,
        nominatedPlayerId: args.nominatedPlayerId,
        createdAt: Date.now(),
      });
    }

    // Log event
    await logEvent(
      ctx,
      args.seasonId,
      'VOTE_CAST',
      {
        week: args.weekNumber,
        voter: voter.labelName,
        category: currentCategory.title,
        categoryIndex: session.currentCategoryIndex,
        nominatedPlayer: nominatedPlayer.labelName,
      },
      args.requestingUserId
    );

    // Get vote status
    const allVotes = await ctx.db
      .query('votes')
      .withIndex('by_categoryId_sessionId', (q) =>
        q.eq('categoryId', args.categoryId).eq('sessionId', session._id)
      )
      .collect();

    return {
      categoryComplete: allVotes.length >= seasonPlayers.length,
      playersVoted: allVotes.length,
      totalPlayers: seasonPlayers.length,
    };
  },
});

// Mutation: Reveal category results
export const revealCategoryResults = mutation({
  args: {
    seasonId: v.id('seasons'),
    weekNumber: v.number(),
    requestingUserId: v.id('users'),
  },
  handler: async (ctx, args) => {
    const season = await ctx.db.get(args.seasonId);
    if (!season) {
      throw new Error('Season not found');
    }

    // Check if requester is commissioner
    const league = await ctx.db.get(season.leagueId);
    if (!league) {
      throw new Error('League not found');
    }
    if (league.commissionerId.toString() !== args.requestingUserId.toString()) {
      throw new Error('Only commissioners can reveal results');
    }

    // Get voting session
    const session = await ctx.db
      .query('voting_sessions')
      .withIndex('by_seasonId_weekNumber', (q) =>
        q.eq('seasonId', args.seasonId).eq('weekNumber', args.weekNumber)
      )
      .first();

    if (!session) {
      throw new Error('Voting session not found');
    }

    if (session.currentCategoryIndex < 0) {
      throw new Error('No category is currently active');
    }

    const currentCategory = session.categories[session.currentCategoryIndex];

    // Validate all players voted
    const seasonPlayers = await ctx.db
      .query('season_players')
      .withIndex('by_seasonId', (q) => q.eq('seasonId', args.seasonId))
      .collect();

    const allVotes = await ctx.db
      .query('votes')
      .withIndex('by_sessionId', (q) => q.eq('sessionId', session._id))
      .collect();

    const votes = allVotes.filter((v) => v.categoryId === currentCategory.id);

    if (votes.length < seasonPlayers.length) {
      throw new Error('Not all players have voted for this category');
    }

    // Check if this is the last category
    const isLastCategory =
      session.currentCategoryIndex >= session.categories.length - 1;

    if (isLastCategory) {
      // Close session
      await ctx.db.patch(session._id, {
        status: 'CLOSED',
        closedAt: Date.now(),
      });

      // Log VOTING_CLOSED event
      await logEvent(
        ctx,
        args.seasonId,
        'VOTING_CLOSED',
        {
          week: args.weekNumber,
          totalVotes: votes.length * session.categories.length,
          categoriesCompleted: session.categories.length,
        },
        args.requestingUserId
      );

      // Calculate results after voting closes
      await calculateResultsInternal(ctx, args.seasonId, args.weekNumber);
    } else {
      // Set status back to PENDING (will be set to OPEN when next category starts)
      await ctx.db.patch(session._id, {
        status: 'PENDING',
      });
    }

    // Log CATEGORY_REVEALED event
    await logEvent(
      ctx,
      args.seasonId,
      'CATEGORY_REVEALED',
      {
        week: args.weekNumber,
        categoryIndex: session.currentCategoryIndex,
        categoryTitle: currentCategory.title,
        votes: votes.map((v) => ({
          voter:
            seasonPlayers.find((p) => p._id.toString() === v.voterId.toString())
              ?.labelName || 'Unknown',
          nominatedPlayer:
            seasonPlayers.find(
              (p) => p._id.toString() === v.nominatedPlayerId.toString()
            )?.labelName || 'Unknown',
        })),
      },
      args.requestingUserId
    );

    return {
      isComplete: isLastCategory,
      categoryIndex: session.currentCategoryIndex,
      votes: votes.map((v) => ({
        voterId: v.voterId,
        nominatedPlayerId: v.nominatedPlayerId,
      })),
    };
  },
});

// Mutation: Close voting session (manual close if needed)
export const closeVotingSession = mutation({
  args: {
    seasonId: v.id('seasons'),
    weekNumber: v.number(),
    requestingUserId: v.id('users'),
  },
  handler: async (ctx, args) => {
    const season = await ctx.db.get(args.seasonId);
    if (!season) {
      throw new Error('Season not found');
    }

    // Check if requester is commissioner
    const league = await ctx.db.get(season.leagueId);
    if (!league) {
      throw new Error('League not found');
    }
    if (league.commissionerId.toString() !== args.requestingUserId.toString()) {
      throw new Error('Only commissioners can close voting sessions');
    }

    // Get voting session
    const session = await ctx.db
      .query('voting_sessions')
      .withIndex('by_seasonId_weekNumber', (q) =>
        q.eq('seasonId', args.seasonId).eq('weekNumber', args.weekNumber)
      )
      .first();

    if (!session) {
      throw new Error('Voting session not found');
    }

    // Validate all categories completed
    const seasonPlayers = await ctx.db
      .query('season_players')
      .withIndex('by_seasonId', (q) => q.eq('seasonId', args.seasonId))
      .collect();

    for (const category of session.categories) {
      const votes = await ctx.db
        .query('votes')
        .withIndex('by_categoryId_sessionId', (q) =>
          q.eq('categoryId', category.id).eq('sessionId', session._id)
        )
        .collect();

      if (votes.length < seasonPlayers.length) {
        throw new Error(
          `Not all players have voted for category: ${category.title}`
        );
      }
    }

    // Close session
    await ctx.db.patch(session._id, {
      status: 'CLOSED',
      closedAt: Date.now(),
    });

    // Log event
    const allVotes = await ctx.db
      .query('votes')
      .withIndex('by_sessionId', (q) => q.eq('sessionId', session._id))
      .collect();

    await logEvent(
      ctx,
      args.seasonId,
      'VOTING_CLOSED',
      {
        week: args.weekNumber,
        totalVotes: allVotes.length,
        categoriesCompleted: session.categories.length,
      },
      args.requestingUserId
    );

    // Calculate results after voting closes
    await calculateResultsInternal(ctx, args.seasonId, args.weekNumber);

    return session._id;
  },
});

// Query: Get voting session
export const getVotingSession = query({
  args: {
    seasonId: v.id('seasons'),
    weekNumber: v.number(),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query('voting_sessions')
      .withIndex('by_seasonId_weekNumber', (q) =>
        q.eq('seasonId', args.seasonId).eq('weekNumber', args.weekNumber)
      )
      .first();

    if (!session) {
      return null;
    }

    // Enrich categories with descriptions from canonical challenge if missing
    const needsEnrichment = session.categories.some((cat) => !cat.description);
    if (needsEnrichment) {
      try {
        // Get the canonical challenge to enrich categories
        const selection = await ctx.db
          .query('challenge_selections')
          .withIndex('by_seasonId_weekNumber', (q) =>
            q.eq('seasonId', args.seasonId).eq('weekNumber', args.weekNumber)
          )
          .first();

        if (selection) {
          const boardChallenge = await ctx.db.get(selection.boardChallengeId);
          if (boardChallenge) {
            const canonical = await ctx.db.get(boardChallenge.canonicalChallengeId);
            if (canonical && canonical.awardCategories) {
              // Create a map of category descriptions by id
              const descriptionMap = new Map(
                canonical.awardCategories.map((cat) => [cat.id, cat.description])
              );

              // Enrich categories with descriptions
              const enrichedCategories = session.categories.map((cat) => ({
                ...cat,
                description: cat.description || descriptionMap.get(cat.id) || undefined,
              }));

              return {
                ...session,
                categories: enrichedCategories,
              };
            }
          }
        }
      } catch (error) {
        // If enrichment fails, just return the session as-is
        console.error('Failed to enrich categories:', error);
      }
    }

    return session;
  },
});

// Query: Get current category votes
export const getCurrentCategoryVotes = query({
  args: {
    seasonId: v.id('seasons'),
    weekNumber: v.number(),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query('voting_sessions')
      .withIndex('by_seasonId_weekNumber', (q) =>
        q.eq('seasonId', args.seasonId).eq('weekNumber', args.weekNumber)
      )
      .first();

    if (!session || session.currentCategoryIndex < 0) {
      return null;
    }

    const currentCategory = session.categories[session.currentCategoryIndex];
    if (!currentCategory) {
      return null;
    }

    // If revealMode is ON_REVEAL and status is OPEN, votes are hidden
    if (session.revealMode === 'ON_REVEAL' && session.status === 'OPEN') {
      return null; // Votes hidden until revealed
    }

    // Get votes for current category
    const allVotes = await ctx.db
      .query('votes')
      .withIndex('by_sessionId', (q) => q.eq('sessionId', session._id))
      .collect();

    const votes = allVotes.filter((v) => v.categoryId === currentCategory.id);

    return votes;
  },
});

// Query: Get player vote for category
export const getPlayerVoteForCategory = query({
  args: {
    seasonId: v.id('seasons'),
    weekNumber: v.number(),
    categoryId: v.string(),
    playerId: v.id('season_players'),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query('voting_sessions')
      .withIndex('by_seasonId_weekNumber', (q) =>
        q.eq('seasonId', args.seasonId).eq('weekNumber', args.weekNumber)
      )
      .first();

    if (!session) {
      return null;
    }

    const allVotes = await ctx.db
      .query('votes')
      .withIndex('by_voterId_sessionId', (q) =>
        q.eq('voterId', args.playerId).eq('sessionId', session._id)
      )
      .collect();

    const vote = allVotes.find((v) => v.categoryId === args.categoryId);

    return vote;
  },
});

// Query: Get all votes for a session (for displaying results)
export const getAllSessionVotes = query({
  args: {
    seasonId: v.id('seasons'),
    weekNumber: v.number(),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query('voting_sessions')
      .withIndex('by_seasonId_weekNumber', (q) =>
        q.eq('seasonId', args.seasonId).eq('weekNumber', args.weekNumber)
      )
      .first();

    if (!session) {
      return null;
    }

    const allVotes = await ctx.db
      .query('votes')
      .withIndex('by_sessionId', (q) => q.eq('sessionId', session._id))
      .collect();

    return allVotes;
  },
});

// Query: Get category vote status
export const getCategoryVoteStatus = query({
  args: {
    seasonId: v.id('seasons'),
    weekNumber: v.number(),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query('voting_sessions')
      .withIndex('by_seasonId_weekNumber', (q) =>
        q.eq('seasonId', args.seasonId).eq('weekNumber', args.weekNumber)
      )
      .first();

    if (!session || session.currentCategoryIndex < 0) {
      return {
        categoryComplete: false,
        playersVoted: 0,
        totalPlayers: 0,
        missingVoters: [],
        currentCategoryIndex: -1,
      };
    }

    const seasonPlayers = await ctx.db
      .query('season_players')
      .withIndex('by_seasonId', (q) => q.eq('seasonId', args.seasonId))
      .collect();

    const currentCategory = session.categories[session.currentCategoryIndex];
    if (!currentCategory) {
      return {
        categoryComplete: false,
        playersVoted: 0,
        totalPlayers: seasonPlayers.length,
        missingVoters: seasonPlayers.map((p) => p.labelName),
        currentCategoryIndex: session.currentCategoryIndex,
      };
    }

    const allVotes = await ctx.db
      .query('votes')
      .withIndex('by_sessionId', (q) => q.eq('sessionId', session._id))
      .collect();

    const votes = allVotes.filter((v) => v.categoryId === currentCategory.id);

    const votedPlayerIds = new Set(votes.map((v) => v.voterId.toString()));
    const missingVoters = seasonPlayers
      .filter((p) => !votedPlayerIds.has(p._id.toString()))
      .map((p) => p.labelName);

    return {
      categoryComplete: votes.length >= seasonPlayers.length,
      playersVoted: votes.length,
      totalPlayers: seasonPlayers.length,
      missingVoters,
      currentCategoryIndex: session.currentCategoryIndex,
    };
  },
});

// Query: Get votes for current category (always returns, ignores reveal mode - for commissioner use)
export const getCategoryVotesForCommissioner = query({
  args: {
    seasonId: v.id('seasons'),
    weekNumber: v.number(),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query('voting_sessions')
      .withIndex('by_seasonId_weekNumber', (q) =>
        q.eq('seasonId', args.seasonId).eq('weekNumber', args.weekNumber)
      )
      .first();

    if (!session || session.currentCategoryIndex < 0) {
      return null;
    }

    const currentCategory = session.categories[session.currentCategoryIndex];
    if (!currentCategory) {
      return null;
    }

    // Get all votes for current category (ignores reveal mode)
    const allVotes = await ctx.db
      .query('votes')
      .withIndex('by_sessionId', (q) => q.eq('sessionId', session._id))
      .collect();

    const votes = allVotes.filter((v) => v.categoryId === currentCategory.id);

    return votes;
  },
});

// Helper: Get victory points for a placement
function getVictoryPoints(placement: number): number {
  switch (placement) {
    case 1:
      return 5;
    case 2:
      return 3;
    case 3:
      return 2;
    case 4:
      return 1;
    default:
      return 0;
  }
}

// Internal helper: Calculate results (called from mutations)
export async function calculateResultsInternal(
  ctx: any,
  seasonId: Id<'seasons'>,
  weekNumber: number
) {
  // Check if results already exist for this week
  const existingResults = await ctx.db
    .query('weekly_results')
    .withIndex('by_seasonId_weekNumber', (q: any) =>
      q.eq('seasonId', seasonId).eq('weekNumber', weekNumber)
    )
    .first();

  if (existingResults) {
    return { alreadyCalculated: true };
  }

  // Get voting session
  const session = await ctx.db
    .query('voting_sessions')
    .withIndex('by_seasonId_weekNumber', (q: any) =>
      q.eq('seasonId', seasonId).eq('weekNumber', weekNumber)
    )
    .first();

  if (!session) {
    throw new Error('Voting session not found');
  }

  if (session.status !== 'CLOSED') {
    throw new Error('Voting session must be closed to calculate results');
  }

  // Get all season players
  const seasonPlayers = await ctx.db
    .query('season_players')
    .withIndex('by_seasonId', (q: any) => q.eq('seasonId', seasonId))
    .collect();

  // Get all votes for this session
  const allVotes = await ctx.db
    .query('votes')
    .withIndex('by_sessionId', (q: any) => q.eq('sessionId', session._id))
    .collect();

  // Build category point value map
  const categoryPointMap = new Map<string, { pointValue: 1 | 2 | 3; title: string }>();
  for (const cat of session.categories) {
    categoryPointMap.set(cat.id, { pointValue: cat.pointValue, title: cat.title });
  }

  // Calculate voting points per player
  const playerResults: {
    seasonPlayerId: Id<'season_players'>;
    votingPoints: number;
    breakdown: {
      categoryId: string;
      categoryTitle: string;
      votes: number;
      pointValue: 1 | 2 | 3;
      pointsEarned: number;
    }[];
  }[] = [];

  for (const player of seasonPlayers) {
    const breakdown: {
      categoryId: string;
      categoryTitle: string;
      votes: number;
      pointValue: 1 | 2 | 3;
      pointsEarned: number;
    }[] = [];

    let totalVotingPoints = 0;

    for (const category of session.categories) {
      // Count votes for this player in this category
      const votesForPlayerInCategory = allVotes.filter(
        (v: any) =>
          v.categoryId === category.id &&
          v.nominatedPlayerId.toString() === player._id.toString()
      ).length;

      const pointsEarned = votesForPlayerInCategory * category.pointValue;
      totalVotingPoints += pointsEarned;

      breakdown.push({
        categoryId: category.id,
        categoryTitle: category.title,
        votes: votesForPlayerInCategory,
        pointValue: category.pointValue,
        pointsEarned,
      });
    }

    playerResults.push({
      seasonPlayerId: player._id,
      votingPoints: totalVotingPoints,
      breakdown,
    });
  }

  // Sort by voting points (descending) to determine rankings
  playerResults.sort((a, b) => b.votingPoints - a.votingPoints);

  // Assign placements with tie handling (sports model)
  // If two players tie for 1st, both get placement 1, next player is 3
  const placements: Map<string, number> = new Map();
  let currentPlacement = 1;
  let playersAtCurrentPlacement = 0;

  for (let i = 0; i < playerResults.length; i++) {
    const player = playerResults[i];
    const prevPlayer = i > 0 ? playerResults[i - 1] : null;

    if (prevPlayer && player.votingPoints === prevPlayer.votingPoints) {
      // Tie with previous player - same placement
      placements.set(player.seasonPlayerId.toString(), currentPlacement);
      playersAtCurrentPlacement++;
    } else {
      // New placement (skip places for ties)
      currentPlacement = i + 1;
      placements.set(player.seasonPlayerId.toString(), currentPlacement);
      playersAtCurrentPlacement = 1;
    }
  }

  // Create weekly_results records and update season_players
  const resultsData: {
    player: string;
    placement: number;
    votingPoints: number;
    victoryPoints: number;
  }[] = [];

  for (const player of playerResults) {
    const placement = placements.get(player.seasonPlayerId.toString()) || 4;
    const victoryPoints = getVictoryPoints(placement);

    // Insert weekly_results record
    await ctx.db.insert('weekly_results', {
      seasonId,
      weekNumber,
      seasonPlayerId: player.seasonPlayerId,
      votingPoints: player.votingPoints,
      placement,
      victoryPoints,
      breakdown: player.breakdown,
      createdAt: Date.now(),
    });

    // Update season_players totalPoints
    const seasonPlayer = await ctx.db.get(player.seasonPlayerId);
    if (seasonPlayer) {
      await ctx.db.patch(player.seasonPlayerId, {
        totalPoints: seasonPlayer.totalPoints + victoryPoints,
      });
    }

    // Get player name for event logging
    const playerDoc = seasonPlayers.find(
      (p: any) => p._id.toString() === player.seasonPlayerId.toString()
    );

    resultsData.push({
      player: playerDoc?.labelName || 'Unknown',
      placement,
      votingPoints: player.votingPoints,
      victoryPoints,
    });
  }

  // Log RESULTS_CALCULATED event
  await logEvent(ctx, seasonId, 'RESULTS_CALCULATED', {
    week: weekNumber,
    results: resultsData,
  });

  // Award advantages based on results
  // Import and call awardAdvantagesInternal inline to avoid circular deps
  const { awardAdvantagesInternal } = await import('./advantages');
  await awardAdvantagesInternal(ctx, seasonId, weekNumber);

  return { success: true, results: resultsData };
}

// Mutation: Calculate results (can be called manually if needed)
export const calculateResults = mutation({
  args: {
    seasonId: v.id('seasons'),
    weekNumber: v.number(),
    requestingUserId: v.id('users'),
  },
  handler: async (ctx, args) => {
    const season = await ctx.db.get(args.seasonId);
    if (!season) {
      throw new Error('Season not found');
    }

    // Check if requester is commissioner
    const league = await ctx.db.get(season.leagueId);
    if (!league) {
      throw new Error('League not found');
    }
    if (league.commissionerId.toString() !== args.requestingUserId.toString()) {
      throw new Error('Only commissioners can calculate results');
    }

    return await calculateResultsInternal(ctx, args.seasonId, args.weekNumber);
  },
});

// Query: Get weekly results
export const getWeeklyResults = query({
  args: {
    seasonId: v.id('seasons'),
    weekNumber: v.number(),
  },
  handler: async (ctx, args) => {
    // Get all results for this week
    const results = await ctx.db
      .query('weekly_results')
      .withIndex('by_seasonId_weekNumber', (q) =>
        q.eq('seasonId', args.seasonId).eq('weekNumber', args.weekNumber)
      )
      .collect();

    if (results.length === 0) {
      return null;
    }

    // Enrich with player names
    const enrichedResults = await Promise.all(
      results.map(async (result) => {
        const seasonPlayer = await ctx.db.get(result.seasonPlayerId);
        const user = seasonPlayer
          ? await ctx.db.get(seasonPlayer.userId)
          : null;

        return {
          ...result,
          playerName: seasonPlayer?.labelName || 'Unknown',
          displayName: user?.displayName || 'Unknown',
        };
      })
    );

    // Sort by placement
    return enrichedResults.sort((a, b) => a.placement - b.placement);
  },
});

// Query: Get latest week with results
export const getLatestWeekWithResults = query({
  args: {
    seasonId: v.id('seasons'),
  },
  handler: async (ctx, args) => {
    // Get all results for this season
    const results = await ctx.db
      .query('weekly_results')
      .withIndex('by_seasonId_weekNumber', (q) =>
        q.eq('seasonId', args.seasonId)
      )
      .collect();

    if (results.length === 0) {
      return null;
    }

    // Find the highest week number
    const maxWeek = Math.max(...results.map((r) => r.weekNumber));
    return maxWeek;
  },
});
