'use client';

import { useQuery } from 'convex/react';
import { api } from 'convex/_generated/api';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Zap } from 'lucide-react';
import { Card } from '~/components/ui/card';

export default function StandingsPage() {
  const params = useParams();
  const router = useRouter();
  const seasonId = (params?.seasonId as string) || '';

  console.log('seasonId', seasonId);

  const standingsData = useQuery(api.dashboard.getStandingsPageData, {
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
        <div className="inline-block border rounded">
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
      </div>
    </div>
  );
}

