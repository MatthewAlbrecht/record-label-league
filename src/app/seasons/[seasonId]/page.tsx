'use client';

import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQuery } from 'convex/react';
import { api } from 'convex/_generated/api';
import type { Id } from 'convex/_generated/dataModel';
import { useAuth } from '~/lib/auth-context';
import { Button } from '~/components/ui/button';
import { Card } from '~/components/ui/card';
import { Loader2, ArrowRight, Calendar } from 'lucide-react';
import { getSeasonStatusLabel, getPhaseLabel } from '~/lib/enum-utils';

export default function SeasonPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const seasonId = (params?.seasonId as string) || '';

  const season = useQuery(api.seasons.getSeason, {
    seasonId: seasonId as Id<'seasons'>,
  });

  const currentChallenge = useQuery(api.challenges.getCurrentChallenge, {
    seasonId: seasonId as Id<'seasons'>,
  });

  // Get season players to find current user's season player
  const seasonPlayers = useQuery(api.seasons.getSeasonPlayers, {
    seasonId: seasonId as Id<'seasons'>,
  });

  // Find the current user's season player
  const currentSeasonPlayerId = seasonPlayers?.find(
    (p) => p.user?.id === user?.id
  )?._id;

  // Get option selection status if challenge exists and has options
  const optionSelectionStatus = useQuery(
    api.challenges.getOptionSelectionStatus,
    currentChallenge &&
      currentChallenge.challenge.options &&
      currentChallenge.challenge.options.length > 0 &&
      season?.currentPhase === 'IN_SEASON_CHALLENGE_SELECTION'
      ? { seasonId: seasonId as Id<'seasons'> }
      : 'skip'
  );

  if (!season || !user) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  const isCommissioner = season.league.commissioner.id === (user?.id as any);

  console.log('season.currentPhase === IN_SEASON_CHALLENGE_SELECTION', season.currentPhase === 'IN_SEASON_CHALLENGE_SELECTION')
  console.log('!currentChallenge', !currentChallenge)
  console.log('season.currentPhase === IN_SEASON_CHALLENGE_SELECTION && !currentChallenge', season.currentPhase === 'IN_SEASON_CHALLENGE_SELECTION' && !currentChallenge)

  return (
    <div className="container mx-auto py-6 px-4">
      {/* Admin Back Button - Commissioner Only */}
      {isCommissioner && (
        <button
          onClick={() => router.push(`/seasons/${seasonId}/admin`)}
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-purple-600 hover:text-purple-800 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
          </svg>
          Admin Dashboard
        </button>
      )}

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-1">{season.name}</h1>
        <p className="text-sm text-gray-600">
          League: <span className="font-medium">{season.league.name}</span>
        </p>
      </div>

      {/* Season Status */}
      <div className="mb-6 pb-4 border-b border-gray-200">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <div>
            <p className="text-xs text-gray-500 mb-1">Status</p>
            <p className="text-sm font-medium">{getSeasonStatusLabel(season.status)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">Current Phase</p>
            <p className="text-sm font-medium">{getPhaseLabel(season.currentPhase)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">Week</p>
            <p className="text-sm font-medium">{season.currentWeek}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">Roster Size</p>
            <p className="text-sm font-medium">{season.config.rosterSize}</p>
          </div>
        </div>
      </div>

      {/* This Week's Challenge */}
      {currentChallenge && (
        <div className="mb-8">
          <Link href={`/seasons/${seasonId}/challenge`}>
            <div className="p-4 border border-gray-200 rounded-lg hover:border-blue-300 hover:bg-blue-50/50 transition-colors cursor-pointer">
              <p className="text-xs text-gray-500 mb-1.5 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5" />
                This Week&apos;s Challenge
              </p>
              <h3 className="font-semibold text-gray-900 mb-1 flex items-center gap-2">
                <span>{currentChallenge.challenge.emoji}</span>
                <span>{currentChallenge.challenge.title}</span>
              </h3>
              <p className="text-sm text-gray-600 mb-2 line-clamp-2">
                {currentChallenge.challenge.description}
              </p>
              <p className="text-xs text-gray-500">
                Selected by {currentChallenge.picker.labelName}
              </p>
              {optionSelectionStatus &&
                !optionSelectionStatus.isComplete &&
                currentChallenge.challenge.options &&
                currentChallenge.challenge.options.length > 0 && (
                  <p className="text-xs text-yellow-700 mt-2 font-medium">
                    ⚠️ Options need to be selected
                  </p>
                )}
            </div>
          </Link>
        </div>
      )}

      {/* Live Presentation Link - Show during PLAYLIST_PRESENTATION phase */}
      {season.currentPhase === 'PLAYLIST_PRESENTATION' && (
        <div className="mb-8">
          <Link href={`/seasons/${seasonId}/presentation`}>
            <div className="p-6 border-2 border-purple-200 rounded-lg bg-purple-50 hover:bg-purple-100 hover:border-purple-300 transition-all cursor-pointer shadow-sm hover:shadow-md flex items-center justify-between group">
              <div>
                <p className="text-xs font-bold text-purple-600 uppercase tracking-wide mb-1 flex items-center gap-1.5 animate-pulse">
                  <span className="w-2 h-2 rounded-full bg-purple-600"></span>
                  Live Now
                </p>
                <h3 className="text-xl font-bold text-purple-900 mb-1">
                  Join the Playlist Presentation
                </h3>
                <p className="text-sm text-purple-800">
                  Watch the live reveal of everyone's playlists for this week!
                </p>
              </div>
              <div className="text-purple-600 bg-white p-3 rounded-full shadow-sm group-hover:scale-110 transition-transform">
                <ArrowRight className="w-6 h-6" />
              </div>
            </div>
          </Link>
        </div>
      )}

      {/* Challenge Selection Link - Show during IN_SEASON_CHALLENGE_SELECTION phase */}
      {season.currentPhase === 'IN_SEASON_CHALLENGE_SELECTION' && !currentChallenge && (
        <div className="mb-8">
          <Link href={`/seasons/${seasonId}/challenge-select`}>
            <div className="p-6 border-2 border-rose-200 rounded-lg bg-rose-50 hover:bg-rose-100 hover:border-rose-300 transition-all cursor-pointer shadow-sm hover:shadow-md flex items-center justify-between group">
              <div>
                <p className="text-xs font-bold text-rose-600 uppercase tracking-wide mb-1 flex items-center gap-1.5 animate-pulse">
                  <span className="w-2 h-2 rounded-full bg-rose-600"></span>
                  Active Now
                </p>
                <h3 className="text-xl font-bold text-rose-900 mb-1">
                  Challenge Selection
                </h3>
                <p className="text-sm text-rose-800">
                  Week {season.currentWeek} - Pick the challenge for all players
                </p>
              </div>
              <div className="text-rose-600 bg-white p-3 rounded-full shadow-sm group-hover:scale-110 transition-transform">
                <ArrowRight className="w-6 h-6" />
              </div>
            </div>
          </Link>
        </div>
      )}

      {/* Roster Evolution Link - Show during ROSTER_EVOLUTION phase */}
      {season.currentPhase === 'ROSTER_EVOLUTION' && (
        <div className="mb-8">
          <Link href={`/seasons/${seasonId}/roster-evolution`}>
            <div className="p-6 border-2 border-indigo-200 rounded-lg bg-indigo-50 hover:bg-indigo-100 hover:border-indigo-300 transition-all cursor-pointer shadow-sm hover:shadow-md flex items-center justify-between group">
              <div>
                <p className="text-xs font-bold text-indigo-600 uppercase tracking-wide mb-1 flex items-center gap-1.5 animate-pulse">
                  <span className="w-2 h-2 rounded-full bg-indigo-600"></span>
                  Active Now
                </p>
                <h3 className="text-xl font-bold text-indigo-900 mb-1">
                  Roster Evolution
                </h3>
                <p className="text-sm text-indigo-800">
                  Cut artists and redraft for Week {season.currentWeek}
                </p>
              </div>
              <div className="text-indigo-600 bg-white p-3 rounded-full shadow-sm group-hover:scale-110 transition-transform">
                <ArrowRight className="w-6 h-6" />
              </div>
            </div>
          </Link>
        </div>
      )}

      {/* Award Show Voting Link - Show during VOTING phase */}
      {season.currentPhase === 'VOTING' && (
        <div className="mb-8">
          <Link href={`/seasons/${seasonId}/vote`}>
            <div className="p-6 border-2 border-green-200 rounded-lg bg-green-50 hover:bg-green-100 hover:border-green-300 transition-all cursor-pointer shadow-sm hover:shadow-md flex items-center justify-between group">
              <div>
                <p className="text-xs font-bold text-green-600 uppercase tracking-wide mb-1 flex items-center gap-1.5 animate-pulse">
                  <span className="w-2 h-2 rounded-full bg-green-600"></span>
                  Live Now
                </p>
                <h3 className="text-xl font-bold text-green-900 mb-1">
                  Award Show Voting
                </h3>
                <p className="text-sm text-green-800">
                  Vote on Week {season.currentWeek} award categories!
                </p>
              </div>
              <div className="text-green-600 bg-white p-3 rounded-full shadow-sm group-hover:scale-110 transition-transform">
                <ArrowRight className="w-6 h-6" />
              </div>
            </div>
          </Link>
        </div>
      )}

      {/* Main Actions */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
        {/* Team Link - Always available to players */}
        <button
          onClick={() => router.push(`/seasons/${seasonId}/team`)}
          className="rounded border border-indigo-200 bg-indigo-50/50 p-4 text-left transition hover:bg-indigo-100 hover:border-indigo-300 flex items-center justify-between"
        >
          <div>
            <h3 className="font-medium text-indigo-900">
              My Team
            </h3>
            <p className="mt-1 text-xs text-indigo-700">
              View your standing, roster, and advantages
            </p>
          </div>
          <div className="text-indigo-600 ml-3 flex-shrink-0">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </div>
        </button>

        {/* Standings Link - Always available */}
        <button
          onClick={() => router.push(`/seasons/${seasonId}/standings`)}
          className="rounded border border-yellow-200 bg-yellow-50/50 p-4 text-left transition hover:bg-yellow-100 hover:border-yellow-300 flex items-center justify-between"
        >
          <div>
            <h3 className="font-medium text-yellow-900">
              Season Standings
            </h3>
            <p className="mt-1 text-xs text-yellow-700">
              View all player rankings and challenge picker
            </p>
          </div>
          <div className="text-yellow-600 ml-3 flex-shrink-0">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </div>
        </button>

        {/* All Rosters Link - Always available */}
        <button
          onClick={() => router.push(`/seasons/${seasonId}/rosters`)}
          className="rounded border border-indigo-200 bg-indigo-50/50 p-4 text-left transition hover:bg-indigo-100 hover:border-indigo-300 flex items-center justify-between"
        >
          <div>
            <h3 className="font-medium text-indigo-900">
              All Player Rosters
            </h3>
            <p className="mt-1 text-xs text-indigo-700">
              View everyone's drafted artists and rosters
            </p>
          </div>
          <div className="text-indigo-600 ml-3 flex-shrink-0">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </div>
        </button>

        {/* Draft Board Link - Show during DRAFTING phase */}
        {season.currentPhase === 'DRAFTING' && (
          <button
            onClick={() => router.push(`/seasons/${seasonId}/draft`)}
            className="rounded border border-blue-200 bg-blue-50/50 p-4 text-left transition hover:bg-blue-100 hover:border-blue-300 flex items-center justify-between"
          >
            <div>
              <h3 className="font-medium text-blue-900">
                Live Draft Board
              </h3>
              <p className="mt-1 text-xs text-blue-700">
                Join the draft and start picking artists
              </p>
            </div>
            <div className="text-blue-600 ml-3 flex-shrink-0">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </div>
          </button>
        )}

        {/* Advantage Selection Link - Show during ADVANTAGE_SELECTION phase */}
        {season.currentPhase === 'ADVANTAGE_SELECTION' && isCommissioner && (
          <button
            onClick={() => router.push(`/seasons/${seasonId}/advantage-selection`)}
            className="rounded border border-amber-200 bg-amber-50/50 p-4 text-left transition hover:bg-amber-100 hover:border-amber-300 flex items-center justify-between"
          >
            <div>
              <h3 className="font-medium text-amber-900">
                Advantage Selection
              </h3>
              <p className="mt-1 text-xs text-amber-700">
                Assign starting Tier 1 advantages to players
              </p>
            </div>
            <div className="text-amber-600 ml-3 flex-shrink-0">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </div>
          </button>
        )}


        {/* Challenge Board Link - Always available during in-season play */}
        {season.status === 'IN_PROGRESS' && (
          <button
            onClick={() => router.push(`/seasons/${seasonId}/board`)}
            className="rounded border border-orange-200 bg-orange-50/50 p-4 text-left transition hover:bg-orange-100 hover:border-orange-300 flex items-center justify-between"
          >
            <div>
              <h3 className="font-medium text-orange-900">
                Challenge Board
              </h3>
              <p className="mt-1 text-xs text-orange-700">
                View the current week's challenge
              </p>
            </div>
            <div className="text-orange-600 ml-3 flex-shrink-0">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </div>
          </button>
        )}



        {/* Event Log - Commissioner Only */}
        {isCommissioner && (
          <button
            onClick={() => router.push(`/seasons/${seasonId}/events`)}
            className="rounded border border-green-200 bg-green-50/50 p-4 text-left transition hover:bg-green-100 hover:border-green-300 flex items-center justify-between"
          >
            <div>
              <h3 className="font-medium text-green-900">
                Event Log
              </h3>
              <p className="mt-1 text-xs text-green-700">
                View all game actions and history
              </p>
            </div>
            <div className="text-green-600 ml-3 flex-shrink-0">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </div>
          </button>
        )}
      </div>

      {/* Info Box */}
      {season.currentPhase === 'SEASON_SETUP' && (
        <Card className="p-6 border-yellow-200 bg-yellow-50">
          <h3 className="font-semibold text-yellow-900 mb-2">Season Setup in Progress</h3>
          <p className="text-sm text-yellow-800">
            The commissioner is currently setting up the season. Check back soon when the draft is ready!
          </p>
        </Card>
      )}
    </div>
  );
}


