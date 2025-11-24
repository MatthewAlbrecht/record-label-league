'use client';

import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation } from 'convex/react';
import { api } from 'convex/_generated/api';
import type { Id } from 'convex/_generated/dataModel';
import { useState, useEffect } from 'react';
import { Loader2, RotateCcw } from 'lucide-react';
import { Button } from '~/components/ui/button';
import { Card } from '~/components/ui/card';
import { useAuth } from '~/lib/auth-context';
import { toast } from 'sonner';
import DraftBoard from './components/draft-board';
import TurnIndicator from './components/turn-indicator';
import RosterDisplay from './components/roster-display';
import DraftHistory from './components/draft-history';
import ArtistSelectionPanel from './components/artist-selection-panel';

export default function DraftPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const seasonId = (params?.seasonId as string) || '';

  const draftState = useQuery(api.drafts.getDraftState, {
    seasonId: seasonId as Id<'seasons'>,
  });

  const season = useQuery(api.seasons.getSeason, {
    seasonId: seasonId as Id<'seasons'>,
  });

  const resetDraft = useMutation(api.drafts.resetDraft);

  const [selectedPromptId, setSelectedPromptId] = useState<string | null>(null);
  const [artistName, setArtistName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [resetting, setResetting] = useState(false);

  const isCommissioner = season?.league?.commissioner?.id === user?.id;

  // Find the selected prompt from the current round (persistent across reloads)
  // Only count SELECTED prompts (not RETIRED) for the current round
  const selectedPromptThisRound = draftState?.allPrompts?.find(
    (p: any) => 
      p.status === 'SELECTED' && 
      p.selectedAtRound === draftState?.currentRound &&
      (p.status || 'OPEN') !== 'RETIRED'
  );

  // Only show the panel if there's a selected prompt for the current round
  // Don't fall back to local state, as that would show stale data from previous rounds
  const activeSelectedPromptId = selectedPromptThisRound?._id;

  const handleResetDraft = async () => {
    if (!window.confirm('🚨 WARNING: This will completely reset the draft to its initial state.\n\nAll selections, picks, and rosters will be deleted.\n\nAre you absolutely sure?')) {
      return;
    }

    try {
      setResetting(true);
      await resetDraft({
        seasonId: seasonId as Id<'seasons'>,
        requestingUserId: user?.id as Id<'users'>,
        randomizeDraftOrder: false, // Keep existing draft order when resetting from draft UI
      });
      toast.success('Draft reset to initial state - draft order preserved');
      // Refetch the draft state
      router.refresh();
    } catch (err) {
      toast.error((err as Error).message || 'Failed to reset draft');
    } finally {
      setResetting(false);
    }
  };

  if (draftState === undefined) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  if (draftState === null) {
    return (
      <div className="container mx-auto py-8">
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-8 text-center">
          <h1 className="text-3xl font-bold text-yellow-900 mb-4">
            Draft Not Initialized
          </h1>
          <p className="text-yellow-700 mb-6">
            Please initialize the draft first. Make sure the season is in DRAFTING phase.
          </p>
          <Button onClick={() => router.back()}>Go Back</Button>
        </div>
      </div>
    );
  }

  if (draftState.isComplete) {
    // Build draft summary table: round x player grid
    const rounds = 8;
    const draftSummary: { [key: number]: { [key: string]: string } } = {};

    // Initialize rounds
    for (let i = 1; i <= rounds; i++) {
      draftSummary[i] = {};
    }

    // Populate with artist picks grouped by round and player
    draftState.rosters.forEach((roster: any) => {
      roster.artists.forEach((artist: any) => {
        const round = artist.rosterEntry.acquiredAtRound;
        const playerLabel = roster.player?.labelName || 'Unknown';
        draftSummary[round][playerLabel] = artist.name;
      });
    });

    // Get unique player labels in order
    const playerLabels = Array.from(
      new Set(draftState.rosters.map((r: any) => r.player?.labelName || 'Unknown'))
    );

    return (
      <div className="container mx-auto py-8 px-4 lg:px-0">
        <div className="bg-green-50 border border-green-200 rounded-lg p-8 mb-8">
          <h1 className="text-3xl font-bold text-green-900 mb-4">
            🎉 Draft Complete!
          </h1>
          <p className="text-green-700 mb-4">
            All rosters have been locked with {draftState.rosters[0]?.artists.length || 0} artists each.
          </p>
          <p className="text-green-700 mb-6">
            Phase has auto-advanced to ADVANTAGE_SELECTION.
          </p>
          <Button size="lg" onClick={() => router.push(`/seasons/${seasonId}/advantage-selection`)}>
            Proceed to Advantage Selection
          </Button>
        </div>

        {/* Draft Summary Table */}
        <div className="bg-white rounded-lg p-6 border border-gray-200 overflow-x-auto">
          <h2 className="text-2xl font-bold mb-4">Draft Summary</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-2 border-gray-300 bg-gray-50">
                <th className="text-left py-3 px-3 font-semibold w-16">Round</th>
                {playerLabels.map((label) => (
                  <th key={label} className="text-left py-3 px-3 font-semibold">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: rounds }, (_, i) => i + 1).map((round) => (
                <tr key={round} className="border-b border-gray-200 hover:bg-gray-50">
                  <td className="py-3 px-3 font-semibold">R{round}</td>
                  {playerLabels.map((label) => (
                    <td key={`${round}-${label}`} className="py-3 px-3 text-gray-700">
                      {draftSummary[round][label] || '-'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 px-4 lg:px-0">
      {/* Commissioner Controls */}
      {isCommissioner && (
        <div className="mb-6 p-4 bg-purple-50 border border-purple-200 rounded-lg flex justify-between items-center">
          <div>
            <p className="text-sm font-semibold text-purple-900">Commissioner Mode</p>
            <p className="text-xs text-purple-700">You have special controls for this draft</p>
          </div>
          <Button
            variant="destructive"
            size="sm"
            onClick={handleResetDraft}
            disabled={resetting}
            className="gap-2"
          >
            <RotateCcw className="w-4 h-4" />
            {resetting ? 'Resetting...' : 'Reset Draft'}
          </Button>
        </div>
      )}

      {/* Turn Indicator Banner */}
      <TurnIndicator draftState={draftState} />

      {/* Last Pick Blurb */}
      {(() => {
        // Get all artist picks from rosters
        const allArtistPicks: any[] = [];
        draftState.rosters.forEach((roster: any) => {
          roster.artists.forEach((artist: any) => {
            allArtistPicks.push({
              artistName: artist.name,
              playerName: roster.player?.user?.displayName,
              userId: roster.player?.user?.id,
              createdAt: artist.rosterEntry.createdAt || 0,
            });
          });
        });

        // Sort by creation time and get the last one
        const lastPick = allArtistPicks.sort((a, b) => b.createdAt - a.createdAt)[0];
        const pickNumber = allArtistPicks.length;

        // Convert number to ordinal (1st, 2nd, 3rd, 4th, etc.)
        const getOrdinal = (n: number) => {
          const s = ['th', 'st', 'nd', 'rd'];
          const v = n % 100;
          return n + (s[(v - 20) % 10] || s[v] || s[0]);
        };

        const ordinalPick = getOrdinal(pickNumber);
        const isYourPick = lastPick?.userId === user?.id;
        const playerText = isYourPick ? 'you' : lastPick?.playerName;

        return lastPick ? (
          <div className="mt-4 p-4 bg-gradient-to-r from-purple-50 to-pink-50 border-2 border-purple-200 rounded-lg">
            <p className="text-sm text-gray-700">
              With the number <strong className="text-lg text-purple-600">{ordinalPick}</strong> pick in the draft, <strong>{playerText}</strong> selected... <strong className="text-lg text-pink-600">"{lastPick.artistName}"</strong>! 🎉
            </p>
          </div>
        ) : null;
      })()}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 text-red-700">
          <p className="font-semibold">Error:</p>
          <p>{error}</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 mt-6">
        {/* Sidebar with Info Panels - appears first on mobile, right on desktop */}
        <div className="space-y-4 order-first lg:order-last lg:col-span-1">
          {/* Artist Selection Panel */}
          {activeSelectedPromptId && (
            <ArtistSelectionPanel
              draftState={draftState}
              selectedPromptId={activeSelectedPromptId}
              artistName={artistName}
              setArtistName={setArtistName}
              loading={loading}
              onError={setError}
            />
          )}

          {/* Roster Display */}
          <RosterDisplay rosters={draftState.rosters} />
        </div>

        {/* Main Draft Board and History */}
        <div className="lg:col-span-3 space-y-6 order-last lg:order-first">
          <DraftBoard
            draftState={draftState}
            selectedPromptId={activeSelectedPromptId}
            onPromptSelect={setSelectedPromptId}
            onError={setError}
          />

          {/* Draft History */}
          <DraftHistory history={draftState.draftHistory} rosters={draftState.rosters} />
        </div>
      </div>
    </div>
  );
}

