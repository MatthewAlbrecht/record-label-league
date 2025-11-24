'use client';

import { useParams, useRouter } from 'next/navigation';
import { useQuery } from 'convex/react';
import { api } from 'convex/_generated/api';
import type { Id } from 'convex/_generated/dataModel';
import { useAuth } from '~/lib/auth-context';
import { Button } from '~/components/ui/button';
import { Card } from '~/components/ui/card';
import { ArrowRight, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import DraftOrderList from '../components/draft-order-list';

export default function DraftOrderSetupPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const seasonId = (params?.seasonId as string) || '';

  const season = useQuery(api.seasons.getSeason, {
    seasonId: seasonId as Id<'seasons'>,
  });

  const seasonPlayers = useQuery(api.seasons.getSeasonPlayers, {
    seasonId: seasonId as Id<'seasons'>,
  });

  if (!season || !seasonPlayers || !user) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  // Check if user is commissioner
  const isCommissioner = season.league.commissioner.id === (user?.id as any);
  if (!isCommissioner) {
    return (
      <div className="container mx-auto py-8">
        <Card className="p-8 border-red-200 bg-red-50">
          <h1 className="text-2xl font-bold text-red-900 mb-2">Access Denied</h1>
          <p className="text-red-700">Only commissioners can set the draft order.</p>
        </Card>
      </div>
    );
  }

  // Check if phase is SEASON_SETUP
  if (season.currentPhase !== 'SEASON_SETUP') {
    return (
      <div className="container mx-auto py-8">
        <Card className="p-8 border-yellow-200 bg-yellow-50">
          <h1 className="text-2xl font-bold text-yellow-900 mb-2">Cannot Set Draft Order</h1>
          <p className="text-yellow-700 mb-4">
            The season is currently in the <span className="font-semibold">{season.currentPhase}</span> phase.
            Draft order can only be set during SEASON_SETUP.
          </p>
          <Button onClick={() => router.back()}>Go Back</Button>
        </Card>
      </div>
    );
  }

  const handleConfirmAndSet = () => {
    // Order is already saved via optimistic updates during drag
    toast.success('Draft order confirmed! Returning to admin...');

    // Redirect back to admin page
    setTimeout(() => {
      router.push(`/seasons/${seasonId}/admin`);
    }, 800);
  };

  return (
    <div className="container mx-auto py-8 max-w-2xl">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-2">Draft Order Setup</h1>
        <p className="text-gray-600">
          Set the draft pick order for <span className="font-semibold">{season.name}</span>
        </p>
      </div>

      {/* Info Card */}
      <Card className="p-6 mb-8 border-blue-200 bg-blue-50">
        <h2 className="font-semibold text-blue-900 mb-2">How Snake Draft Works</h2>
        <p className="text-sm text-blue-800 mb-3">
          Draft is organized in 4 pairs of rounds. Within each pair, the draft snakes (reverses direction in round 2 of the pair). The starting picker rotates with each pair:
        </p>
        <ul className="text-sm text-blue-800 space-y-1">
          <li><span className="font-semibold">Rounds 1-2:</span> 1→2→3→4, then 4→3→2→1</li>
          <li><span className="font-semibold">Rounds 3-4:</span> 2→3→4→1, then 1→4→3→2</li>
          <li><span className="font-semibold">Rounds 5-6:</span> 3→4→1→2, then 2→1→4→3</li>
          <li><span className="font-semibold">Rounds 7-8:</span> 4→1→2→3, then 3→2→1→4</li>
        </ul>
        <p className="text-xs text-blue-700 mt-3 italic">
          This ensures each player gets the first pick once and the last pick once.
        </p>
      </Card>

      {/* Draft Order List */}
      <div className="mb-8">
        <DraftOrderList
          players={seasonPlayers}
          seasonId={seasonId as Id<'seasons'>}
          requesterId={user?.id as any}
          onSuccess={() => {
            // Can refresh if needed
          }}
        />
      </div>

      {/* Action Buttons */}
      <div className="flex gap-4">
        <Button
          variant="outline"
          onClick={() => router.back()}
          className="flex-1"
        >
          Cancel
        </Button>
        <Button
          onClick={handleConfirmAndSet}
          className="flex-1 gap-2"
          size="lg"
        >
          Confirm and Set
          <ArrowRight className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

