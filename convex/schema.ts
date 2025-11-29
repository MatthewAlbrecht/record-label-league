import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

export default defineSchema({
  users: defineTable({
    email: v.string(),
    password: v.string(),
    displayName: v.string(),
    isAdmin: v.optional(v.boolean()),
    createdAt: v.number(),
  }).index('by_email', ['email']),

  // Global bank of prompts
  canonical_draft_prompts: defineTable({
    text: v.string(),
    category: v.optional(v.string()), // Optional suggested category
    createdAt: v.number(),
  }).index('by_text', ['text']),

  // Season-specific draft board configuration
  draft_boards: defineTable({
    seasonId: v.id('seasons'),
    categories: v.array(
      v.object({
        id: v.string(), // UUID
        title: v.string(),
      })
    ),
    isLocked: v.optional(v.boolean()),
    lockedAt: v.optional(v.number()),
    createdAt: v.number(),
  }).index('by_seasonId', ['seasonId']),

  // Individual prompts on a specific board
  draft_prompts: defineTable({
    boardId: v.id('draft_boards'),
    categoryId: v.string(), // Matches ID in draft_boards.categories
    text: v.string(),
    order: v.number(),
    isCanonical: v.boolean(), // Was this imported from bank?
    canonicalId: v.optional(v.id('canonical_draft_prompts')),
    status: v.optional(
      v.union(v.literal('OPEN'), v.literal('SELECTED'), v.literal('RETIRED'))
    ), // Draft state
    selectedByPlayerId: v.optional(v.id('season_players')), // Who selected this prompt
    selectedAtRound: v.optional(v.number()), // Which round was it selected
    createdAt: v.number(),
  }).index('by_boardId', ['boardId']),

  // Artist entries (manually typed by commissioner)
  artists: defineTable({
    name: v.string(),
    seasonId: v.id('seasons'),
    createdAt: v.number(),
  })
    .index('by_seasonId', ['seasonId'])
    .index('by_name_seasonId', ['name', 'seasonId']),

  // Draft state machine tracker
  draft_state: defineTable({
    seasonId: v.id('seasons'), // Unique per season
    currentRound: v.number(),
    currentPickerIndex: v.number(), // 0-3, index into draftOrder array
    draftOrder: v.array(v.id('season_players')), // Randomized player order
    isComplete: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index('by_seasonId', ['seasonId']),

  // Track which prompts were selected by which players
  draft_selections: defineTable({
    seasonId: v.id('seasons'),
    promptId: v.id('draft_prompts'),
    selectedByPlayerId: v.id('season_players'),
    round: v.number(),
    createdAt: v.number(),
  })
    .index('by_seasonId', ['seasonId'])
    .index('by_promptId', ['promptId']),

  // Roster entries (drafted artists for each player)
  roster_entries: defineTable({
    seasonPlayerId: v.id('season_players'),
    artistId: v.id('artists'),
    promptId: v.id('draft_prompts'), // Which prompt was used
    status: v.union(
      v.literal('ACTIVE'),
      v.literal('CUT'),
      v.literal('BENCHED')
    ),
    acquiredVia: v.union(
      v.literal('DRAFT'),
      v.literal('POOL'),
      v.literal('TRADED')
    ),
    acquiredAtWeek: v.number(),
    acquiredAtRound: v.number(), // 1-8 for draft picks
    createdAt: v.number(),
  })
    .index('by_seasonPlayerId', ['seasonPlayerId'])
    .index('by_artistId', ['artistId']),

  leagues: defineTable({
    name: v.string(),
    commissionerId: v.id('users'),
    createdAt: v.number(),
  }).index('by_commissionerId', ['commissionerId']),

  league_members: defineTable({
    leagueId: v.id('leagues'),
    userId: v.id('users'),
    role: v.union(
      v.literal('COMMISSIONER'),
      v.literal('PLAYER'),
      v.literal('SPECTATOR')
    ),
    joinedAt: v.number(),
  })
    .index('by_leagueId', ['leagueId'])
    .index('by_userId', ['userId']),

  seasons: defineTable({
    leagueId: v.id('leagues'),
    name: v.string(),
    status: v.union(
      v.literal('PRESEASON'),
      v.literal('IN_PROGRESS'),
      v.literal('COMPLETED')
    ),
    currentWeek: v.number(),
    currentPhase: v.string(),
    config: v.object({
      rosterSize: v.number(),
      challengeCount: v.number(),
    }),
    advantageSelectionConfig: v.optional(v.object({
      tier1Count: v.number(),
      tier2Count: v.number(),
      tier3Count: v.number(),
    })),
    createdAt: v.number(),
    startedAt: v.optional(v.number()),
    endedAt: v.optional(v.number()),
  }).index('by_leagueId', ['leagueId']),

  season_players: defineTable({
    seasonId: v.id('seasons'),
    userId: v.id('users'),
    labelName: v.string(),
    draftPosition: v.optional(v.number()),
    totalPoints: v.number(),
    createdAt: v.number(),
  })
    .index('by_seasonId', ['seasonId'])
    .index('by_userId', ['userId']),

  // Canonical challenge categories
  canonical_challenge_categories: defineTable({
    name: v.string(),
    createdAt: v.number(),
  }),

  // Global bank of challenges
  canonical_challenges: defineTable({
    title: v.string(),
    description: v.string(),
    emoji: v.string(),
    generalVibe: v.string(),
    categoryId: v.id('canonical_challenge_categories'),
    type: v.optional(v.string()),
    options: v.optional(v.array(v.string())),
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
    createdAt: v.number(),
  }),

  // Season-specific challenge board configuration
  challenge_boards: defineTable({
    seasonId: v.id('seasons'),
    categories: v.array(
      v.object({
        id: v.string(), // UUID
        title: v.string(),
      })
    ),
    isLocked: v.optional(v.boolean()),
    lockedAt: v.optional(v.number()),
    createdAt: v.number(),
  }).index('by_seasonId', ['seasonId']),

  // Challenges placed on a specific board
  board_challenges: defineTable({
    boardId: v.id('challenge_boards'),
    categoryId: v.string(),
    canonicalChallengeId: v.id('canonical_challenges'),
    order: v.number(),
    createdAt: v.number(),
  }).index('by_boardId', ['boardId']),

  // Global bank of advantages
  canonical_advantages: defineTable({
    code: v.string(), // e.g., "DIRECTOR_CHAIR"
    name: v.string(),
    description: v.string(),
    validPhases: v.optional(v.array(v.string())), // GamePhase[] (JSON)
    createdAt: v.number(),
  }).index('by_code', ['code']),

  // Season-specific advantage board configuration
  advantage_boards: defineTable({
    seasonId: v.id('seasons'),
    categories: v.array(
      v.object({
        id: v.string(), // UUID (e.g., "tier-1", "tier-2", "tier-3")
        title: v.string(),
      })
    ),
    isLocked: v.optional(v.boolean()),
    lockedAt: v.optional(v.number()),
    createdAt: v.number(),
  }).index('by_seasonId', ['seasonId']),

  // Advantages placed on a specific board
  board_advantages: defineTable({
    boardId: v.id('advantage_boards'),
    categoryId: v.string(), // Matches ID in advantage_boards.categories
    canonicalAdvantageId: v.id('canonical_advantages'),
    order: v.number(),
    createdAt: v.number(),
  }).index('by_boardId', ['boardId']),

  // Player advantage inventory
  player_inventory: defineTable({
    seasonPlayerId: v.id('season_players'),
    advantageCode: v.string(), // References canonical_advantages.code
    tier: v.optional(v.union(v.literal(1), v.literal(2), v.literal(3))), // Optional for backwards compat
    status: v.union(
      v.literal('AVAILABLE'),
      v.literal('PLAYED'),
      v.literal('EXPIRED')
    ),
    earnedWeek: v.number(),
    earnedVia: v.union(
      v.literal('PLACEMENT'),
      v.literal('SWEEP'),
      v.literal('STARTING')
    ),
    canUseAfterWeek: v.optional(v.number()), // Cooldown: 0 = usable immediately, optional for backwards compat
    createdAt: v.number(),
  }).index('by_seasonPlayerId', ['seasonPlayerId']),

  // Advantage distribution settings per season
  advantage_distribution_settings: defineTable({
    seasonId: v.id('seasons'),
    // Placement-based rewards: array allows multiple advantages per placement
    placementRewards: v.array(
      v.object({
        placement: v.union(v.literal(1), v.literal(2), v.literal(3), v.literal(4)),
        tier: v.union(v.literal(1), v.literal(2), v.literal(3)),
        count: v.number(),
      })
    ),
    // Sweep rewards configuration
    sweepRewards: v.array(
      v.object({
        categoryPointValue: v.union(v.literal(1), v.literal(2), v.literal(3)),
        tier: v.union(v.literal(1), v.literal(2), v.literal(3)),
        count: v.number(),
      })
    ),
    sweepsStack: v.boolean(), // true = player can earn multiple sweep advantages
    maxSweepAdvantagesPerWeek: v.optional(v.number()), // optional cap if stacking enabled
    // Cooldown configuration
    cooldownByTier: v.array(
      v.object({
        tier: v.union(v.literal(1), v.literal(2), v.literal(3)),
        weeksDelay: v.number(), // 0 = usable immediately, 1 = next week, etc.
      })
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index('by_seasonId', ['seasonId']),

  // Advantage awards (tracks all advantages awarded each week)
  advantage_awards: defineTable({
    seasonId: v.id('seasons'),
    weekNumber: v.number(),
    seasonPlayerId: v.id('season_players'),
    advantageCode: v.string(),
    tier: v.union(v.literal(1), v.literal(2), v.literal(3)),
    awardedVia: v.union(v.literal('PLACEMENT'), v.literal('SWEEP')),
    placementRank: v.optional(v.number()), // if from placement, 1-4
    sweepCategoryId: v.optional(v.string()), // if from sweep
    earnedWeek: v.number(),
    canUseAfterWeek: v.number(), // based on cooldown config
    createdAt: v.number(),
  })
    .index('by_seasonPlayerId', ['seasonPlayerId'])
    .index('by_seasonId_weekNumber', ['seasonId', 'weekNumber']),

  // Event logging system
  game_events: defineTable({
    seasonId: v.id('seasons'),
    weekNumber: v.number(),
    currentPhase: v.string(),
    type: v.string(), // e.g., "DRAFT_PICK", "PROMPT_SELECTED", "PHASE_ADVANCED"
    actorId: v.optional(v.id('users')),
    payload: v.any(), // Flexible JSON structure
    createdAt: v.number(),
  })
    .index('by_seasonId', ['seasonId'])
    .index('by_seasonId_createdAt', ['seasonId', 'createdAt']),

  // Challenge selections (tracks which player picked which challenge for which week)
  challenge_selections: defineTable({
    seasonId: v.id('seasons'),
    weekNumber: v.number(),
    boardChallengeId: v.id('board_challenges'),
    selectedByPlayerId: v.id('season_players'),
    createdAt: v.number(),
  })
    .index('by_seasonId_weekNumber', ['seasonId', 'weekNumber'])
    .index('by_seasonId', ['seasonId']),

  // Challenge reveals (tracks which challenges have been revealed and by whom)
  challenge_reveals: defineTable({
    seasonId: v.id('seasons'),
    boardChallengeId: v.id('board_challenges'),
    revealedByPlayerId: v.id('season_players'),
    revealedAtWeek: v.number(),
    createdAt: v.number(),
  })
    .index('by_seasonId', ['seasonId'])
    .index('by_boardChallengeId', ['boardChallengeId']),

  // Challenge option selections (tracks which option each player selected for a challenge)
  challenge_option_selections: defineTable({
    challengeSelectionId: v.id('challenge_selections'),
    seasonId: v.id('seasons'),
    weekNumber: v.number(),
    seasonPlayerId: v.id('season_players'),
    selectedOption: v.string(),
    createdAt: v.number(),
  })
    .index('by_seasonId_weekNumber', ['seasonId', 'weekNumber'])
    .index('by_challengeSelectionId', ['challengeSelectionId']),

  // Playlist submissions (player submissions during PLAYLIST_SUBMISSION phase)
  playlist_submissions: defineTable({
    seasonId: v.id('seasons'),
    weekNumber: v.number(),
    seasonPlayerId: v.id('season_players'),
    spotifyPlaylistUrl: v.string(),
    selectedOption: v.optional(v.string()), // Option selected if challenge had options
    submittedAt: v.number(),
    status: v.union(
      v.literal('DRAFT'),
      v.literal('SUBMITTED'),
      v.literal('VALIDATED')
    ),
    createdAt: v.number(),
  })
    .index('by_seasonId_weekNumber', ['seasonId', 'weekNumber'])
    .index('by_seasonPlayerId', ['seasonPlayerId']),

  // Tracks in a playlist submission
  playlist_tracks: defineTable({
    playlistSubmissionId: v.id('playlist_submissions'),
    spotifyTrackId: v.string(),
    trackName: v.string(),
    artistNames: v.array(v.string()), // Artist names from Spotify
    albumArt: v.string(), // URL
    duration: v.number(), // ms
    position: v.number(), // order in playlist
    rawSpotifyData: v.any(), // Raw track data from Spotify API for future mapping
    createdAt: v.number(),
  }).index('by_playlistSubmissionId', ['playlistSubmissionId']),

  // Presentation state for week's playlist reveal
  presentation_state: defineTable({
    seasonId: v.id('seasons'),
    weekNumber: v.number(),
    currentPresenterId: v.optional(v.id('season_players')),
    currentTrackIndex: v.number(), // -1 = not started, 0+ = track index
    presentedPlayerIds: v.array(v.id('season_players')), // Track who has presented
    status: v.union(
      v.literal('NOT_STARTED'),
      v.literal('IN_PROGRESS'),
      v.literal('COMPLETED')
    ),
    startedAt: v.number(),
    completedAt: v.optional(v.number()),
  }).index('by_seasonId_weekNumber', ['seasonId', 'weekNumber']),

  // Voting sessions for weekly award voting
  voting_sessions: defineTable({
    seasonId: v.id('seasons'),
    weekNumber: v.number(),
    status: v.union(
      v.literal('PENDING'),
      v.literal('OPEN'),
      v.literal('CLOSED')
    ),
    currentCategoryIndex: v.number(), // -1 = not started, 0-6 = current award being voted on
    categories: v.array(
      v.object({
        id: v.string(), // UUID matching awardCategories[].id
        title: v.string(),
        description: v.optional(v.string()),
        pointValue: v.union(v.literal(1), v.literal(2), v.literal(3)),
        order: v.number(), // 0-6, with 6 being marquee (last)
      })
    ),
    revealMode: v.union(v.literal('IMMEDIATE'), v.literal('ON_REVEAL')), // Whether votes show immediately or hidden until reveal
    openedAt: v.number(),
    closedAt: v.optional(v.number()),
  }).index('by_seasonId_weekNumber', ['seasonId', 'weekNumber']),

  // Individual votes cast by players
  votes: defineTable({
    sessionId: v.id('voting_sessions'),
    seasonId: v.id('seasons'),
    weekNumber: v.number(),
    voterId: v.id('season_players'),
    categoryId: v.string(), // Matches voting_sessions.categories[].id
    nominatedPlayerId: v.id('season_players'),
    createdAt: v.number(),
  })
    .index('by_sessionId', ['sessionId'])
    .index('by_voterId_sessionId', ['voterId', 'sessionId'])
    .index('by_categoryId_sessionId', ['categoryId', 'sessionId']),

  // Weekly results (calculated after voting closes)
  weekly_results: defineTable({
    seasonId: v.id('seasons'),
    weekNumber: v.number(),
    seasonPlayerId: v.id('season_players'),
    votingPoints: v.number(), // votes × category weights
    placement: v.number(), // 1, 2, 3, 4
    victoryPoints: v.number(), // 5, 3, 2, 1
    breakdown: v.array(
      v.object({
        categoryId: v.string(),
        categoryTitle: v.string(),
        votes: v.number(),
        pointValue: v.union(v.literal(1), v.literal(2), v.literal(3)),
        pointsEarned: v.number(),
      })
    ),
    createdAt: v.number(),
  })
    .index('by_seasonId_weekNumber', ['seasonId', 'weekNumber'])
    .index('by_seasonPlayerId', ['seasonPlayerId']),

  // Example table for demonstration
  todos: defineTable({
    text: v.string(),
    isCompleted: v.boolean(),
    createdAt: v.number(),
  }).index('by_createdAt', ['createdAt']),
});
