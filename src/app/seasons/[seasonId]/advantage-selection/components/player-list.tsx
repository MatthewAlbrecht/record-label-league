'use client';

import { Card } from '~/components/ui/card';
import { Badge } from '~/components/ui/badge';
import { cn } from '~/lib/utils';

interface Player {
  _id: string;
  labelName: string;
  user: {
    id: string;
    email: string;
    displayName: string;
  };
}

interface PlayerAssignment {
  playerId: string;
  labelName: string;
  displayName: string;
  assignedAdvantages: Array<{
    code: string;
    name: string;
    earnedVia: string;
    tier?: number;
  }>;
  tier1Count?: number;
  tier2Count?: number;
  tier3Count?: number;
}

interface PlayerListProps {
  players: Player[];
  playerAssignments: PlayerAssignment[];
  currentPlayerIndex: number;
  onSelectPlayer: (index: number) => void;
  config: {
    tier1Count: number;
    tier2Count: number;
    tier3Count: number;
  };
  currentRound: { tier: number; round: number } | null;
}

export default function PlayerList({
  players,
  playerAssignments,
  currentPlayerIndex,
  onSelectPlayer,
  config,
  currentRound,
}: PlayerListProps) {
  return (
    <Card className="p-4 sticky top-20">
      <h2 className="font-bold text-lg mb-4 text-gray-900">Players (Draft Order)</h2>

      <div className="space-y-2">
        {players.map((player, index) => {
          const assignment = playerAssignments.find(
            (pa) => pa.playerId === player._id
          );
          const tier1Count = assignment?.tier1Count || 0;
          const tier2Count = assignment?.tier2Count || 0;
          const tier3Count = assignment?.tier3Count || 0;
          
          const isComplete =
            tier1Count >= config.tier1Count &&
            tier2Count >= config.tier2Count &&
            tier3Count >= config.tier3Count;
          
          const isCurrentPlayer = index === currentPlayerIndex;

          return (
            <button
              key={player._id}
              onClick={() => onSelectPlayer(index)}
              className={cn(
                'w-full text-left p-3 rounded-lg border-2 transition-all',
                isCurrentPlayer
                  ? 'border-yellow-400 bg-yellow-50 shadow-md'
                  : isComplete
                  ? 'border-green-300 bg-green-50'
                  : 'border-gray-200 bg-white hover:bg-gray-50'
              )}
            >
              <div className="flex items-start justify-between gap-2 mb-1">
                <span className="font-semibold text-sm text-gray-900">
                  {index + 1}. {player.user.displayName}
                </span>
                {isCurrentPlayer && (
                  <Badge variant="default" className="bg-yellow-600">
                    Current
                  </Badge>
                )}
                {isComplete && !isCurrentPlayer && (
                  <Badge variant="outline" className="border-green-300 bg-white">
                    ✓ Done
                  </Badge>
                )}
              </div>

              <p className="text-xs text-gray-600 mb-2">{player.labelName}</p>

              {/* Show individual slots */}
              <div className="space-y-1.5 mt-2">
                {/* Tier 1 slots */}
                {config.tier1Count > 0 && Array.from({ length: config.tier1Count }).map((_, slotIndex) => {
                  const tier1Advantages = assignment?.assignedAdvantages.filter(a => a.tier === 1) || [];
                  const slotAdvantage = tier1Advantages[slotIndex];
                  const isCurrentSlot = currentRound?.tier === 1 && currentRound?.round === slotIndex + 1 && isCurrentPlayer;
                  const isSlotFilled = !!slotAdvantage;

                  return (
                    <div
                      key={`tier1-${slotIndex}`}
                      className={cn(
                        'text-xs p-1.5 rounded border',
                        isCurrentSlot
                          ? 'border-yellow-400 bg-yellow-100'
                          : isSlotFilled
                          ? 'border-green-300 bg-green-50'
                          : 'border-gray-200 bg-gray-50'
                      )}
                    >
                      <span className="font-semibold text-gray-700">Tier 1:</span>{' '}
                      {isSlotFilled ? (
                        <span className="text-green-700">
                          {slotAdvantage.name}
                        </span>
                      ) : (
                        <span className="text-gray-400 italic">Empty</span>
                      )}
                    </div>
                  );
                })}

                {/* Tier 2 slots */}
                {config.tier2Count > 0 && Array.from({ length: config.tier2Count }).map((_, slotIndex) => {
                  const tier2Advantages = assignment?.assignedAdvantages.filter(a => a.tier === 2) || [];
                  const slotAdvantage = tier2Advantages[slotIndex];
                  const isCurrentSlot = currentRound?.tier === 2 && currentRound?.round === slotIndex + 1 && isCurrentPlayer;
                  const isSlotFilled = !!slotAdvantage;

                  return (
                    <div
                      key={`tier2-${slotIndex}`}
                      className={cn(
                        'text-xs p-1.5 rounded border',
                        isCurrentSlot
                          ? 'border-yellow-400 bg-yellow-100'
                          : isSlotFilled
                          ? 'border-green-300 bg-green-50'
                          : 'border-gray-200 bg-gray-50'
                      )}
                    >
                      <span className="font-semibold text-gray-700">Tier 2:</span>{' '}
                      {isSlotFilled ? (
                        <span className="text-green-700">
                          {slotAdvantage.name}
                        </span>
                      ) : (
                        <span className="text-gray-400 italic">Empty</span>
                      )}
                    </div>
                  );
                })}

                {/* Tier 3 slots */}
                {config.tier3Count > 0 && Array.from({ length: config.tier3Count }).map((_, slotIndex) => {
                  const tier3Advantages = assignment?.assignedAdvantages.filter(a => a.tier === 3) || [];
                  const slotAdvantage = tier3Advantages[slotIndex];
                  const isCurrentSlot = currentRound?.tier === 3 && currentRound?.round === slotIndex + 1 && isCurrentPlayer;
                  const isSlotFilled = !!slotAdvantage;

                  return (
                    <div
                      key={`tier3-${slotIndex}`}
                      className={cn(
                        'text-xs p-1.5 rounded border',
                        isCurrentSlot
                          ? 'border-yellow-400 bg-yellow-100'
                          : isSlotFilled
                          ? 'border-green-300 bg-green-50'
                          : 'border-gray-200 bg-gray-50'
                      )}
                    >
                      <span className="font-semibold text-gray-700">Tier 3:</span>{' '}
                      {isSlotFilled ? (
                        <span className="text-green-700">
                          {slotAdvantage.name}
                        </span>
                      ) : (
                        <span className="text-gray-400 italic">Empty</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </button>
          );
        })}
      </div>

      {/* Summary */}
      <div className="mt-6 pt-4 border-t border-gray-200">
        <p className="text-xs text-gray-600">
          <span className="font-semibold">
            {playerAssignments.filter((pa) => {
              const t1 = pa.tier1Count || 0;
              const t2 = pa.tier2Count || 0;
              const t3 = pa.tier3Count || 0;
              return (
                t1 >= config.tier1Count &&
                t2 >= config.tier2Count &&
                t3 >= config.tier3Count
              );
            }).length}
          </span>
          {' '}of{' '}
          <span className="font-semibold">{players.length}</span> complete
        </p>
      </div>
    </Card>
  );
}



