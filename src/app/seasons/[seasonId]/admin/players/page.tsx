'use client';

import { useParams } from 'next/navigation';
import { useQuery } from 'convex/react';
import { api } from 'convex/_generated/api';
import type { Id } from 'convex/_generated/dataModel';
import { useAuth } from '~/lib/auth-context';
import { Badge } from '~/components/ui/badge';
import {
  Users,
  Loader2,
} from 'lucide-react';
import { getRosterStatusLabel, getAdvantageStatusLabel } from '~/lib/enum-utils';

export default function AdminPlayersPage() {
  const params = useParams();
  const seasonId = (params?.seasonId as string) || '';
  const { user } = useAuth();

  // Get season to verify commissioner
  const season = useQuery(api.seasons.getSeason, {
    seasonId: seasonId as Id<'seasons'>,
  });

  // Get all player details
  const allPlayerDetails = useQuery(api.dashboard.getAllPlayerDetailsForCommissioner, {
    seasonId: seasonId as Id<'seasons'>,
  });

  if (!season || !user) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  const isCommissioner = season.league.commissioner.id === (user?.id as any);

  if (!isCommissioner) {
    return (
      <div className="container mx-auto py-4 px-2">
        <div className="p-2 border border-red-200 bg-red-50 rounded">
          <p className="text-red-900 font-semibold text-sm">
            Only commissioners can access this page
          </p>
        </div>
      </div>
    );
  }

  if (!allPlayerDetails) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'AVAILABLE':
        return 'bg-green-100 text-green-800';
      case 'PLAYED':
        return 'bg-blue-100 text-blue-800';
      case 'EXPIRED':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  // Find max roster size to determine table rows
  const maxRosterSize = Math.max(
    ...allPlayerDetails.map((p) => p.roster.length),
    0
  );

  // Find max advantages count to determine table rows
  const maxAdvantagesCount = Math.max(
    ...allPlayerDetails.map((p) => p.advantages.length),
    0
  );

  return (
    <div className="container mx-auto py-4 px-2">
      {/* Header */}
      <div className="mb-4">
        <h1 className="text-2xl font-bold mb-1 flex items-center gap-2">
          <Users className="w-5 h-5" />
          Players Overview
        </h1>
        <p className="text-gray-600 text-sm">
          View standings, rosters, and inventories for all players
        </p>
      </div>

      {/* Placement/Points Table */}
      <div className="mb-4">
        <h2 className="text-sm font-semibold mb-2">Placement & Points</h2>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse border border-gray-300">
            <thead>
              <tr className="bg-gray-100">
                <th className="border border-gray-300 px-2 py-1 text-left text-xs font-semibold sticky left-0 bg-gray-100 z-10">
                  Metric
                </th>
                {allPlayerDetails.map((player) => (
                  <th
                    key={player._id}
                    className="border border-gray-300 px-2 py-1 text-xs font-semibold"
                  >
                    {player.labelName}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border border-gray-300 px-2 py-1 text-xs font-medium sticky left-0 bg-white">
                  Rank
                </td>
                {allPlayerDetails.map((player) => (
                  <td
                    key={player._id}
                    className="border border-gray-300 px-2 py-1 text-xs text-center"
                  >
                    #{player.rank}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="border border-gray-300 px-2 py-1 text-xs font-medium sticky left-0 bg-white">
                  Total Points
                </td>
                {allPlayerDetails.map((player) => (
                  <td
                    key={player._id}
                    className="border border-gray-300 px-2 py-1 text-xs text-center"
                  >
                    {player.totalPoints}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Roster Table */}
      <div className="mb-4">
        <h2 className="text-sm font-semibold mb-2">Roster</h2>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse border border-gray-300">
            <thead>
              <tr className="bg-gray-100">
                <th className="border border-gray-300 px-2 py-1 text-left text-xs font-semibold sticky left-0 bg-gray-100 z-10">
                  Round
                </th>
                {allPlayerDetails.map((player) => (
                  <th
                    key={player._id}
                    className="border border-gray-300 px-2 py-1 text-xs font-semibold"
                  >
                    {player.labelName}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {maxRosterSize > 0 ? (
                Array.from({ length: maxRosterSize }, (_, roundIndex) => {
                  const round = roundIndex + 1;
                  return (
                    <tr key={round}>
                      <td className="border border-gray-300 px-2 py-1 text-xs font-medium sticky left-0 bg-white">
                        R{round}
                      </td>
                      {allPlayerDetails.map((player) => {
                        const rosterEntry = player.roster.find(
                          (r) => r.acquiredRound === round
                        );
                        return (
                          <td
                            key={player._id}
                            className="border border-gray-300 px-2 py-1 text-xs"
                          >
                            {rosterEntry ? (
                              <div>
                                <div className="font-medium">
                                  {rosterEntry.artistName}
                                </div>
                                <div className="mt-1">
                                  <Badge
                                    variant={
                                      rosterEntry.status === 'ACTIVE'
                                        ? 'default'
                                        : 'secondary'
                                    }
                                    className="text-[10px] px-1 py-0"
                                  >
                                    {getRosterStatusLabel(rosterEntry.status)}
                                  </Badge>
                                </div>
                              </div>
                            ) : (
                              <span className="text-gray-400">—</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td
                    colSpan={allPlayerDetails.length + 1}
                    className="border border-gray-300 px-2 py-1 text-xs text-gray-500 text-center"
                  >
                    No roster entries
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Advantages Table */}
      <div className="mb-4">
        <h2 className="text-sm font-semibold mb-2">Advantages</h2>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse border border-gray-300">
            <thead>
              <tr className="bg-gray-100">
                {allPlayerDetails.map((player) => (
                  <th
                    key={player._id}
                    className="border border-gray-300 px-2 py-1 text-xs font-semibold"
                  >
                    {player.labelName}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {maxAdvantagesCount > 0 ? (
                Array.from({ length: maxAdvantagesCount }, (_, index) => (
                  <tr key={index}>
                    {allPlayerDetails.map((player) => {
                      const advantage = player.advantages[index];
                      return (
                        <td
                          key={player._id}
                          className="border border-gray-300 px-2 py-1 text-xs"
                        >
                          {advantage ? (
                            <div>
                              <div className="font-medium">{advantage.name}</div>
                              {advantage.status !== 'AVAILABLE' && (
                                <Badge
                                  className={`text-[10px] px-1 py-0 mt-0.5 ${getStatusColor(
                                    advantage.status
                                  )}`}
                                  variant="outline"
                                >
                                  {getAdvantageStatusLabel(advantage.status)}
                                </Badge>
                              )}
                            </div>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan={allPlayerDetails.length}
                    className="border border-gray-300 px-2 py-1 text-xs text-gray-500 text-center"
                  >
                    No advantages assigned
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
