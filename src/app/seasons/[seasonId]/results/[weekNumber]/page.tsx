'use client';

import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation } from 'convex/react';
import { api } from 'convex/_generated/api';
import type { Id } from 'convex/_generated/dataModel';
import { useAuth } from '~/lib/auth-context';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Card } from '~/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog';
import { Loader2, ArrowLeft, Trophy, ChevronLeft, ChevronRight, Gift, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import { useState } from 'react';

export default function WeekResultsPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const seasonId = (params?.seasonId as string) || '';
  const weekNumber = parseInt((params?.weekNumber as string) || '1', 10);

  const season = useQuery(api.seasons.getSeason, {
    seasonId: seasonId as Id<'seasons'>,
  });

  const weeklyResults = useQuery(api.voting.getWeeklyResults, {
    seasonId: seasonId as Id<'seasons'>,
    weekNumber,
  });

  const seasonStandings = useQuery(api.dashboard.getSeasonStandings, {
    seasonId: seasonId as Id<'seasons'>,
  });

  const latestWeek = useQuery(api.voting.getLatestWeekWithResults, {
    seasonId: seasonId as Id<'seasons'>,
  });

  const weekAdvantages = useQuery(api.advantages.getWeekAdvantages, {
    seasonId: seasonId as Id<'seasons'>,
    weekNumber,
  });

  const challengeData = useQuery(api.challenges.getChallengeByWeek, {
    seasonId: seasonId as Id<'seasons'>,
    weekNumber,
  });

  const pendingAdvantageSelections = useQuery(api.inventory.getPendingAdvantageSelections, {
    seasonId: seasonId as Id<'seasons'>,
  });

  const awardAdvantagesMutation = useMutation(api.advantages.awardAdvantages);
  const undoAdvantagesMutation = useMutation(api.inventory.undoWeekAdvantageAwards);
  const advanceToRosterEvolutionMutation = useMutation(api.seasons.advanceToRosterEvolution);
  const [isAwarding, setIsAwarding] = useState(false);
  const [isUndoing, setIsUndoing] = useState(false);
  const [showUndoDialog, setShowUndoDialog] = useState(false);
  const [isAdvancingToRosterEvolution, setIsAdvancingToRosterEvolution] = useState(false);

  const isCommissioner = season && user && season.league.commissioner.id === user.id;
  const hasResultsButNoAdvantages = weeklyResults && weeklyResults.length > 0 && (!weekAdvantages || weekAdvantages.length === 0);
  const hasAdvantagesAwarded = weekAdvantages && weekAdvantages.length > 0;
  const canAdvanceToRosterEvolution = isCommissioner && hasAdvantagesAwarded && season.currentPhase === 'VOTING';

  const handleAdvanceToRosterEvolution = async () => {
    if (!user) return;
    setIsAdvancingToRosterEvolution(true);
    try {
      await advanceToRosterEvolutionMutation({
        seasonId: seasonId as Id<'seasons'>,
        requesterId: user.id as Id<'users'>,
      });
      toast.success('Advanced to Roster Evolution!');
      router.push(`/seasons/${seasonId}/roster-evolution`);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to advance to roster evolution';
      toast.error(errorMsg);
    } finally {
      setIsAdvancingToRosterEvolution(false);
    }
  };

  const handleAwardAdvantages = async () => {
    if (!user) return;
    setIsAwarding(true);
    try {
      await awardAdvantagesMutation({
        seasonId: seasonId as Id<'seasons'>,
        weekNumber,
        requestingUserId: user.id as Id<'users'>,
      });
      toast.success('Advantages awarded successfully!');
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to award advantages';
      toast.error(errorMsg);
    } finally {
      setIsAwarding(false);
    }
  };

  const handleUndoAdvantages = async () => {
    if (!user) return;
    setIsUndoing(true);
    try {
      const result = await undoAdvantagesMutation({
        seasonId: seasonId as Id<'seasons'>,
        weekNumber,
        requestingUserId: user.id as Id<'users'>,
      });
      toast.success(`Undone ${result.deletedAwards} advantage awards and ${result.deletedInventory} inventory entries.`);
      setShowUndoDialog(false);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to undo advantages';
      toast.error(errorMsg);
    } finally {
      setIsUndoing(false);
    }
  };

  if (!season || weeklyResults === undefined || !seasonStandings) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!weeklyResults) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-500 mb-2 text-sm">No results for Week {weekNumber} yet.</p>
          <button onClick={() => router.back()} className="text-blue-600 hover:underline text-sm">
            Go back
          </button>
        </div>
      </div>
    );
  }

  const winner = weeklyResults.find((r) => r.placement === 1);
  const hasPreviousWeek = weekNumber > 1;
  const hasNextWeek = latestWeek !== null && weekNumber < latestWeek;

  const placementEmoji = (p: number) => (p === 1 ? '🥇' : p === 2 ? '🥈' : p === 3 ? '🥉' : `${p}`);
  const vpColor = (vp: number) =>
    vp === 5 ? 'bg-green-300 text-green-900' : 
    vp === 3 ? 'bg-green-200 text-green-800' : 
    vp === 2 ? 'bg-green-100 text-green-700' : 
    'bg-gray-100 text-gray-500';
  
  const tierColors: Record<number, string> = {
    1: 'bg-emerald-100 text-emerald-800',
    2: 'bg-amber-100 text-amber-800',
    3: 'bg-purple-100 text-purple-800',
  };

  return (
    <div className="min-h-screen bg-gray-50 px-3 py-4">
      <div className="max-w-2xl mx-auto">
        {/* Back to Dashboard */}
        <Link href={`/seasons/${seasonId}`} className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-3">
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to Dashboard
        </Link>

        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-lg font-bold flex items-center gap-1.5">
              <Trophy className="w-4 h-4 text-yellow-500" />
              Week {weekNumber} Results
            </h1>
            <p className="text-xs text-gray-500">{season.name}</p>
          </div>
          <div className="flex items-center gap-1">
            {hasPreviousWeek && (
              <Link href={`/seasons/${seasonId}/results/${weekNumber - 1}`} className="p-1.5 hover:bg-gray-200 rounded transition-colors">
                <ChevronLeft className="w-4 h-4" />
              </Link>
            )}
            <span className="text-xs text-gray-500 px-1">Week {weekNumber}</span>
            {hasNextWeek && (
              <Link href={`/seasons/${seasonId}/results/${weekNumber + 1}`} className="p-1.5 hover:bg-gray-200 rounded transition-colors">
                <ChevronRight className="w-4 h-4" />
              </Link>
            )}
          </div>
        </div>

        {/* Winner */}
        {winner && (
          <div className="bg-gradient-to-br from-amber-50 via-yellow-50 to-orange-50 border border-amber-200 rounded-xl p-5 mb-5 shadow-sm">
            {challengeData?.challenge && (
              <div className="flex items-center justify-center gap-2 mb-4">
                <span className="text-2xl">{challengeData.challenge.emoji}</span>
                <span className="text-sm font-medium text-amber-700">{challengeData.challenge.title}</span>
              </div>
            )}
            <div className="text-center">
              <p className="text-xs uppercase tracking-wide text-amber-600 font-medium mb-2">Week {weekNumber} Winner</p>
              <div className="flex items-center justify-center gap-3 mb-3">
                <span className="text-3xl">🏆</span>
                <span className="text-2xl font-bold text-amber-900">{winner.playerName}</span>
              </div>
              <div className="flex items-center justify-center gap-3 text-sm">
                <span className="text-amber-700">{winner.votingPoints} voting points</span>
                <span className="text-amber-400">•</span>
                <span className="px-2 py-0.5 bg-green-200 text-green-800 rounded font-semibold">+{winner.victoryPoints} VP</span>
              </div>
            </div>
          </div>
        )}

        {/* Weekly Results Table */}
        <div className="bg-white border border-gray-200 rounded-lg mb-4 overflow-hidden">
          <div className="px-3 py-2 border-b bg-gray-50">
            <h2 className="text-sm font-semibold">Weekly Standings</h2>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-xs text-gray-500">
                <th className="px-3 py-1.5 text-left w-10">#</th>
                <th className="px-3 py-1.5 text-left">Player</th>
                <th className="px-3 py-1.5 text-right">Awards</th>
                <th className="px-3 py-1.5 text-right">Pts</th>
                <th className="px-3 py-1.5 text-right">VP</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {weeklyResults.map((result) => {
                // Only show placement-based awards in the standings table (not sweeps)
                const playerAdvantages = weekAdvantages?.filter(
                  (award) => award.seasonPlayerId === result.seasonPlayerId && award.awardedVia === 'PLACEMENT'
                ) || [];
                
                return (
                  <tr key={result._id} className={result.placement === 1 ? 'bg-yellow-50/50' : ''}>
                    <td className="px-3 py-2">{placementEmoji(result.placement)}</td>
                    <td className="px-3 py-2">
                      <p className="font-medium">{result.playerName}</p>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex items-center justify-end gap-1 flex-wrap">
                        {playerAdvantages.map((award) => (
                          <span
                            key={award._id}
                            className={`px-1.5 py-0.5 rounded text-xs font-semibold ${tierColors[award.tier] || ''}`}
                          >
                            T{award.tier}
                          </span>
                        ))}
                        {playerAdvantages.length === 0 && (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right font-semibold">{result.votingPoints}</td>
                    <td className="px-3 py-2 text-right">
                      <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-bold ${vpColor(result.victoryPoints)}`}>
                        +{result.victoryPoints}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Voting Breakdown by Category */}
        <div className="bg-white border border-gray-200 rounded-lg mb-4 overflow-hidden">
          <div className="px-3 py-2 border-b bg-gray-50">
            <h2 className="text-sm font-semibold">Votes Per Category</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs text-gray-500">
                  <th className="px-3 py-1.5 text-left">Category</th>
                  {weeklyResults.map((r) => (
                    <th key={r._id} className="px-2 py-1.5 text-center">{r.playerName}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {weeklyResults[0]?.breakdown.map((cat) => {
                  // Check if anyone swept this category (got all votes - can't vote for self so max is n-1)
                  const maxVotes = Math.max(...weeklyResults.map((r) => r.breakdown.find((b) => b.categoryId === cat.categoryId)?.votes || 0));
                  const isSweep = maxVotes === weeklyResults.length - 1;
                  
                  // Find the sweep award for this category if there is one
                  const sweepAward = weekAdvantages?.find(
                    (award) => award.awardedVia === 'SWEEP' && award.sweepCategoryId === cat.categoryId
                  );
                  
                  return (
                    <tr key={cat.categoryId} className={isSweep ? 'bg-gradient-to-r from-amber-50 to-yellow-50' : ''}>
                      <td className="px-3 py-1.5">
                        <div className="flex items-center gap-1.5">
                          <span className={`px-1 py-0.5 rounded text-xs font-semibold ${
                            cat.pointValue === 3 ? 'bg-purple-100 text-purple-800' :
                            cat.pointValue === 2 ? 'bg-blue-100 text-blue-800' :
                            'bg-gray-100 text-gray-700'
                          }`}>{cat.pointValue}pt</span>
                          <span className="text-xs truncate max-w-32">{cat.categoryTitle}</span>
                        </div>
                      </td>
                      {weeklyResults.map((result) => {
                        const playerCat = result.breakdown.find((b) => b.categoryId === cat.categoryId);
                        const votes = playerCat?.votes || 0;
                        const isSwept = isSweep && votes === maxVotes;
                        return (
                          <td key={result._id} className="px-2 py-1.5 text-center">
                            {votes > 0 ? (
                              <span className={`inline-flex items-center gap-1 font-semibold ${isSwept ? 'text-amber-700' : ''}`}>
                                {votes}
                                {isSwept && sweepAward && (
                                  <span className={`px-1 py-0.5 rounded text-xs font-semibold ${tierColors[sweepAward.tier] || ''}`}>
                                    T{sweepAward.tier}
                                  </span>
                                )}
                                {isSwept && !sweepAward && ' 🧹'}
                              </span>
                            ) : (
                              <span className="text-gray-300">0</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
                <tr className="bg-gray-50 font-semibold">
                  <td className="px-3 py-1.5">Total</td>
                  {weeklyResults.map((result) => (
                    <td key={result._id} className="px-2 py-1.5 text-center">{result.votingPoints}</td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Season Standings */}
        <div className="bg-white border border-gray-200 rounded-lg mb-4 overflow-hidden">
          <div className="px-3 py-2 border-b bg-gray-50 flex items-center gap-1.5">
            <Trophy className="w-3.5 h-3.5 text-gray-500" />
            <h2 className="text-sm font-semibold">Season Standings</h2>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-xs text-gray-500">
                <th className="px-3 py-1.5 text-left w-10">#</th>
                <th className="px-3 py-1.5 text-left">Label</th>
                <th className="px-3 py-1.5 text-right">VP</th>
                <th className="px-3 py-1.5 text-right hidden sm:table-cell">Record</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {seasonStandings.standings.map((player) => (
                <tr key={player._id}>
                  <td className="px-3 py-1.5">{placementEmoji(player.placement)}</td>
                  <td className="px-3 py-1.5 font-medium">{player.labelName}</td>
                  <td className="px-3 py-1.5 text-right font-bold">{player.totalVictoryPoints}</td>
                  <td className="px-3 py-1.5 text-right text-xs text-gray-500 hidden sm:table-cell">
                    {player.record.wins}-{player.record.seconds}-{player.record.thirds}-{player.record.fourths}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Award Advantages Button (Commissioner Only) */}
        {isCommissioner && hasResultsButNoAdvantages && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg mb-4 p-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-blue-900 mb-1">Advantages Not Yet Awarded</h3>
                <p className="text-xs text-blue-700">This week's results were calculated before advantages were implemented. Click to award them now.</p>
              </div>
              <Button
                onClick={handleAwardAdvantages}
                disabled={isAwarding}
                size="sm"
                className="ml-4"
              >
                {isAwarding ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Awarding...
                  </>
                ) : (
                  <>
                    <Gift className="w-4 h-4 mr-2" />
                    Award Advantages
                  </>
                )}
              </Button>
            </div>
          </div>
        )}

        {/* Advantages */}
        {weekAdvantages && weekAdvantages.length > 0 && (
          <div className="bg-white border border-gray-200 rounded-lg mb-4 overflow-hidden">
            <div className="px-3 py-2 border-b bg-gray-50 flex items-center justify-between">
              <h2 className="text-sm font-semibold">🎁 Advantages Earned</h2>
              {isCommissioner && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setShowUndoDialog(true)}
                  disabled={isUndoing}
                >
                  Undo Awards
                </Button>
              )}
            </div>
            <div className="divide-y">
              {weekAdvantages.map((award) => {
                const tierColors: Record<number, string> = {
                  1: 'bg-emerald-100 text-emerald-800',
                  2: 'bg-amber-100 text-amber-800',
                  3: 'bg-purple-100 text-purple-800',
                };
                return (
                  <div key={award._id} className="px-3 py-2 flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <span className={`px-1.5 py-0.5 rounded text-xs font-semibold ${tierColors[award.tier] || ''}`}>
                        T{award.tier}
                      </span>
                      <span className="font-medium">{award.advantageName}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <span>{award.playerName}</span>
                      <span>•</span>
                      <span>{award.awardedVia === 'SWEEP' ? '🧹' : '🏅'}</span>
                      {award.canUseAfterWeek > weekNumber && (
                        <span className="text-orange-600">⏱️ Wk{award.canUseAfterWeek}+</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Select Advantages Card (Commissioner Only) - only show when there are pending selections */}
        {isCommissioner && weekAdvantages && weekAdvantages.length > 0 && pendingAdvantageSelections !== null && (
          <Card className="p-6 border-2 border-amber-200 bg-amber-50 mb-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-amber-900 mb-1">
                  🎁 Advantages Ready to Claim
                </h3>
                <p className="text-sm text-amber-700">
                  Players have earned advantages this week. Select specific advantages for each slot.
                </p>
              </div>
              <Link href={`/seasons/${seasonId}/advantage-selection`}>
                <Button className="bg-amber-600 hover:bg-amber-700 text-white">
                  Select Advantages →
                </Button>
              </Link>
            </div>
          </Card>
        )}

        {/* Move to Roster Evolution Card (Commissioner Only) */}
        {canAdvanceToRosterEvolution && (
          <Card className="p-6 border-2 border-indigo-200 bg-indigo-50 mb-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-indigo-900 mb-1">
                  🔄 Ready for Roster Evolution
                </h3>
                <p className="text-sm text-indigo-700">
                  Advantages have been awarded. Move to roster cuts and redrafts.
                </p>
              </div>
              <Button 
                onClick={handleAdvanceToRosterEvolution}
                disabled={isAdvancingToRosterEvolution}
                className="bg-indigo-600 hover:bg-indigo-700 text-white"
              >
                {isAdvancingToRosterEvolution ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Advancing...
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Move to Roster Evolution →
                  </>
                )}
              </Button>
            </div>
          </Card>
        )}

        {/* Nav */}
        <div className="flex gap-2 justify-center">
          <Link href={`/seasons/${seasonId}/standings`}>
            <Button variant="outline" size="sm">Standings</Button>
          </Link>
          <Link href={`/seasons/${seasonId}`}>
            <Button variant="outline" size="sm">Season</Button>
          </Link>
        </div>
      </div>

      {/* Undo Advantages Dialog */}
      <Dialog open={showUndoDialog} onOpenChange={setShowUndoDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Undo Advantage Awards</DialogTitle>
            <DialogDescription>
              Are you sure you want to undo all advantage awards for Week {weekNumber}? This will delete all advantage awards and inventory entries for this week. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              onClick={() => setShowUndoDialog(false)}
              variant="outline"
              disabled={isUndoing}
            >
              Cancel
            </Button>
            <Button
              onClick={handleUndoAdvantages}
              variant="destructive"
              disabled={isUndoing}
            >
              {isUndoing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Undoing...
                </>
              ) : (
                'Undo Awards'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
