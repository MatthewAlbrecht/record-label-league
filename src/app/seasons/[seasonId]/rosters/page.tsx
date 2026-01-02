'use client';

import { useParams, useRouter } from 'next/navigation';
import { useQuery } from 'convex/react';
import { api } from 'convex/_generated/api';
import type { Id } from 'convex/_generated/dataModel';
import { ArrowLeft, Users } from 'lucide-react';
import { getRosterStatusLabel } from '~/lib/enum-utils';

export default function RostersPage() {
  const params = useParams();
  const router = useRouter();
  const seasonId = (params?.seasonId as string) || '';

  const playersRosters = useQuery(api.dashboard.getAllPlayersRosters, {
    seasonId: seasonId as Id<'seasons'>,
  });

  const poolArtists = useQuery(api.pool.getPoolArtists, {
    seasonId: seasonId as Id<'seasons'>,
  });

  if (!playersRosters) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-gray-500">Loading rosters...</p>
      </div>
    );
  }

  // Find max roster size for consistent row count (excluding CUT artists)
  const maxRosterSize = Math.max(
    ...playersRosters.map((p) => p.roster.filter((a) => a.status !== 'CUT').length),
    0
  );

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="w-full">
        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <button
            onClick={() => router.back()}
            className="p-1.5 hover:bg-gray-200 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Users className="w-6 h-6 text-indigo-600" />
            All Player Rosters
          </h1>
        </div>

        {/* Grid Layout */}
        <div className="overflow-x-auto">
          <div
            className="grid gap-2"
            style={{
              gridTemplateColumns: `repeat(${playersRosters.length}, minmax(180px, 1fr))`,
            }}
          >
            {/* Player Columns */}
            {playersRosters.map((player) => {
              const activeRoster = player.roster.filter((a) => a.status !== 'CUT');
              return (
                <div
                  key={player._id}
                  className="bg-white rounded border border-gray-200 overflow-hidden flex flex-col"
                >
                  {/* Player Header */}
                  <div className="bg-indigo-50 border-b border-gray-200 p-2">
                    <h2 className="font-bold text-sm text-gray-900 truncate">
                      {player.labelName}
                    </h2>
                    <p className="text-xs text-gray-600 truncate">{player.displayName}</p>
                    <div className="flex items-center justify-between text-xs text-gray-500 mt-1">
                      <span>{activeRoster.length} artists</span>
                      <span className="font-semibold text-indigo-600">{player.totalPoints}pts</span>
                    </div>
                  </div>

                  {/* Artist List */}
                  <div className="flex-1 flex flex-col divide-y divide-gray-200">
                    {activeRoster.map((artist) => (
                      <div
                        key={artist._id}
                        className="p-2 hover:bg-gray-50 transition-colors flex-1 flex items-center justify-between gap-2"
                      >
                        <p className="text-xs font-medium text-gray-900 truncate flex-1">
                          {artist.artistName}
                        </p>
                        <span
                          className={`px-1.5 py-0.5 rounded text-xs font-medium flex-shrink-0 ${artist.status === 'ACTIVE'
                            ? 'bg-green-100 text-green-800'
                            : artist.status === 'BENCH'
                              ? 'bg-yellow-100 text-yellow-800'
                              : 'bg-gray-100 text-gray-800'
                            }`}
                        >
                          {getRosterStatusLabel(artist.status)}
                        </span>
                      </div>
                    ))}

                    {/* Empty slots to maintain grid alignment */}
                    {Array.from({ length: maxRosterSize - activeRoster.length }).map(
                      (_, idx) => (
                        <div
                          key={`empty-${idx}`}
                          className="p-2 border-t border-gray-100 bg-gray-50"
                        />
                      )
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Pool Section */}
        {poolArtists && poolArtists.length > 0 && (
          <div className="mt-8">
            <h2 className="text-xl font-bold mb-3 flex items-center gap-2">
              <span className="text-2xl">🎱</span>
              The Pool
              <span className="text-sm font-normal text-gray-500">
                ({poolArtists.length} artist{poolArtists.length !== 1 ? 's' : ''})
              </span>
            </h2>
            <div className="inline-block border rounded bg-white">
              <table className="min-w-[400px]">
                <thead>
                  <tr className="bg-gray-100 border-b border-gray-200">
                    <th className="px-4 py-2 text-left text-xs font-bold text-gray-900">Artist</th>
                    <th className="px-3 py-2 text-center text-xs font-bold text-gray-900">Week Added</th>
                    <th className="px-4 py-2 text-left text-xs font-bold text-gray-900">Cut From</th>
                  </tr>
                </thead>
                <tbody>
                  {poolArtists
                    .sort((a, b) => (a.enteredPoolWeek ?? 0) - (b.enteredPoolWeek ?? 0))
                    .map((entry) => (
                      <tr key={entry._id} className="border-b border-gray-200 hover:bg-gray-50">
                        <td className="px-4 py-2">
                          <span className="text-sm font-medium text-gray-900">
                            {entry.artist?.name || 'Unknown'}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-center">
                          <span className="text-sm text-gray-600">
                            {entry.enteredPoolWeek ?? '-'}
                          </span>
                        </td>
                        <td className="px-4 py-2">
                          <span className="text-sm text-gray-600">
                            {entry.cutFromPlayer?.labelName || '-'}
                          </span>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
