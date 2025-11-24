'use client';

import { useState } from 'react';
import { useMutation } from 'convex/react';
import { api } from 'convex/_generated/api';
import type { Id } from 'convex/_generated/dataModel';
import { Button } from '~/components/ui/button';
import { Card } from '~/components/ui/card';
import { toast } from 'sonner';
import { GripVertical, Loader2 } from 'lucide-react';
import { arrayMove } from '@dnd-kit/sortable';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { cn } from '~/lib/utils';

interface DraftOrderPlayer {
  _id: Id<'season_players'>;
  userId: Id<'users'>;
  labelName: string;
  draftPosition?: number | null;
  user?: {
    id: Id<'users'>;
    email: string;
    displayName: string;
  };
  _creationTime?: number;
  seasonId?: Id<'seasons'>;
  totalPoints?: number;
  createdAt?: number;
}

interface DraftOrderListProps {
  players: DraftOrderPlayer[];
  seasonId: Id<'seasons'>;
  requesterId: Id<'users'>;
  onSuccess?: () => void;
}

function SortablePlayerItem({
  player,
  position,
}: {
  player: DraftOrderPlayer;
  position: number;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: player._id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 1000 : 'auto',
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'flex items-center gap-4 p-4 rounded-lg border-2 bg-white',
        isDragging
          ? 'border-blue-500 shadow-lg opacity-50 bg-blue-50'
          : 'border-gray-200 hover:border-gray-300 transition-colors'
      )}
    >
      <div
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600"
      >
        <GripVertical className="w-5 h-5" />
      </div>

      <div className="flex-1">
        <div className="font-semibold">{player.user?.displayName}</div>
        <div className="text-sm text-gray-600">{player.labelName}</div>
      </div>

      <div className="text-right">
        <div className="text-lg font-bold text-blue-600 w-8 text-center">{position}</div>
        <div className="text-xs text-gray-500">pick</div>
      </div>
    </div>
  );
}

export default function DraftOrderList({
  players,
  seasonId,
  requesterId,
  onSuccess,
}: DraftOrderListProps) {
  const [optimisticPlayers, setOptimisticPlayers] = useState(players);
  const [isLoading, setIsLoading] = useState(false);

  const reorderMutation = useMutation(api.seasons.reorderSeasonPlayers);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      distance: 8,
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over || active.id === over.id) {
      return;
    }

    const oldIndex = optimisticPlayers.findIndex((p) => p._id === active.id);
    const newIndex = optimisticPlayers.findIndex((p) => p._id === over.id);

    if (oldIndex !== -1 && newIndex !== -1) {
      // Optimistically update local state immediately
      const reorderedPlayers = arrayMove(optimisticPlayers, oldIndex, newIndex).map(
        (player, idx) => ({
          ...player,
          draftPosition: idx + 1,
        })
      );

      setOptimisticPlayers(reorderedPlayers);

      const playerIds = reorderedPlayers.map((p) => p._id);

      try {
        setIsLoading(true);
        await reorderMutation({
          seasonId,
          playerIds,
          requesterId,
        });
        toast.success('Draft order updated');
        onSuccess?.();
      } catch (err) {
        // Revert on error
        setOptimisticPlayers(players);
        toast.error((err as Error).message || 'Failed to update draft order');
      } finally {
        setIsLoading(false);
      }
    }
  };

  return (
    <Card className="p-6">
      <div className="mb-6">
        <h2 className="text-2xl font-bold mb-2">Draft Order</h2>
        <p className="text-gray-600 text-sm">
          Drag players to set their draft pick order. The first player picks first in round 1.
        </p>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={optimisticPlayers.map((p) => p._id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-3">
            {optimisticPlayers.map((player: DraftOrderPlayer, idx: number) => (
              <SortablePlayerItem
                key={player._id}
                player={player}
                position={idx + 1}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {isLoading && (
        <div className="mt-4 flex items-center justify-center gap-2 text-sm text-gray-600">
          <Loader2 className="w-4 h-4 animate-spin" />
          Syncing with server...
        </div>
      )}

      <div className="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
        <p className="text-sm text-blue-900">
          <span className="font-semibold">Current Order:</span>{' '}
          {optimisticPlayers.map((p) => p.user?.displayName).join(' → ')}
        </p>
      </div>
    </Card>
  );
}

