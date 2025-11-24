'use client';

import { useParams } from 'next/navigation';
import { useQuery } from 'convex/react';
import { api } from 'convex/_generated/api';
import type { Id } from 'convex/_generated/dataModel';
import { useAuth } from '~/lib/auth-context';
import { Loader2, CheckCircle2 } from 'lucide-react';

function BoardContent({ seasonId }: { seasonId: Id<'seasons'> }) {
  const boardData = useQuery(api.challenges.getChallengeSelectionPageData, {
    seasonId,
  });

  if (!boardData) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  const { challenges, season, board } = boardData;

  // Group challenges by category
  const challengesByCategory = challenges.reduce((acc: any, challenge: any) => {
    const categoryId = challenge.categoryId;
    if (!acc[categoryId]) {
      acc[categoryId] = [];
    }
    acc[categoryId].push(challenge);
    return acc;
  }, {});

  const categoryMap = board.categories.reduce((acc: any, cat: any) => {
    acc[cat.id] = cat.title;
    return acc;
  }, {});

  const sortedCategoryIds = board.categories.map((c: any) => c.id);

  // Find max number of challenges in any category to determine number of rows
  const maxChallenges = Math.max(
    ...sortedCategoryIds.map((catId: string) => (challengesByCategory[catId] || []).length)
  );

  return (
    <div className="container mx-auto py-8 px-4 max-w-7xl">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-2">Week {season.currentWeek} of 8</h1>
        <p className="text-xl text-gray-600">Challenge Board</p>
      </div>

      {/* Jeopardy Board */}
      <div className="mb-8">
        <h2 className="text-2xl font-bold mb-4">Challenge Board</h2>
        <div className="grid gap-4" style={{
          gridTemplateColumns: `repeat(${Math.min(board.categories.length, 6)}, 1fr)`,
        }}>
          {/* Category Headers */}
          {sortedCategoryIds.map((categoryId: string) => (
            <div key={`header-${categoryId}`}>
              <h3 className="font-bold text-center mb-3 text-sm bg-gray-200 p-2 rounded">
                {categoryMap[categoryId]}
              </h3>
            </div>
          ))}

          {/* Challenge Rows - each row contains one challenge from each category */}
          {Array.from({ length: maxChallenges }).map((_, rowIndex) => (
            sortedCategoryIds.map((categoryId: string) => {
              const categoryChallenges = challengesByCategory[categoryId] || [];
              const challenge = categoryChallenges[rowIndex];

              if (!challenge) {
                return <div key={`empty-${categoryId}-${rowIndex}`} />;
              }

              const isRevealed = challenge.isRevealed;
              const isSelected = challenge.isSelected;
              const wasSelected = isSelected && boardData.currentSelection?.boardChallengeId !== challenge._id;

              return (
                <div
                  key={challenge._id}
                  className={`rounded border-2 transition-all p-3 flex flex-col items-center justify-center relative min-h-[120px] ${boardData.currentSelection?.boardChallengeId === challenge._id
                    ? 'bg-green-100 border-green-500 shadow-md'
                    : wasSelected
                      ? 'bg-gray-100 border-gray-300 opacity-50'
                      : 'bg-white border-gray-300'
                    }`}
                >
                  {boardData.currentSelection?.boardChallengeId === challenge._id ? (
                    <div className="text-center">
                      <p className="text-sm font-bold text-green-700 flex items-center justify-center gap-1 mb-2">
                        <CheckCircle2 className="w-4 h-4" /> Week {season.currentWeek}
                      </p>
                      <p className="text-sm font-semibold">
                        <span className="text-lg mr-2">{challenge.canonical?.emoji}</span>
                        {challenge.canonical?.title}
                      </p>
                      {challenge.canonical?.generalVibe && (
                        <p className="text-xs text-green-600 mt-1 italic">
                          {challenge.canonical?.generalVibe}
                        </p>
                      )}
                    </div>
                  ) : wasSelected ? (
                    <div className="text-center">
                      <p className="text-sm font-semibold text-gray-600">
                        <span className="text-lg mr-1 line-through">{challenge.canonical?.emoji}</span>
                        <span className="line-through">{challenge.canonical?.title}</span>
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        Week {challenge.selectedAtWeek}
                      </p>
                    </div>
                  ) : isRevealed ? (
                    <div className="text-center">
                      <p className="text-sm font-semibold mb-2">
                        <span className="text-lg mr-2">{challenge.canonical?.emoji}</span>
                        {challenge.canonical?.title}
                      </p>
                      <p className="text-xs text-gray-600 mb-2 italic">
                        {challenge.canonical?.generalVibe}
                      </p>
                    </div>
                  ) : (
                    <div className="text-center">
                      <p className="text-sm font-semibold text-gray-700 mb-2">
                        <span className="text-lg mr-2">{challenge.canonical?.emoji}</span>
                        {challenge.canonical?.title}
                      </p>
                    </div>
                  )}
                </div>
              );
            })
          )).flat()}
        </div>
      </div>
    </div>
  );
}

export default function ChallengeboardPage() {
  const params = useParams();
  const { user } = useAuth();
  const seasonId = (params?.seasonId as string) || '';

  if (!user) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  return <BoardContent seasonId={seasonId as Id<'seasons'>} />;
}
