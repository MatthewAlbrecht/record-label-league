"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "convex/_generated/api";
import type { Id } from "convex/_generated/dataModel";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { useAuth } from "~/lib/auth-context";
import { toast } from "sonner";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";

type AdvantageItem = {
  _id: Id<"board_advantages">;
  categoryId: string;
  canonicalAdvantageId: Id<"canonical_advantages">;
  order: number;
  canonical?: {
    code: string;
    name: string;
    description: string;
  } | null;
};

type SortableAdvantageItemProps = {
  item: AdvantageItem;
  isLocked: boolean;
  onRemove: (id: Id<"board_advantages">) => void;
};

function SortableAdvantageItem({ item, isLocked, onRemove }: SortableAdvantageItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item._id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="rounded border border-gray-200 bg-gray-50 p-2 flex items-center justify-between gap-2"
    >
      <div className="flex items-center gap-1.5 min-w-0 flex-1">
        {!isLocked && (
          <div
            {...attributes}
            {...listeners}
            className="cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600 flex-shrink-0"
          >
            <GripVertical size={16} />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-gray-700 truncate">
            {item.canonical?.name}
          </p>
          <p className="text-xs text-gray-500 truncate">
            {item.canonical?.code}
          </p>
        </div>
      </div>
      {!isLocked && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove(item._id);
          }}
          className="flex-shrink-0 text-gray-400 hover:text-red-600"
          title="Remove advantage"
        >
          ✕
        </button>
      )}
    </div>
  );
}

