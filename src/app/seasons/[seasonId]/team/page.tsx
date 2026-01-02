'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useQuery } from 'convex/react';
import { api } from 'convex/_generated/api';
import type { Id } from 'convex/_generated/dataModel';
import { useAuth } from '~/lib/auth-context';
import { Card } from '~/components/ui/card';
import { Badge } from '~/components/ui/badge';
import {
  Trophy,
  Music,
  Shield,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { getPhaseLabel, getRosterStatusLabel, getAdvantageStatusLabel } from '~/lib/enum-utils';

export default function TeamPage() {
  const params = useParams();
  const seasonId = (params?.seasonId as string) || '';
  const { user } = useAuth();

  // Get season players to find current user's season player
  const seasonPlayers = useQuery(api.seasons.getSeasonPlayers, {
    seasonId: seasonId as Id<'seasons'>,
  });

  // Find the current user's season player
  const currentSeasonPlayerId = seasonPlayers?.find(
    (p) => p.user?.id === user?.id
  )?._id;

  // Get dashboard data if we have a season player
  const dashboardData = useQuery(
    api.dashboard.getDashboardData,
    currentSeasonPlayerId
      ? { seasonPlayerId: currentSeasonPlayerId }
      : 'skip'
  );


  if (!dashboardData) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  if (!currentSeasonPlayerId) {
    return (
      <div className="container mx-auto py-6 px-4">
        <Card className="p-4 border-red-200 bg-red-50">
          <div className="flex gap-2">
            <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-red-900">Not a season player</p>
              <p className="text-xs text-red-800 mt-0.5">
                You are not registered as a player in this season.
              </p>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  const { season, player, roster: rawRoster, advantages } = dashboardData;
  
  // Filter out CUT artists and sort: draft picks first (by round), then pool/trade acquisitions (by week)
  const roster = rawRoster
    .filter((entry) => entry.status !== 'CUT')
    .sort((a, b) => {
      const aIsDraft = a.acquiredVia === 'DRAFT';
      const bIsDraft = b.acquiredVia === 'DRAFT';
      
      // Draft picks come first
      if (aIsDraft && !bIsDraft) return -1;
      if (!aIsDraft && bIsDraft) return 1;
      
      // Within draft picks, sort by round
      if (aIsDraft && bIsDraft) {
        return a.acquiredRound - b.acquiredRound;
      }
      
      // Non-draft picks sort by week acquired
      return a.acquiredAtWeek - b.acquiredAtWeek;
    });

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

  return (
    <div className="container mx-auto py-6 px-4 max-w-6xl">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-start justify-between mb-3">
          <h1 className="text-3xl font-bold">{season.name}</h1>
          <div className="flex gap-2">
            <Link
              href={`/seasons/${seasonId}/rosters`}
              className="px-3 py-1.5 text-sm bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition-colors"
            >
              View All Rosters
            </Link>
            <Link
              href={`/seasons/${seasonId}/standings`}
              className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
            >
              View Standings
            </Link>
          </div>
        </div>
        <div className="flex gap-4 text-xs text-gray-600">
          <span>
            <span className="font-medium">Week:</span> {season.currentWeek}
          </span>
          <span>
            <span className="font-medium">Phase:</span> {getPhaseLabel(season.currentPhase)}
          </span>
          <span>
            <span className="font-medium">Your Label:</span> {player.labelName}
          </span>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
        {/* Rank Card */}
        <Card className="p-4 bg-gradient-to-br from-yellow-50 to-yellow-100 border-yellow-200">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium text-yellow-800 mb-1.5">
                Current Rank
              </p>
              <p className="text-3xl font-bold text-yellow-900">
                #{player.rank}
              </p>
              <p className="text-xs text-yellow-700 mt-1.5">
                of {player.totalPlayers} players
              </p>
            </div>
            <Trophy className="w-10 h-10 text-yellow-600 opacity-30" />
          </div>
        </Card>

        {/* Points Card */}
        <Card className="p-4 bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium text-blue-800 mb-1.5">
                Total Points
              </p>
              <p className="text-3xl font-bold text-blue-900">
                {player.totalPoints}
              </p>
              <p className="text-xs text-blue-700 mt-1.5">Points earned</p>
            </div>
            <Music className="w-10 h-10 text-blue-600 opacity-30" />
          </div>
        </Card>

        {/* Advantages Card */}
        <Card className="p-4 bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium text-purple-800 mb-1.5">
                Advantages
              </p>
              <p className="text-3xl font-bold text-purple-900">
                {advantages.length}
              </p>
              <p className="text-xs text-purple-700 mt-1.5">In inventory</p>
            </div>
            <Shield className="w-10 h-10 text-purple-600 opacity-30" />
          </div>
        </Card>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Roster Section */}
        <div>
          <h2 className="text-xl font-bold mb-3 flex items-center gap-2">
            <Music className="w-5 h-5" />
            Your Roster
          </h2>

          {roster.length === 0 ? (
            <Card className="p-4 text-center text-gray-500">
              <p className="text-sm">No artists drafted yet</p>
            </Card>
          ) : (
            <div className="space-y-2">
              {roster.map((entry) => (
                <Card
                  key={entry._id}
                  className="p-3 hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <p className="font-semibold text-base">{entry.artistName}</p>
                      <p className="text-xs text-gray-600 mt-0.5">
                        {entry.promptText}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-2 flex-shrink-0">
                      <Badge variant="outline">
                        {entry.acquiredVia === 'DRAFT'
                          ? `Round ${entry.acquiredRound}`
                          : `Week ${entry.acquiredAtWeek}`}
                      </Badge>
                      <Badge
                        variant={
                          entry.status === 'ACTIVE' ? 'default' : 'secondary'
                        }
                      >
                        {getRosterStatusLabel(entry.status)}
                      </Badge>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Advantages Section */}
        <div>
          <h2 className="text-xl font-bold mb-3 flex items-center gap-2">
            <Shield className="w-5 h-5" />
            Your Advantages
          </h2>

          {advantages.length === 0 ? (
            <Card className="p-4 text-center text-gray-500">
              <p className="text-sm">No advantages assigned yet</p>
            </Card>
          ) : (
            <div className="space-y-2">
              {advantages.map((advantage) => {
                const tier = (advantage as any).tier || 0;
                const getTierColor = (tier: number) => {
                  if (tier === 1) return 'bg-purple-50 text-purple-600 border-purple-200';
                  if (tier === 2) return 'bg-purple-200 text-purple-800 border-purple-400';
                  if (tier === 3) return 'bg-purple-700 text-white border-purple-800';
                  return 'bg-purple-50 text-purple-600 border-purple-200';
                };

                return (
                  <Card key={advantage._id} className="p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-0.5">
                          <p className="font-semibold text-sm">{advantage.name}</p>
                          {tier > 0 && (
                            <Badge
                              className={`text-xs px-1.5 py-0 ${getTierColor(tier)}`}
                              variant="outline"
                            >
                              Tier {tier}
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-gray-600 mt-0.5">
                          {advantage.description}
                        </p>
                      </div>
                      {advantage.status !== 'AVAILABLE' && (
                        <Badge
                          className={`flex-shrink-0 ${getStatusColor(
                            advantage.status
                          )}`}
                          variant="outline"
                        >
                          {getAdvantageStatusLabel(advantage.status)}
                        </Badge>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </div>

    </div>
  );
}

