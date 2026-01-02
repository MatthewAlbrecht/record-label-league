'use client';

import { useQuery } from 'convex/react';
import { api } from 'convex/_generated/api';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Zap, ExternalLink } from 'lucide-react';
import { Card } from '~/components/ui/card';

export default function StandingsPage() {
  const params = useParams();
  const router = useRouter();
  const seasonId = (params?.seasonId as string) || '';

  console.log('seasonId', seasonId);

  const standingsData = useQuery(api.dashboard.getStandingsPageData, {
    seasonId: seasonId as any,
  });

  const weeklyHistory = useQuery(api.dashboard.getWeeklyHistory, {
    seasonId: seasonId as any,
  });

  const currentChallenge = useQuery(
    api.challenges.getCurrentChallenge,
    standingsData && standingsData.season.currentPhase === 'IN_SEASON_CHALLENGE_SELECTION'
      ? { seasonId: seasonId as any }
      : 'skip'
  );

  if (!standingsData) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-gray-500">Loading standings...</p>
      </div>
    );
  }

  const isInSeason = standingsData.season.currentPhase === 'IN_SEASON_CHALLENGE_SELECTION';
  const isSeasonInProgress = standingsData.season.status === 'IN_PROGRESS';

  // Hide standings page until season starts
  if (!isSeasonInProgress) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <p className="text-gray-500 mb-2">Standings will be available once the season starts.</p>
          <Link
            href={`/seasons/${seasonId}`}
            className="text-blue-500 hover:underline"
          >
            Back to Season
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.back()}
              className="p-1.5 hover:bg-gray-200 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <span className="text-3xl">🏆</span>
                Season Standings
              </h1>
              <p className="text-xs text-gray-600 mt-1">{standingsData.season.name}</p>
            </div>
          </div>
        </div>

        {/* Challenge Picker Section */}
        {isInSeason && (standingsData.currentPicker || standingsData.nextPicker) && (
          <div className="flex flex-col md:flex-row gap-3 mb-4">
            {/* Current Picker */}
            {standingsData.currentPicker && (
              <div className="bg-blue-50 border border-blue-200 rounded p-3 w-[280px]">
                <div className="flex items-center gap-2 mb-2">
                  <Zap className="w-4 h-4 text-blue-600" />
                  <h2 className="text-sm font-bold text-blue-900">
                    Week {standingsData.season.currentWeek} Picker
                  </h2>
                </div>
                <div>
                  {currentChallenge ? (
                    <>
                      <p className="text-xs text-gray-600 mb-1">Selected challenge</p>
                      <Link
                        href={`/seasons/${seasonId}/challenge`}
                        className="block text-base font-bold text-blue-900 hover:text-blue-700 hover:underline mt-1"
                      >
                        <span className="mr-1">{currentChallenge.challenge.emoji}</span>
                        {currentChallenge.challenge.title}
                      </Link>
                      <p className="text-xs text-gray-600 mt-1">
                        Selected by {standingsData.currentPicker.labelName}
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-xs text-gray-600">Selecting challenge</p>
                      <p className="text-base font-bold text-blue-900 mt-1">
                        {standingsData.currentPicker.labelName}
                      </p>
                      <p className="text-xs text-gray-600">
                        {standingsData.currentPicker.displayName}
                      </p>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Next Picker */}
            {standingsData.nextPicker && (
              <div className="bg-purple-50 border border-purple-200 rounded p-3 w-[280px]">
                <div className="flex items-center gap-2 mb-2">
                  <Zap className="w-4 h-4 text-purple-600" />
                  <h2 className="text-sm font-bold text-purple-900">
                    Week {standingsData.season.currentWeek + 1} Picker
                  </h2>
                </div>
                <div>
                  <p className="text-xs text-gray-600">Up next</p>
                  <p className="text-base font-bold text-purple-900 mt-1">
                    {standingsData.nextPicker.labelName}
                  </p>
                  <p className="text-xs text-gray-600">
                    {standingsData.nextPicker.displayName}
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Standings Table */}
        <div className="inline-block border rounded mb-8">
          <table className="min-w-[500px]">
            <thead>
              <tr className="bg-gray-100 border-b border-gray-200">
                <th className="w-16 px-3 py-2 text-center text-xs font-bold text-gray-900">Rank</th>
                <th className="px-4 py-2 text-left text-xs font-bold text-gray-900">Label</th>
                <th className="px-4 py-2 text-left text-xs font-bold text-gray-900">Player</th>
                <th className="w-20 px-3 py-2 text-right text-xs font-bold text-gray-900">Points</th>
                <th className="px-3 py-2 text-right text-xs font-bold text-gray-900 hidden sm:table-cell">Record</th>
              </tr>
            </thead>
            <tbody>
              {standingsData.players.map((player, idx) => {
                const isCurrentPicker =
                  standingsData.currentPicker?._id === player._id;

                return (
                  <tr
                    key={player._id}
                    className={`border-b border-gray-200 transition-colors ${isCurrentPicker
                      ? 'bg-blue-50 hover:bg-blue-100'
                      : 'hover:bg-gray-50'
                      }`}
                  >
                    <td className="px-3 py-2 text-center">
                      {player.rank === 1 ? (
                        <span className="text-lg">🥇</span>
                      ) : player.rank === 2 ? (
                        <span className="text-lg">🥈</span>
                      ) : player.rank === 3 ? (
                        <span className="text-lg">🥉</span>
                      ) : (
                        <span className="text-sm font-bold text-gray-600">
                          {player.rank}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      <p className="text-sm font-semibold text-gray-900">{player.labelName}</p>
                    </td>
                    <td className="px-4 py-2">
                      <p className="text-sm text-gray-600">{player.displayName}</p>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <p className="text-sm font-bold text-gray-900">
                        {player.totalPoints}
                      </p>
                    </td>
                    <td className="px-3 py-2 text-right text-xs text-gray-500 hidden sm:table-cell">
                      {player.record?.wins || 0}-{player.record?.seconds || 0}-{player.record?.thirds || 0}-{player.record?.fourths || 0}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Weekly History Table */}
        {weeklyHistory && weeklyHistory.length > 0 && (
          <div>
            <h2 className="text-xl font-bold mb-3 flex items-center gap-2">
              <span className="text-2xl">📅</span>
              Weekly History
            </h2>
            <div className="overflow-x-auto border rounded">
              <table className="min-w-full">
                <thead>
                  <tr className="bg-gray-100 border-b border-gray-200">
                    <th className="w-16 px-3 py-2 text-center text-xs font-bold text-gray-900">Week</th>
                    <th className="px-4 py-2 text-left text-xs font-bold text-gray-900">Challenge</th>
                    <th className="px-3 py-2 text-left text-xs font-bold text-gray-900">Picked By</th>
                    <th className="px-3 py-2 text-center text-xs font-bold text-gray-900">🥇 1st</th>
                    <th className="px-3 py-2 text-center text-xs font-bold text-gray-900">🥈 2nd</th>
                    <th className="px-3 py-2 text-center text-xs font-bold text-gray-900">🥉 3rd</th>
                    <th className="px-3 py-2 text-center text-xs font-bold text-gray-900">4th</th>
                  </tr>
                </thead>
                <tbody>
                  {weeklyHistory.map((week) => {
                    // Use filter to get all players at each placement (handles ties)
                    const firsts = week.placements.filter((p) => p.placement === 1);
                    const seconds = week.placements.filter((p) => p.placement === 2);
                    const thirds = week.placements.filter((p) => p.placement === 3);
                    const fourths = week.placements.filter((p) => p.placement === 4);

                    const renderPlacements = (placements: typeof firsts) => {
                      if (placements.length === 0) return <span className="text-gray-400">-</span>;
                      return (
                        <div className="flex flex-col items-center gap-0.5">
                          {placements.map((placement) => (
                            <div key={placement.playerId} className="flex items-center justify-center gap-1">
                              <span className="text-sm font-medium">{placement.labelName}</span>
                              {placement.playlistUrl && (
                                <a
                                  href={placement.playlistUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-green-600 hover:text-green-800"
                                  title="Open playlist"
                                >
                                  <ExternalLink className="w-3 h-3" />
                                </a>
                              )}
                            </div>
                          ))}
                        </div>
                      );
                    };

                    return (
                      <tr key={week.weekNumber} className="border-b border-gray-200 hover:bg-gray-50">
                        <td className="px-3 py-2 text-center">
                          <span className="text-sm font-bold text-gray-900">{week.weekNumber}</span>
                        </td>
                        <td className="px-4 py-2">
                          {week.challenge ? (
                            <div>
                              <p className="text-sm font-semibold">
                                <span className="mr-1">{week.challenge.emoji}</span>
                                {week.challenge.title}
                              </p>
                              {week.challenge.generalVibe && (
                                <p className="text-xs text-gray-500 italic">{week.challenge.generalVibe}</p>
                              )}
                            </div>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <span className="text-sm text-gray-700">{week.pickedBy.labelName}</span>
                        </td>
                        <td className="px-3 py-2 text-center">{renderPlacements(firsts)}</td>
                        <td className="px-3 py-2 text-center">{renderPlacements(seconds)}</td>
                        <td className="px-3 py-2 text-center">{renderPlacements(thirds)}</td>
                        <td className="px-3 py-2 text-center">{renderPlacements(fourths)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

