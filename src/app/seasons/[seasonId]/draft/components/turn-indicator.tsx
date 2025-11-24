'use client';

import { Card } from '~/components/ui/card';
import { Badge } from '~/components/ui/badge';
import { Clock, Zap } from 'lucide-react';
import { useAuth } from '~/lib/auth-context';

interface TurnIndicatorProps {
  draftState: any;
}

export default function TurnIndicator({ draftState }: TurnIndicatorProps) {
  const { user } = useAuth();
  const currentPlayer = draftState.currentPlayer;
  const playerNames = draftState.draftOrder.map((playerId: string, idx: number) => {
    const playerData = draftState.rosters.find((r: any) => r.player?._id === playerId);
    return playerData?.player?.user?.displayName || `Player ${idx + 1}`;
  });

  // Check if a prompt has been selected for this round
  const selectedPromptThisRound = draftState.allPrompts?.find(
    (p: any) => p.status === 'SELECTED' && p.selectedAtRound === draftState.currentRound
  );

  const promptSelected = !!selectedPromptThisRound;
  const actionText = promptSelected ? 'pick an artist' : 'pick a category';
  const isYourTurn = currentPlayer?.user?.id === user?.id;

  // Determine styling based on whose turn it is
  const bgClass = isYourTurn 
    ? 'bg-gradient-to-r from-yellow-50 to-amber-50 border-2 border-yellow-400' 
    : 'bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-300';
  
  const iconComponent = isYourTurn 
    ? <Zap className="w-8 h-8 text-yellow-600 animate-pulse" />
    : <Clock className="w-8 h-8 text-blue-600" />;

  const messageText = isYourTurn
    ? `🔥 You're on the clock! Time to ${actionText}!`
    : `Waiting for ${currentPlayer?.user?.displayName} to ${actionText}...`;

  const textColor = isYourTurn ? 'text-yellow-900' : 'text-blue-900';
  const accentColor = isYourTurn ? 'text-yellow-600' : 'text-blue-600';

  return (
    <Card className={`${bgClass} p-6`}>
      <div className="flex items-center gap-4">
        {iconComponent}
        
        <div className="flex-1">
          <div className="text-lg font-bold text-gray-900 mb-2">
            Round {draftState.currentRound} of 8
          </div>
          
          <div className={`text-lg mb-3 ${textColor}`}>
            {isYourTurn ? (
              <>
                <span className="text-2xl">⚡</span> {messageText}
              </>
            ) : (
              <>
                <span className="text-2xl">⏳</span> {messageText}
              </>
            )}
          </div>

          {/* Draft Order */}
          <div className="flex gap-2 flex-wrap">
            {playerNames.map((name: string, idx: number) => (
              <Badge
                key={idx}
                variant={idx === draftState.currentPickerIndex ? 'default' : 'outline'}
                className={idx === draftState.currentPickerIndex ? 'bg-blue-600' : ''}
              >
                {idx + 1}. {name}
              </Badge>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4 text-sm text-blue-700 border-t border-blue-200 pt-3">
        <p className="font-semibold mb-1">Turn Flow:</p>
        <p>
          Each round, the starting picker rotates. All players then pick an artist in order.
          After all 4 pick, the next round begins.
        </p>
      </div>
    </Card>
  );
}

