'use client';

import { useMutation, useQuery } from 'convex/react';
import { api } from 'convex/_generated/api';
import type { Id } from 'convex/_generated/dataModel';
import { Card } from '~/components/ui/card';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { Badge } from '~/components/ui/badge';
import { Loader2, Lock } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '~/lib/auth-context';

interface ArtistSelectionPanelProps {
  draftState: any;
  selectedPromptId: string;
  artistName: string;
  setArtistName: (name: string) => void;
  loading: boolean;
  onError: (error: string) => void;
}

export default function ArtistSelectionPanel({
  draftState,
  selectedPromptId,
  artistName,
  setArtistName,
  loading,
  onError,
}: ArtistSelectionPanelProps) {
  const { user } = useAuth();
  const draftArtist = useMutation(api.drafts.draftArtist);
  const [localLoading, setLocalLoading] = useState(false);

  // Get season to check if user is commissioner
  const season = useQuery(api.seasons.getSeason, {
    seasonId: draftState.draftState.seasonId as Id<'seasons'>,
  });

  const selectedPrompt = draftState.allPrompts.find(
    (p: any) => p._id === selectedPromptId
  );

  const currentPlayer = draftState.currentPlayer;
  const requestingUserId = user?.id as Id<'users'>;
  const isCommissioner = season?.league?.commissioner?.id === user?.id;
  const isCurrentPlayer = currentPlayer?.user?.id === user?.id;
  const canDraft = isCommissioner || isCurrentPlayer;

  const handleDraftArtist = async () => {
    if (!artistName.trim()) {
      onError('Please enter an artist name');
      return;
    }

    try {
      setLocalLoading(true);
      onError('');
      await draftArtist({
        seasonId: draftState.draftState.seasonId,
        promptId: selectedPromptId as Id<'draft_prompts'>,
        artistName: artistName.trim(),
        requestingUserId,
      });
      setArtistName('');
    } catch (err) {
      onError((err as Error).message);
    } finally {
      setLocalLoading(false);
    }
  };

  const handleKeyDown = (e: any) => {
    if (e.key === 'Enter') handleDraftArtist();
  };

  return (
    <Card className="p-4 bg-amber-50 border-amber-200">
      <h3 className="font-bold text-lg mb-4">Artist Selection</h3>

      {selectedPrompt && (
        <div className="mb-4 p-3 bg-white rounded border border-amber-200">
          <p className="text-sm font-semibold text-gray-700 mb-1">Selected Prompt:</p>
          <p className="text-sm italic">{selectedPrompt.text}</p>
        </div>
      )}

      <div className="mb-4 p-3 bg-white rounded border border-blue-200">
        <p className="text-sm font-semibold text-gray-700 mb-1">Current Picker:</p>
        <Badge className="bg-blue-600">
          {currentPlayer?.user?.displayName}
        </Badge>
      </div>

      {canDraft ? (
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium mb-2">
              Artist Name
            </label>
            <Input
              type="text"
              placeholder="Enter artist name..."
              value={artistName}
              onChange={(e: any) => setArtistName(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={localLoading || loading}
              className="w-full bg-white"
            />
          </div>

          <Button
            onClick={handleDraftArtist}
            disabled={localLoading || loading || !artistName.trim()}
            className="w-full"
          >
            {localLoading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Drafting...
              </>
            ) : (
              'Draft Artist'
            )}
          </Button>
        </div>
      ) : (
        <div className="p-4 bg-gray-100 rounded border border-gray-300 flex items-center gap-2">
          <Lock className="w-4 h-4 text-gray-600" />
          <p className="text-sm text-gray-600">
            Waiting for {currentPlayer?.user?.displayName} to draft...
          </p>
        </div>
      )}

      <p className="text-xs text-gray-600 mt-3">
        {isCommissioner ? 'Commissioner mode: You can draft for any player.' : 'On your turn, enter the artist name and submit.'}
      </p>
    </Card>
  );
}