export default function AdvantagesBoardSetupPage() {
  const router = useRouter();
  const params = useParams();
  const seasonId = params.seasonId as string;
  const { isAuthenticated, user, isLoading } = useAuth();

  const [showAddAdvantageDialog, setShowAddAdvantageDialog] = useState(false);
  const [selectedCategoryForAdvantage, setSelectedCategoryForAdvantage] = useState<string | null>(null);
  const [searchBank, setSearchBank] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [optimisticAdvantages, setOptimisticAdvantages] = useState<AdvantageItem[] | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const season = useQuery(api.seasons.getSeason, {
    seasonId: seasonId as Id<"seasons">,
  });

  const boardData = useQuery(api.advantages.getBoard, {
    seasonId: seasonId as Id<"seasons">,
  });

  const canonicalAdvantages = useQuery(api.admin.getCanonicalAdvantages);

  const createBoardMutation = useMutation(api.advantages.createBoard);
  const addAdvantageMutation = useMutation(api.advantages.addAdvantage);
  const removeAdvantageMutation = useMutation(api.advantages.removeAdvantage);
  const lockBoardMutation = useMutation(api.advantages.lockBoard);
  const unlockBoardMutation = useMutation(api.advantages.unlockBoard);
  const reorderAdvantagesMutation = useMutation(api.advantages.reorderAdvantages);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace("/login");
    }
  }, [isAuthenticated, isLoading, router]);

  useEffect(() => {
    if (season && !boardData) {
      createBoardMutation({ seasonId: seasonId as Id<"seasons"> });
    }
  }, [season, boardData, seasonId]);

  useEffect(() => {
    if (boardData?.advantages) {
      setOptimisticAdvantages(boardData.advantages);
    }
  }, [boardData?.advantages]);

  const isCommissioner = season && season.league.commissioner.id === user?.id;

  async function handleAddAdvantage(canonicalId: Id<"canonical_advantages">) {
    if (!selectedCategoryForAdvantage || !boardData?.board) {
      toast.error("Category not selected");
      return;
    }

    setIsSubmitting(true);
    try {
      await addAdvantageMutation({
        boardId: boardData.board._id,
        categoryId: selectedCategoryForAdvantage,
        canonicalAdvantageId: canonicalId,
      });
      toast.success("Advantage added");
      setSearchBank("");
      // Focus the search input after adding
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 0);
    } catch (err) {
      toast.error("Failed to add advantage");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleRemoveAdvantage(advantageId: Id<"board_advantages">) {
    try {
      await removeAdvantageMutation({ advantageId });
      toast.success("Advantage removed");
    } catch (err) {
      toast.error("Failed to remove advantage");
    }
  }

  async function handleLockBoard() {
    if (!boardData?.board) return;
    try {
      await lockBoardMutation({ boardId: boardData.board._id });
      toast.success("Board locked");
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Failed to lock board";
      toast.error(errorMsg);
    }
  }

  async function handleUnlockBoard() {
    if (!boardData?.board) return;
    try {
      await unlockBoardMutation({ boardId: boardData.board._id });
      toast.success("Board unlocked");
    } catch (err) {
      toast.error("Failed to unlock board");
    }
  }

  function openAdvantageDialog(categoryId: string) {
    setSelectedCategoryForAdvantage(categoryId);
    setShowAddAdvantageDialog(true);
    setTimeout(() => searchInputRef.current?.focus(), 0);
  }

  if (isLoading || !isAuthenticated || !user) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-10">
        <p>Loading...</p>
      </main>
    );
  }

  if (!isCommissioner) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-10">
        <p className="text-red-500">Only the commissioner can access this page</p>
        <Button onClick={() => router.push("/")} className="mt-4">
          Back to Dashboard
        </Button>
      </main>
    );
  }

  if (!boardData?.board) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-10">
        <p>Initializing board...</p>
      </main>
    );
  }

  const board = boardData.board;
  const advantages = optimisticAdvantages || boardData.advantages || [];

  // Get IDs of advantages already on the board
  const existingAdvantageIds = new Set(
    advantages.map((a) => a.canonicalAdvantageId)
  );

  const filteredCanonical = canonicalAdvantages?.filter((c) => {
    // Exclude advantages already on the board
    if (existingAdvantageIds.has(c._id)) {
      return false;
    }
    // Filter by search text
    return (
      c.name.toLowerCase().includes(searchBank.toLowerCase()) ||
      c.code.toLowerCase().includes(searchBank.toLowerCase()) ||
      c.description.toLowerCase().includes(searchBank.toLowerCase())
    );
  }) || [];

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <div className="mb-8">
        <h1 className="font-semibold text-3xl">{season?.name} - Advantage Board Setup</h1>
        <p className="mt-2 text-gray-600">
          Organize advantages into Tier 1, Tier 2, and Tier 3 for this season.
        </p>
      </div>

      {/* Advantage Board Grid */}
      {board.categories.length > 0 ? (
        <div className="mb-8 overflow-x-auto">
          <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(auto-fit, minmax(300px, 1fr))` }}>
            {board.categories.map((category) => {
              const categoryItems = advantages.filter(
                (a) => a.categoryId === category.id
              );

              return (
                <div
                  key={category.id}
                  className="flex flex-col rounded-lg border border-gray-300 bg-white p-4 shadow-sm"
                >
                  {/* Category Header */}
                  <div className="mb-4 flex items-start justify-between border-b pb-3">
                    <h2 className="font-bold text-base text-gray-900">
                      {category.title}
                    </h2>
                  </div>

                  {/* Advantages in Category */}
                  <div className="mb-4 flex-1 space-y-2">
                    {categoryItems.length > 0 ? (
                      <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragEnd={async (event: DragEndEvent) => {
                          const { active, over } = event;

                          if (!over || active.id === over.id || boardData?.board?.isLocked) {
                            return;
                          }

                          const oldIndex = categoryItems.findIndex((a) => a._id === active.id);
                          const newIndex = categoryItems.findIndex((a) => a._id === over.id);

                          if (oldIndex !== -1 && newIndex !== -1) {
                            // Optimistically update
                            const reorderedItems = arrayMove(categoryItems, oldIndex, newIndex).map((item, idx) => ({
                              ...item,
                              order: idx,
                            }));

                            setOptimisticAdvantages((prev) => {
                              if (!prev) return prev;
                              const otherAdvantages = prev.filter((a) => a.categoryId !== category.id);
                              return [...otherAdvantages, ...reorderedItems];
                            });

                            const newOrder = reorderedItems.map((a) => a._id);

                            try {
                              await reorderAdvantagesMutation({
                                categoryId: category.id,
                                advantageIds: newOrder,
                              });
                            } catch (err) {
                              if (boardData?.advantages) {
                                setOptimisticAdvantages(boardData.advantages);
                              }
                              toast.error("Failed to reorder advantages");
                            }
                          }
                        }}
                      >
                        <SortableContext
                          items={categoryItems.map((a) => a._id)}
                          strategy={verticalListSortingStrategy}
                        >
                          {categoryItems.map((item) => (
                            <SortableAdvantageItem
                              key={item._id}
                              item={item}
                              isLocked={!!boardData?.board?.isLocked}
                              onRemove={handleRemoveAdvantage}
                            />
                          ))}
                        </SortableContext>
                      </DndContext>
                    ) : (
                      <p className="text-xs text-gray-400">No advantages yet</p>
                    )}
                  </div>

                  {/* Add Advantage Button */}
                  {!boardData?.board?.isLocked && (
                    <Button
                      onClick={() => openAdvantageDialog(category.id)}
                      variant="outline"
                      className="w-full text-sm"
                      size="sm"
                    >
                      + Add Advantage
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="mb-8 rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 p-8 text-center">
          <p className="text-gray-600">No tiers initialized yet</p>
        </div>
      )}

      {/* Lock Board Section */}
      {!boardData?.board?.isLocked && (
        <div className="mb-8 rounded-lg border border-gray-200 bg-white p-6">
          <h2 className="mb-3 font-semibold text-lg">Ready to Lock?</h2>
          <p className="mb-4 text-sm text-gray-600">
            Configure your advantages and lock the board when ready.
            Current: {advantages.length} advantages
          </p>
          <Button
            onClick={handleLockBoard}
            className="bg-blue-600 hover:bg-blue-700"
          >
            Lock Advantage Board
          </Button>
        </div>
      )}

      {boardData?.board?.isLocked && (
        <div className="mb-8 rounded-lg border-2 border-blue-200 bg-blue-50 p-6">
          <div className="flex items-start justify-between">
            <div>
              <p className="font-semibold text-blue-900">✓ Advantage Board Locked In</p>
              <p className="mt-2 text-sm text-blue-700">
                {advantages.length} advantages across {board.categories.length} tiers
              </p>
            </div>
            <Button
              onClick={handleUnlockBoard}
              variant="outline"
              className="text-sm"
            >
              Unlock
            </Button>
          </div>
        </div>
      )}

      {/* Add Advantage Dialog */}
      <Dialog open={showAddAdvantageDialog} onOpenChange={(open) => {
        if (!open) {
          setShowAddAdvantageDialog(false);
          setSelectedCategoryForAdvantage(null);
          setSearchBank("");
        }
      }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add Advantage</DialogTitle>
            <DialogDescription>
              Select an advantage from the canonical library to add to this tier.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {selectedCategoryForAdvantage && (
              <div>
                <label className="block text-sm font-medium mb-2">Search Advantages</label>
                <Input
                  ref={searchInputRef}
                  placeholder="Search by name or code..."
                  value={searchBank}
                  onChange={(e) => setSearchBank(e.target.value)}
                  className="w-full"
                  autoFocus
                />
              </div>
            )}
            <div className="max-h-96 overflow-y-auto space-y-2">
              {filteredCanonical.length > 0 ? (
                filteredCanonical.map((advantage) => (
                  <div
                    key={advantage._id}
                    className="flex items-start justify-between rounded border p-3 hover:bg-gray-50"
                  >
                    <div className="flex-1 pr-2">
                      <p className="font-medium text-sm text-gray-900">
                        {advantage.name}
                      </p>
                      <p className="text-xs text-gray-600 mb-1">
                        {advantage.code}
                      </p>
                      <p className="text-xs text-gray-600">
                        {advantage.description}
                      </p>
                    </div>
                    <Button
                      onClick={() => handleAddAdvantage(advantage._id)}
                      disabled={isSubmitting}
                      size="sm"
                    >
                      Add
                    </Button>
                  </div>
                ))
              ) : (
                <p className="text-sm text-gray-500">
                  No advantages found
                </p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button
              onClick={() => setShowAddAdvantageDialog(false)}
              variant="outline"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Back Button */}
      <div>
        <Button
          onClick={() => router.push(`/seasons/${seasonId}/admin`)}
          variant="outline"
        >
          Back to Season Admin
        </Button>
      </div>
    </main>
  );
}

