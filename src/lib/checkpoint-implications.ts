export interface CheckpointOption {
  id: string;
  title: string;
  phase: string;
  week: number;
  implications: string[];
  isAvailable: boolean;
  description: string;
}

export function getCheckpointImplications(
  currentPhase: string,
  currentWeek: number,
  seasonStatus?: 'PRESEASON' | 'IN_PROGRESS' | 'COMPLETED'
): CheckpointOption[] {
  const checkpoints: CheckpointOption[] = [
    {
      id: 'PRESEASON',
      title: 'Start of Preseason',
      phase: 'SEASON_SETUP',
      week: 0,
      description: 'Reset everything to the very beginning',
      implications: [
        'Draft positions will be cleared',
        'All draft picks and selections will be deleted',
        'All rosters will be cleared',
        'All advantages will be removed',
        'All challenges selections will be cleared',
        'Draft board prompts will be reset to OPEN',
      ],
      isAvailable: currentPhase !== 'SEASON_SETUP' || currentWeek !== 0,
    },
    {
      id: 'DRAFT',
      title: 'Start of Draft',
      phase: 'DRAFTING',
      week: 0,
      description: 'Keep draft order, clear all picks and progress',
      implications: [
        'Draft order will be preserved',
        'All draft picks and selections will be deleted',
        'All rosters will be cleared',
        'All advantages will be removed',
        'All challenges selections will be cleared',
        'Draft board prompts will be reset to OPEN',
      ],
      isAvailable:
        currentPhase !== 'DRAFTING' ||
        currentWeek !== 0 ||
        (currentPhase === 'DRAFTING' && currentWeek === 0),
    },
    {
      id: 'ADVANTAGE_SELECTION',
      title: 'Start of Advantage Selection',
      phase: 'ADVANTAGE_SELECTION',
      week: 0,
      description: 'Keep draft and rosters, clear advantages and challenges',
      implications: [
        'Draft picks and rosters will be preserved',
        'All advantages will be removed',
        'All challenge selections will be cleared',
        'All players will need to re-select advantages',
      ],
      isAvailable: currentPhase !== 'ADVANTAGE_SELECTION' || currentWeek !== 0,
    },
    {
      id: 'START_OF_SEASON',
      title: 'Start of Season (Week 1)',
      phase: 'IN_SEASON_CHALLENGE_SELECTION',
      week: 1,
      description: 'Keep pre-season setup, reset to Week 1',
      implications: [
        'Draft, rosters, and starting advantages will be preserved',
        'All Week 1+ challenge selections will be cleared',
        'All advantages earned in Week 1+ will be removed',
        'Players can restart from Week 1 challenge selection',
      ],
      isAvailable: seasonStatus === 'IN_PROGRESS',
    },
  ];

  // Add dynamic "Start of Current Week" option if in-season and week > 1
  if (seasonStatus === 'IN_PROGRESS') {
    checkpoints.push({
      id: `WEEK_${currentWeek}`,
      title: `Start of Week ${currentWeek}`,
      phase: 'IN_SEASON_CHALLENGE_SELECTION',
      week: currentWeek,
      description: `Preserve all data from previous weeks, reset to beginning of Week ${currentWeek}`,
      implications: [
        `All data from previous weeks will be preserved`,
        `All Week ${currentWeek}+ challenge selections will be cleared`,
        `All advantages earned in Week ${currentWeek}+ will be removed`,
        `All roster changes made in Week ${currentWeek}+ will be reversed`,
        `Players can restart from Week ${currentWeek} challenge selection`,
      ],
      isAvailable: true,
    });

    // Add "Start of this week's presentation phase" if in presentation, voting, week end, or roster evolution phase
    if (
      currentPhase === 'PLAYLIST_PRESENTATION' ||
      currentPhase === 'VOTING' ||
      currentPhase === 'IN_SEASON_WEEK_END' ||
      currentPhase === 'ROSTER_EVOLUTION'
    ) {
      checkpoints.push({
        id: `WEEK_${currentWeek}_PRESENTATION`,
        title: `Start of Week ${currentWeek} Presentation Phase`,
        phase: 'PLAYLIST_PRESENTATION',
        week: currentWeek,
        description: `Keep challenge selection and playlist submissions, reset presentation and voting`,
        implications: [
          `Challenge selection for Week ${currentWeek} will be preserved`,
          `Playlist submissions for Week ${currentWeek} will be preserved`,
          `Presentation state will be cleared`,
          `Voting session and votes will be deleted`,
          `Players can restart presentations from the beginning`,
        ],
        isAvailable: true,
      });
    }

    // Add "Start of Roster Evolution" if currently in ROSTER_EVOLUTION phase
    if (currentPhase === 'ROSTER_EVOLUTION') {
      checkpoints.push({
        id: `WEEK_${currentWeek}_ROSTER_EVOLUTION`,
        title: `Start of Week ${currentWeek} Roster Evolution`,
        phase: 'ROSTER_EVOLUTION',
        week: currentWeek,
        description: `Reset roster evolution to the beginning (cuts phase)`,
        implications: [
          `All cut artists will be restored to their original rosters`,
          `All redrafted artists will be removed`,
          `Artists drafted from the pool will return to available status`,
          `Prompt selection will be cleared`,
          `Roster evolution will restart from the cuts phase`,
          `Related game events will be deleted`,
        ],
        isAvailable: true,
      });
    }
  }

  return checkpoints;
}

export function getAvailableCheckpoints(
  currentPhase: string,
  currentWeek: number,
  seasonStatus?: 'PRESEASON' | 'IN_PROGRESS' | 'COMPLETED'
): CheckpointOption[] {
  return getCheckpointImplications(
    currentPhase,
    currentWeek,
    seasonStatus
  ).filter((cp) => cp.isAvailable);
}
