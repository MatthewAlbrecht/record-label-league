'use client';

import { useParams, useRouter } from 'next/navigation';
import { useQuery } from 'convex/react';
import { api } from 'convex/_generated/api';
import type { Id } from 'convex/_generated/dataModel';
import { ArrowLeft, Users } from 'lucide-react';
import { useState } from 'react';
import { getRosterStatusLabel } from '~/lib/enum-utils';

export default function RostersPage() {
  const params = useParams();
  const router = useRouter();
  const seasonId = (params?.seasonId as string) || '';

  const playersRosters = useQuery(api.dashboard.getAllPlayersRosters, {
    seasonId: seasonId as Id<'seasons'>,
  });

  if (!playersRosters) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-gray-500">Loading rosters...</p>
      </div>
    );
  }

  // Find max roster size for consistent row count
  const maxRosterSize = Math.max(...playersRosters.map((p) => p.roster.length), 0);

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
            {playersRosters.map((player) => (
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
                    <span>{player.roster.length} artists</span>
                    <span className="font-semibold text-indigo-600">{player.totalPoints}pts</span>
                  </div>
                </div>

                {/* Artist List */}
                <div className="flex-1 flex flex-col divide-y divide-gray-200">
                  {player.roster.map((artist) => (
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
                  {Array.from({ length: maxRosterSize - player.roster.length }).map(
                    (_, idx) => (
                      <div
                        key={`empty-${idx}`}
                        className="p-2 border-t border-gray-100 bg-gray-50"
                      />
                    )
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
