'use client';

import { Card } from '~/components/ui/card';
import { Button } from '~/components/ui/button';
import { cn } from '~/lib/utils';

interface Advantage {
  _id: string;
  code: string;
  name: string;
  description: string;
  order: number;
  tier?: number;
}

interface AdvantageBoardProps {
  tier: number;
  advantages: Advantage[];
  maxSelections: number;
  currentSelections: string[]; // Array of selected advantage codes
  onSelectAdvantage: (code: string) => void;
  isLoading: boolean;
  disabled?: boolean;
}

export default function AdvantageBoard({
  tier,
  advantages,
  maxSelections,
  currentSelections,
  onSelectAdvantage,
  isLoading,
  disabled = false,
}: AdvantageBoardProps) {
  const currentCount = currentSelections.length;
  const canSelectMore = currentCount < maxSelections;

  return (
    <Card className="p-6">
      <h2 className="text-2xl font-bold mb-2">Tier {tier} Advantages</h2>

      {advantages.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-gray-500">No Tier 1 advantages configured for this season</p>
        </div>
      ) : (
        <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
          {advantages.map((advantage) => {
            const isSelected = currentSelections.includes(advantage.code);
            const isDisabled = disabled || isLoading || !canSelectMore || isSelected;

            return (
              <div
                key={advantage._id}
                className={cn(
                  'flex flex-col gap-3 rounded-lg border-2 p-4 transition-all',
                  isSelected
                    ? 'bg-gray-100 border-gray-400 opacity-60 cursor-not-allowed'
                    : isDisabled
                      ? 'bg-white border-gray-200 opacity-50 cursor-not-allowed'
                      : 'bg-white hover:bg-blue-50 border-gray-200 hover:border-blue-300'
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <h3 className="font-bold text-lg text-gray-900">
                      {advantage.name}
                    </h3>
                    <p className="text-xs text-gray-500 font-mono mb-2">
                      {advantage.code}
                    </p>
                  </div>
                  <Button
                    onClick={() => onSelectAdvantage(advantage.code)}
                    disabled={isDisabled}
                    className={cn(
                      'shrink-0',
                      isSelected
                        ? 'bg-gray-400 hover:bg-gray-400 cursor-not-allowed'
                        : !canSelectMore
                          ? 'bg-gray-400 hover:bg-gray-400 cursor-not-allowed'
                          : 'bg-blue-600 hover:bg-blue-700'
                    )}
                    size="sm"
                  >
                    {isLoading
                      ? '⏳ Assigning...'
                      : isSelected
                        ? '✓ Selected'
                        : !canSelectMore
                          ? `Max ${maxSelections} selected`
                          : '✓ Select'}
                  </Button>
                </div>

                <p className="text-sm text-gray-700 flex-grow">
                  {advantage.description}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

