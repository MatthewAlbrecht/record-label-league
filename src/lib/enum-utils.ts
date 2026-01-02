/**
 * Utility functions to convert enum values to friendly, human-readable strings
 */

export function getSeasonStatusLabel(status: string): string {
  const statusMap: Record<string, string> = {
    PRESEASON: 'Preseason',
    IN_PROGRESS: 'In Season',
    COMPLETED: 'Completed',
  };
  return statusMap[status] || status;
}

export function getPhaseLabel(phase: string): string {
  const phaseMap: Record<string, string> = {
    SEASON_SETUP: 'Season Setup',
    DRAFTING: 'Drafting',
    ADVANTAGE_SELECTION: 'Advantage Selection',
    READY_FOR_WEEK_1: 'Ready for Week 1',
    IN_SEASON_CHALLENGE_SELECTION: 'Challenge Selection',
    PLAYLIST_SUBMISSION: 'Playlist Submission',
    PLAYLIST_PRESENTATION: 'Playlist Presentation',
    VOTING: 'Voting',
    IN_SEASON_WEEK_END: 'Week End',
    ROSTER_EVOLUTION: 'Roster Evolution',
    WEEK_TRANSITION: 'Week Transition',
  };
  return phaseMap[phase] || phase;
}

export function getRosterStatusLabel(status: string): string {
  const statusMap: Record<string, string> = {
    ACTIVE: 'Active',
    BENCH: 'Bench',
    RETIRED: 'Retired',
  };
  return statusMap[status] || status;
}

export function getAdvantageStatusLabel(status: string): string {
  const statusMap: Record<string, string> = {
    AVAILABLE: 'Available',
    PLAYED: 'Played',
    EXPIRED: 'Expired',
  };
  return statusMap[status] || status;
}
