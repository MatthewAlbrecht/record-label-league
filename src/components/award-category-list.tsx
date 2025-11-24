"use client";

import { useState } from "react";
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
import { GripVertical, Edit2, Rows3 } from "lucide-react";
import { Input } from "~/components/ui/input";
import { Textarea } from "~/components/ui/textarea";
import { Button } from "~/components/ui/button";

export type AwardCategory = {
  id: string;
  name: string;
  description: string;
  points: 1 | 2 | 3;
};

type AwardCategoryItemProps = {
  award: AwardCategory;
  index: number;
  onUpdate: (index: number, field: keyof AwardCategory, value: any) => void;
  mode: "edit" | "reorder";
};

function AwardCategoryItem({ award, index, onUpdate, mode }: AwardCategoryItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: award.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  if (mode === "reorder") {
    return (
      <div
        ref={setNodeRef}
        style={style}
        className="border rounded-lg p-3 bg-white hover:bg-gray-50 relative flex items-center gap-3 transition-colors"
      >
        <div
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600 flex-shrink-0"
        >
          <GripVertical size={18} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-gray-900 truncate">{award.name}</p>
          <p className="text-xs text-gray-500 line-clamp-2">{award.description}</p>
        </div>
        <span className="text-sm font-medium text-gray-600 flex-shrink-0 px-2 py-1 bg-gray-100 rounded">
          {award.points}pt
        </span>
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="border rounded-lg p-4 bg-gray-50 relative"
    >
      <span className="absolute top-2 right-4 text-xs font-medium text-gray-600">
        {award.points}pt
      </span>
      <div className="mb-3">
        <label className="block text-xs font-medium text-gray-600 mb-1">Name</label>
        <Input
          value={award.name}
          onChange={(e) => onUpdate(index, "name", e.target.value)}
          placeholder="Award name"
          className="w-full text-sm bg-white"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
        <Textarea
          value={award.description}
          onChange={(e) => onUpdate(index, "description", e.target.value)}
          placeholder="Award description"
          className="w-full text-sm bg-white"
          rows={2}
        />
      </div>
    </div>
  );
}

type AwardCategoryListProps = {
  awards: AwardCategory[];
  onAwardsChange: (awards: AwardCategory[]) => void;
  onAwardUpdate: (index: number, field: keyof AwardCategory, value: any) => void;
  defaultMode?: "edit" | "reorder";
};

export function AwardCategoryList({
  awards,
  onAwardsChange,
  onAwardUpdate,
  defaultMode = "edit",
}: AwardCategoryListProps) {
  const [mode, setMode] = useState<"edit" | "reorder">(defaultMode);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  function getPointsForPosition(index: number): 1 | 2 | 3 {
    if (index < 4) return 1;
    if (index < 6) return 2;
    return 3;
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = awards.findIndex((award) => award.id === active.id);
      const newIndex = awards.findIndex((award) => award.id === over.id);

      const reorderedAwards = arrayMove(awards, oldIndex, newIndex);

      // Recalculate points based on new position
      const updatedAwards = reorderedAwards.map((award, index) => ({
        ...award,
        points: getPointsForPosition(index),
      }));

      onAwardsChange(updatedAwards);
    }
  }

  return (
    <div>
      <div className="flex gap-2 mb-4">
        <Button
          onClick={() => setMode("edit")}
          variant={mode === "edit" ? "default" : "outline"}
          size="sm"
          className="gap-2"
        >
          <Edit2 size={16} />
          Edit Inputs
        </Button>
        <Button
          onClick={() => setMode("reorder")}
          variant={mode === "reorder" ? "default" : "outline"}
          size="sm"
          className="gap-2"
        >
          <Rows3 size={16} />
          Reorder
        </Button>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={awards.map((a) => a.id)} strategy={verticalListSortingStrategy}>
          <div className={mode === "edit" ? "space-y-4" : "space-y-2"}>
            {awards.map((award, index) => (
              <AwardCategoryItem
                key={award.id}
                award={award}
                index={index}
                onUpdate={onAwardUpdate}
                mode={mode}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}

