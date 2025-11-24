'use client';

import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation } from 'convex/react';
import { api } from 'convex/_generated/api';
import type { Id } from 'convex/_generated/dataModel';
import { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '~/components/ui/button';
import { Card } from '~/components/ui/card';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import { useAuth } from '~/lib/auth-context';
import { toast } from 'sonner';

export default function PreseasonSettingsPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const seasonId = (params?.seasonId as string) || '';

  const season = useQuery(api.seasons.getSeason, {
    seasonId: seasonId as Id<'seasons'>,
  });

  const config = useQuery(api.seasons.getAdvantageSelectionConfig, {
    seasonId: seasonId as Id<'seasons'>,
  });

  const updateConfig = useMutation(api.seasons.updateAdvantageSelectionConfig);

  const [tier1Count, setTier1Count] = useState(2);
  const [tier2Count, setTier2Count] = useState(1);
  const [tier3Count, setTier3Count] = useState(0);
  const [isSaving, setIsSaving] = useState(false);

  // Update local state when config loads
  useEffect(() => {
    if (config) {
      setTier1Count(config.tier1Count);
      setTier2Count(config.tier2Count);
      setTier3Count(config.tier3Count);
    }
  }, [config]);

  const isCommissioner = season?.league?.commissioner?.id === user?.id;

  const handleSave = async () => {
    if (!user) return;

    // Validate inputs
    if (tier1Count < 0 || tier2Count < 0 || tier3Count < 0) {
      toast.error('Tier counts must be non-negative numbers');
      return;
    }

    try {
      setIsSaving(true);
      await updateConfig({
        seasonId: seasonId as Id<'seasons'>,
        config: {
          tier1Count,
          tier2Count,
          tier3Count,
        },
        requesterId: user.id,
      });
      toast.success('Advantage selection config saved!');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to save config';
      toast.error(errorMessage);
    } finally {
      setIsSaving(false);
    }
  };

  if (!isCommissioner) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-10">
        <p className="text-red-500">Only the commissioner can access this page</p>
        <Button onClick={() => router.push(`/seasons/${seasonId}`)} className="mt-4">
          Back to Season
        </Button>
      </main>
    );
  }

  if (!season || config === undefined) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <div className="mb-8">
        <h1 className="font-semibold text-3xl mb-2">Preseason Settings</h1>
        <p className="text-gray-600">
          Configure how many advantages of each tier players will select during the advantage selection phase.
        </p>
      </div>

      <Card className="p-6">
        <h2 className="text-xl font-semibold mb-6">Advantage Selection Configuration</h2>

        <div className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="tier1">Tier 1 Advantages</Label>
            <Input
              id="tier1"
              type="number"
              min="0"
              value={tier1Count}
              onChange={(e) => setTier1Count(parseInt(e.target.value) || 0)}
              className="max-w-xs"
            />
            <p className="text-sm text-gray-500">
              Number of Tier 1 advantages each player will select
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="tier2">Tier 2 Advantages</Label>
            <Input
              id="tier2"
              type="number"
              min="0"
              value={tier2Count}
              onChange={(e) => setTier2Count(parseInt(e.target.value) || 0)}
              className="max-w-xs"
            />
            <p className="text-sm text-gray-500">
              Number of Tier 2 advantages each player will select
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="tier3">Tier 3 Advantages</Label>
            <Input
              id="tier3"
              type="number"
              min="0"
              value={tier3Count}
              onChange={(e) => setTier3Count(parseInt(e.target.value) || 0)}
              className="max-w-xs"
            />
            <p className="text-sm text-gray-500">
              Number of Tier 3 advantages each player will select (usually 0 for preseason)
            </p>
          </div>

          <div className="pt-4 border-t">
            <div className="flex gap-4">
              <Button
                onClick={handleSave}
                disabled={isSaving}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {isSaving ? 'Saving...' : 'Save Configuration'}
              </Button>
              <Button
                onClick={() => router.push(`/seasons/${seasonId}/admin`)}
                variant="outline"
              >
                Back to Admin
              </Button>
            </div>
          </div>
        </div>
      </Card>

      <Card className="p-6 mt-6 bg-blue-50 border-blue-200">
        <h3 className="font-semibold text-lg mb-2">Current Configuration</h3>
        <div className="space-y-1 text-sm text-gray-700">
          <p>Tier 1: {config.tier1Count} per player</p>
          <p>Tier 2: {config.tier2Count} per player</p>
          <p>Tier 3: {config.tier3Count} per player</p>
        </div>
      </Card>
    </main>
  );
}

