'use client';

import { useMutation, useQuery } from 'convex/react';
import { api } from 'convex/_generated/api';
import type { Id } from 'convex/_generated/dataModel';
import { Card } from '~/components/ui/card';
import { Button } from '~/components/ui/button';
import { Badge } from '~/components/ui/badge';
import { cn } from '~/lib/utils';
import { useState } from 'react';
import { useAuth } from '~/lib/auth-context';

interface DraftBoardProps {
  draftState: any;
  selectedPromptId: string | null;
  onPromptSelect: (promptId: string) => void;
  onError: (error: string) => void;
}

interface Prompt {
  _id: string;
  status?: string;
  categoryId: string;
  text: string;
}

export default function DraftBoard({
  draftState,
  selectedPromptId,
  onPromptSelect,
  onError,
}: DraftBoardProps) {
  const { user } = useAuth();
  const selectPrompt = useMutation(api.drafts.selectPrompt);
  const [loading, setLoading] = useState(false);

  // Check if current user can select prompts
  const isCurrentPlayer = draftState.currentPlayer?.user?.id === user?.id;
  const requestingUserId = user?.id as Id<'users'>;

  const handlePromptClick = async (promptId: string) => {
    try {
      setLoading(true);
      onError('');
      await selectPrompt({
        seasonId: draftState.draftState.seasonId,
        promptId: promptId as Id<'draft_prompts'>,
        requestingUserId,
      });
      onPromptSelect(promptId);
    } catch (err) {
      onError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  // Get the season to check if user is commissioner
  const season = useQuery(api.seasons.getSeason, {
    seasonId: draftState.draftState.seasonId as Id<'seasons'>,
  });

  const isCommissioner = season?.league?.commissioner?.id === user?.id;
  const canSelectPrompts = isCommissioner || isCurrentPlayer;

  // Check if a prompt is already selected this round (locked state)
  // Only count SELECTED prompts (not RETIRED) for the current round
  const selectedPromptThisRound = draftState.allPrompts?.find(
    (p: any) => 
      p.status === 'SELECTED' && 
      p.selectedAtRound === draftState.currentRound &&
      (p.status || 'OPEN') !== 'RETIRED'
  );
  const isRoundLocked = !!selectedPromptThisRound;

  const getPromptStatus = (prompt: any) => {
    const status = prompt.status || 'OPEN';
    if (status === 'OPEN') return 'open';
    if (status === 'SELECTED') return 'selected';
    return 'retired';
  };

  const getPromptColor = (status: string, canClick: boolean) => {
    switch (status) {
      case 'open':
        return canClick
          ? 'bg-blue-50 border-blue-300 hover:bg-blue-100 cursor-pointer'
          : 'bg-gray-50 border-gray-300 cursor-not-allowed opacity-60';
      case 'selected':
        return 'bg-green-100 border-green-400 cursor-not-allowed';
      case 'retired':
        return 'bg-red-50 border-red-300 opacity-50 cursor-not-allowed';
      default:
        return '';
    }
  };

  return (
    <Card className="p-6">
      <h2 className="text-2xl font-bold mb-6">Draft Board - Round {draftState.currentRound} of 8</h2>
      
      <div className="grid gap-2" style={{ 
        gridTemplateColumns: `repeat(${draftState.board.categories.length}, 1fr)` 
      }}>
        {/* Category Headers */}
        {draftState.board.categories.map((category: any) => (
          <div key={category.id} className="font-bold text-center p-2 bg-gray-200 rounded">
            {category.title}
          </div>
        ))}

        {/* Prompts Grid */}
        {draftState.board.categories.map((category: any) => {
          const categoryPrompts = (draftState.allPrompts as Prompt[]).filter(
            (p: Prompt) => p.categoryId === category.id
          );
          
          return categoryPrompts.map((prompt: Prompt) => {
            const status = getPromptStatus(prompt);
            const isOpen = status === 'open';
            // Can only click if: prompt is open AND user can select AND round is not locked (no prompt selected yet this round)
            const canClick = isOpen && canSelectPrompts && !isRoundLocked;
            
            return (
              <button
                key={prompt._id}
                onClick={() => canClick && handlePromptClick(prompt._id)}
                disabled={!canClick || loading}
                className={cn(
                  'p-3 rounded border-2 text-xs font-medium transition-all w-full aspect-square',
                  'flex flex-col items-center justify-center text-center',
                  getPromptColor(status, canClick),
                  canClick && 'hover:shadow-lg'
                )}
              >
                <span className="mb-1">{prompt.text}</span>
                {status === 'selected' && (
                  <Badge variant="secondary" className="text-xs">
                    Selected
                  </Badge>
                )}
              </button>
            );
          });
        })}
      </div>
    </Card>
  );
}

