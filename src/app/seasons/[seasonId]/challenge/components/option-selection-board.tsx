'use client';

import { Card } from '~/components/ui/card';
import { Button } from '~/components/ui/button';
import { Badge } from '~/components/ui/badge';
import { cn } from '~/lib/utils';
import { CheckCircle2, Clock } from 'lucide-react';

interface OptionSelection {
  _id: string;
  selectedOption: string;
  player: {
    _id: string;
    labelName: string;
    displayName: string;
  };
}

interface SelectionOrderPlayer {
  _id: string;
  labelName: string;
  displayName: string;
  rank: number;
  selectedOption: string | null;
}

interface OptionSelectionBoardProps {
  options: string[];
  selectionOrder: SelectionOrderPlayer[];
  currentTurnPlayer: {
    _id: string;
    labelName: string;
    displayName: string;
  } | null;
  selections: OptionSelection[];
  isComplete: boolean;
  currentPlayerId: string;
  onSelectOption: (option: string) => void;
  isLoading: boolean;
  isCommissioner?: boolean;
}

export default function OptionSelectionBoard({
  options,
  selectionOrder,
  currentTurnPlayer,
  selections,
  isComplete,
  currentPlayerId,
  onSelectOption,
  isLoading,
  isCommissioner = false,
}: OptionSelectionBoardProps) {
  const selectedOptions = new Set(selections.map((s) => s.selectedOption));
  const isCurrentPlayerTurn =
    currentTurnPlayer && currentTurnPlayer._id === currentPlayerId;
  const canSelect = isCommissioner || isCurrentPlayerTurn;

  return (
    <Card className="p-4 border border-blue-200">
      <div className="mb-4">
        <h2 className="text-lg font-semibold mb-1">Challenge Option Selection</h2>
        <p className="text-xs text-gray-600">
          Each player selects one option. Selection order is reverse standings (4th → 3rd → 2nd → 1st).
        </p>
      </div>

      {/* Turn Indicator */}
      {!isComplete && (
        <div className={cn(
          'mb-6 p-4 rounded-lg border-2',
          canSelect
            ? 'bg-blue-50 border-blue-300'
            : 'bg-gray-50 border-gray-200'
        )}>
          {isCommissioner ? (
            <div className="flex items-center gap-3">
              <Clock className="w-5 h-5 text-purple-600" />
              <div className="flex-1">
                <p className="font-semibold text-purple-900">Commissioner Mode</p>
                <p className="text-sm text-purple-700">
                  Select a player and choose an option on their behalf.
                </p>
              </div>
            </div>
          ) : isCurrentPlayerTurn ? (
            <div className="flex items-center gap-3">
              <Clock className="w-5 h-5 text-blue-600" />
              <div>
                <p className="font-semibold text-blue-900">It's your turn!</p>
                <p className="text-sm text-blue-700">
                  Select one of the available options below.
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <Clock className="w-5 h-5 text-gray-500" />
              <div>
                <p className="font-semibold text-gray-900">
                  Waiting for {currentTurnPlayer?.labelName}...
                </p>
                <p className="text-sm text-gray-600">
                  {currentTurnPlayer?.labelName} is selecting their option.
                </p>
              </div>
            </div>
          )}
        </div>
      )}


      {isComplete && (
        <div className="mb-6 p-4 rounded-lg bg-green-50 border-2 border-green-300">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-green-600" />
            <div>
              <p className="font-semibold text-green-900">All options selected!</p>
              <p className="text-sm text-green-700">
                You can now submit your playlist.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Selection Order */}
      {selectionOrder && selectionOrder.length > 0 && (
        <div className="mb-4">
          <h3 className="text-xs font-medium text-gray-600 mb-1.5">Selection Order:</h3>
          <div className="flex gap-1.5 flex-wrap">
            {selectionOrder.map((player, index) => {
              const hasSelected = player.selectedOption !== null;
              const isCurrentTurn = !isComplete && currentTurnPlayer?._id === player._id;
              return (
                <Badge
                  key={player._id}
                  variant="outline"
                  className={cn(
                    'text-xs px-2 py-0.5',
                    hasSelected
                      ? 'bg-green-100 text-green-800 border-green-300'
                      : isCurrentTurn
                        ? 'bg-blue-100 text-blue-800 border-blue-300'
                        : 'bg-gray-100 text-gray-600 border-gray-300'
                  )}
                >
                  {index + 1}. {player.labelName}
                  {hasSelected && ' ✓'}
                </Badge>
              );
            })}
          </div>
        </div>
      )}

      {/* Options List */}
      <div className="space-y-2">
        {options.map((option) => {
          const isSelected = selectedOptions.has(option);
          const selection = selections.find((s) => s.selectedOption === option);
          const isDisabled =
            isLoading ||
            isSelected ||
            (!canSelect && !isComplete);
          const isCurrentPlayerSelection =
            selection?.player._id === currentPlayerId;

          return (
            <div
              key={option}
              className={cn(
                'flex items-center justify-between gap-3 rounded border p-3 transition-all',
                isSelected
                  ? isCurrentPlayerSelection
                    ? 'bg-green-50 border-green-300'
                    : 'bg-gray-50 border-gray-200 opacity-60'
                  : isDisabled
                    ? 'bg-white border-gray-200 opacity-50 cursor-not-allowed'
                    : 'bg-white hover:bg-blue-50 border-gray-200 hover:border-blue-300'
              )}
            >
              <div className="flex-1 min-w-0">
                <h3 className={cn(
                  'font-semibold text-sm',
                  isSelected && !isCurrentPlayerSelection ? 'text-gray-400' : 'text-gray-900'
                )}>{option}</h3>
                {isSelected && selection && (
                  <p className="text-xs font-normal text-gray-400 mt-0.5">
                    Selected by {selection.player.labelName}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {isSelected && (
                  <CheckCircle2 className={cn(
                    'w-5 h-5',
                    isCurrentPlayerSelection ? 'text-green-600' : 'text-gray-400'
                  )} />
                )}
                {!isSelected && (
                  <Button
                    onClick={() => onSelectOption(option)}
                    disabled={isDisabled}
                    className={cn(
                      'text-xs',
                      isDisabled
                        ? 'bg-gray-300 hover:bg-gray-300 cursor-not-allowed'
                        : 'bg-blue-600 hover:bg-blue-700'
                    )}
                    size="sm"
                  >
                    {isLoading
                      ? '⏳ Selecting...'
                      : isCommissioner
                        ? `Select for ${currentTurnPlayer?.displayName}`
                        : isCurrentPlayerTurn
                          ? 'Select'
                          : 'Not your turn'}
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

