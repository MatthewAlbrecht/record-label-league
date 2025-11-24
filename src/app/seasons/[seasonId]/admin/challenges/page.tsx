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
import { GripVertical } from "lucide-react";
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

type ChallengeItem = {
	_id: Id<"board_challenges">;
	categoryId: string;
	canonicalChallengeId: Id<"canonical_challenges">;
	order: number;
	canonical?: {
		emoji: string;
		title: string;
	} | null;
};

type SortableChallengeItemProps = {
	item: ChallengeItem;
	isLocked: boolean;
	onRemove: (id: Id<"board_challenges">) => void;
};

function SortableChallengeItem({ item, isLocked, onRemove }: SortableChallengeItemProps) {
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
				<span className="text-lg flex-shrink-0">{item.canonical?.emoji}</span>
				<p className="text-xs font-medium text-gray-700 truncate">
					{item.canonical?.title}
				</p>
			</div>
			{!isLocked && (
				<button
					onClick={(e) => {
						e.stopPropagation();
						onRemove(item._id);
					}}
					className="flex-shrink-0 text-gray-400 hover:text-red-600"
					title="Remove challenge"
				>
					✕
				</button>
			)}
		</div>
	);
}

export default function ChallengesBoardSetupPage() {
	const router = useRouter();
	const params = useParams();
	const seasonId = params.seasonId as string;
	const { isAuthenticated, user, isLoading } = useAuth();

	const [showAddCategoryDialog, setShowAddCategoryDialog] = useState(false);
	const [newCategoryTitle, setNewCategoryTitle] = useState("");
	const [showAddChallengeDialog, setShowAddChallengeDialog] = useState(false);
	const [selectedCategoryForChallenge, setSelectedCategoryForChallenge] = useState<string | null>(null);
	const [searchBank, setSearchBank] = useState("");
	const [isSubmitting, setIsSubmitting] = useState(false);
	const searchInputRef = useRef<HTMLInputElement>(null);
	const [optimisticChallenges, setOptimisticChallenges] = useState<ChallengeItem[] | null>(null);

	const sensors = useSensors(
		useSensor(PointerSensor),
		useSensor(KeyboardSensor, {
			coordinateGetter: sortableKeyboardCoordinates,
		})
	);

	const season = useQuery(api.seasons.getSeason, {
		seasonId: seasonId as Id<"seasons">,
	});

	const boardData = useQuery(api.challenges.getBoard, {
		seasonId: seasonId as Id<"seasons">,
	});

	// Sync optimistic state with server data
	useEffect(() => {
		if (boardData?.challenges) {
			setOptimisticChallenges(boardData.challenges);
		}
	}, [boardData?.challenges]);

	const canonicalChallenges = useQuery(api.admin.getCanonicalChallenges);
	const canonicalCategories = useQuery(api.admin.getChallengeCategories);

	const createBoardMutation = useMutation(api.challenges.createBoard);
	const addCategoryMutation = useMutation(api.challenges.addCategory);
	const addChallengeMutation = useMutation(api.challenges.addChallenge);
	const removeChallengeMutation = useMutation(api.challenges.removeChallenge);
	const deleteCategoryMutation = useMutation(api.challenges.deleteCategory);
	const lockBoardMutation = useMutation(api.challenges.lockBoard);
	const unlockBoardMutation = useMutation(api.challenges.unlockBoard);
	const reorderChallengesMutation = useMutation(api.challenges.reorderChallenges);

	useEffect(() => {
		if (!isLoading && !isAuthenticated) {
			router.replace("/login");
		}
	}, [isAuthenticated, isLoading, router]);

	// Initialize board if needed
	useEffect(() => {
		if (season && !boardData) {
			createBoardMutation({ seasonId: seasonId as Id<"seasons"> });
		}
	}, [season, boardData, seasonId]);

	const isCommissioner = season && season.league.commissioner.id === user?.id;

	async function handleAddCategory() {
		if (!newCategoryTitle.trim()) {
			toast.error("Category selection required");
			return;
		}

		if (!boardData?.board) {
			toast.error("Board not initialized");
			return;
		}

		setIsSubmitting(true);
		try {
			await addCategoryMutation({
				boardId: boardData.board._id,
				title: newCategoryTitle.trim(),
			});
			toast.success("Category added");
			setNewCategoryTitle("");
			setShowAddCategoryDialog(false);
		} catch (err) {
			toast.error("Failed to add category");
		} finally {
			setIsSubmitting(false);
		}
	}

	async function handleAddChallenge(canonicalId: Id<"canonical_challenges">) {
		if (!selectedCategoryForChallenge || !boardData?.board) {
			toast.error("Category not selected");
			return;
		}

		setIsSubmitting(true);
		try {
			await addChallengeMutation({
				boardId: boardData.board._id,
				categoryId: selectedCategoryForChallenge,
				canonicalChallengeId: canonicalId,
			});
			toast.success("Challenge added");
			setSearchBank("");
			setTimeout(() => searchInputRef.current?.focus(), 0);
		} catch (err) {
			toast.error("Failed to add challenge");
		} finally {
			setIsSubmitting(false);
		}
	}

	async function handleRemoveChallenge(challengeId: Id<"board_challenges">) {
		if (!confirm("Remove this challenge?")) return;

		try {
			await removeChallengeMutation({ challengeId });
			toast.success("Challenge removed");
		} catch (err) {
			toast.error("Failed to remove challenge");
		}
	}

	async function handleDeleteCategory(categoryId: string) {
		if (!confirm("Delete this category and all its challenges?")) return;

		if (!boardData?.board) return;

		try {
			await deleteCategoryMutation({
				boardId: boardData.board._id,
				categoryId,
			});
			toast.success("Category deleted");
		} catch (err) {
			toast.error("Failed to delete category");
		}
	}

	async function handleLockBoard() {
		if (!boardData?.board) return;

		try {
			await lockBoardMutation({ boardId: boardData.board._id });
			toast.success("Challenge board locked in!");
		} catch (err) {
			const errorMsg = err instanceof Error ? err.message : "Failed to lock board";
			toast.error(errorMsg);
		}
	}

	async function handleUnlockBoard() {
		if (!boardData?.board) return;

		try {
			await unlockBoardMutation({ boardId: boardData.board._id });
			toast.success("Challenge board unlocked");
		} catch (err) {
			const errorMsg = err instanceof Error ? err.message : "Failed to unlock board";
			toast.error(errorMsg);
		}
	}

	function openChallengeDialog(categoryId?: string) {
		setSelectedCategoryForChallenge(categoryId || null);
		setShowAddChallengeDialog(true);
		setSearchBank("");
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
	// Use optimistic state if available, otherwise fall back to server data
	const challenges = optimisticChallenges || boardData.challenges || [];

	const alreadyAddedChallengeIds = new Set(challenges.map((c) => c.canonicalChallengeId));

	const filteredCanonical = canonicalChallenges?.filter((c) => {
		// Filter by selected category if one is chosen
		if (selectedCategoryForChallenge) {
			// Find the canonical category ID that matches this board category
			const boardCategory = board.categories.find((cat) => cat.id === selectedCategoryForChallenge);
			const canonicalCat = canonicalCategories?.find((cat) => cat.name === boardCategory?.title);
			if (!canonicalCat || c.categoryId !== canonicalCat._id) return false;
		}

		// Filter out already added challenges
		if (alreadyAddedChallengeIds.has(c._id)) return false;

		// Filter by search text
		return (
			c.title.toLowerCase().includes(searchBank.toLowerCase()) ||
			c.description.toLowerCase().includes(searchBank.toLowerCase())
		);
	}) || [];

	return (
		<main className="mx-auto max-w-6xl px-4 py-10">
			<div className="mb-8">
				<h1 className="font-semibold text-3xl">{season?.name} - Challenge Board Setup</h1>
				<p className="mt-2 text-gray-600">
					Build your challenge board with categories and challenges.
				</p>
			</div>

			{/* Add Category Button */}
			{!boardData?.board?.isLocked && (
				<div className="mb-8 flex justify-end">
					<Button onClick={() => setShowAddCategoryDialog(true)}>
						+ Add Category
					</Button>
				</div>
			)}

			{/* Challenge Board Grid */}
			{board.categories.length > 0 ? (
				<div className="mb-8 overflow-x-auto">
					<div className="grid gap-4" style={{ gridTemplateColumns: `repeat(auto-fit, minmax(250px, 1fr))` }}>
						{board.categories.map((category) => {
							const categoryItems = challenges.filter(
								(c) => c.categoryId === category.id
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
										{!boardData?.board?.isLocked && (
											<button
												onClick={() => handleDeleteCategory(category.id)}
												className="text-sm text-gray-400 hover:text-red-500"
											>
												✕
											</button>
										)}
									</div>

									{/* Challenges in Category */}
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

													const oldIndex = categoryItems.findIndex((c) => c._id === active.id);
													const newIndex = categoryItems.findIndex((c) => c._id === over.id);

													if (oldIndex !== -1 && newIndex !== -1) {
														// Optimistically update local state immediately
														const reorderedItems = arrayMove(categoryItems, oldIndex, newIndex).map((item, idx) => ({
															...item,
															order: idx, // Update order for reordered items
														}));

														// Update all challenges with the reordered ones for this category
														setOptimisticChallenges((prev) => {
															if (!prev) return prev;
															const otherChallenges = prev.filter((c) => c.categoryId !== category.id);
															return [...otherChallenges, ...reorderedItems];
														});

														const newOrder = reorderedItems.map((c) => c._id);

														try {
															await reorderChallengesMutation({
																categoryId: category.id,
																challengeIds: newOrder,
															});
															// Success - server will sync via query, optimistic state will be updated
														} catch (err) {
															// Revert on error
															if (boardData?.challenges) {
																setOptimisticChallenges(boardData.challenges);
															}
															toast.error("Failed to reorder challenges");
														}
													}
												}}
											>
												<SortableContext
													items={categoryItems.map((c) => c._id)}
													strategy={verticalListSortingStrategy}
												>
													{categoryItems.map((item) => (
														<SortableChallengeItem
															key={item._id}
															item={item}
															isLocked={!!boardData?.board?.isLocked}
															onRemove={handleRemoveChallenge}
														/>
													))}
												</SortableContext>
											</DndContext>
										) : (
											<p className="text-xs text-gray-400">No challenges yet</p>
										)}
									</div>

									{/* Add Challenge Button */}
									{!boardData?.board?.isLocked && (
										<Button
											onClick={() => openChallengeDialog(category.id)}
											variant="outline"
											className="w-full text-sm"
											size="sm"
										>
											+ Add Challenge
										</Button>
									)}
								</div>
							);
						})}
					</div>
				</div>
			) : (
				<div className="mb-8 rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 p-8 text-center">
					<p className="text-gray-600">No categories yet. Add one to get started!</p>
				</div>
			)}

			{/* Lock Board Section */}
			{!boardData?.board?.isLocked && (
				<div className="mb-8 rounded-lg border border-gray-200 bg-white p-6">
					<h2 className="mb-3 font-semibold text-lg">Ready to Lock?</h2>
					<p className="mb-4 text-sm text-gray-600">
						You need at least 15 challenges to lock the board.
						Current: {challenges.length} challenges
					</p>
					<Button
						onClick={handleLockBoard}
						disabled={challenges.length < 15}
						className="bg-green-600 hover:bg-green-700 disabled:bg-gray-300"
					>
						{challenges.length >= 15 ? "Lock in Challenge Board" : "Add More Challenges"}
					</Button>
				</div>
			)}

			{boardData?.board?.isLocked && (
				<div className="mb-8 rounded-lg border-2 border-green-200 bg-green-50 p-6">
					<div className="flex items-start justify-between">
						<div>
							<p className="font-semibold text-green-900">✓ Challenge Board Locked In</p>
							<p className="mt-2 text-sm text-green-700">
								{challenges.length} challenges across {board.categories.length} categories
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

			{/* Add Challenge Dialog */}
			<Dialog open={showAddChallengeDialog} onOpenChange={(open) => {
				if (!open) {
					setShowAddChallengeDialog(false);
					setSelectedCategoryForChallenge(null);
					setSearchBank("");
				}
			}}>
				<DialogContent className="max-w-2xl">
					<DialogHeader>
						<DialogTitle>Add Challenge</DialogTitle>
						<DialogDescription>
							Select a category and browse challenges from the canonical library.
						</DialogDescription>
					</DialogHeader>

					<div className="space-y-4">
						<div>
							<label className="block text-sm font-medium mb-2">Category *</label>
							<select
								value={selectedCategoryForChallenge || ""}
								onChange={(e) => setSelectedCategoryForChallenge(e.target.value)}
								className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
							>
								<option value="">Select a category...</option>
								{board.categories.map((cat) => (
									<option key={cat.id} value={cat.id}>
										{cat.title}
									</option>
								))}
							</select>
						</div>

						{selectedCategoryForChallenge && (
							<div className="space-y-3">
								<div>
									<label className="block text-sm font-medium mb-2">Search Challenges</label>
									<Input
										ref={searchInputRef}
										placeholder="Search challenges..."
										value={searchBank}
										onChange={(e) => setSearchBank(e.target.value)}
										className="w-full"
										autoFocus
									/>
								</div>
								<div className="max-h-96 overflow-y-auto space-y-2">
									{filteredCanonical.length > 0 ? (
										filteredCanonical.map((challenge) => (
											<div
												key={challenge._id}
												className="flex items-start justify-between rounded border p-3 hover:bg-gray-50"
											>
												<div className="flex-1 pr-2">
													<div className="flex items-center gap-1.5 mb-1">
														<span className="text-2xl leading-none">{challenge.emoji}</span>
														<p className="font-medium text-sm text-gray-900">
															{challenge.title}
														</p>
													</div>
													{challenge.generalVibe && (
														<div className="mb-2 px-2 py-1 rounded bg-blue-50 border border-blue-100">
															<p className="text-xs text-blue-700 italic">{challenge.generalVibe}</p>
														</div>
													)}
													<p className="text-xs text-gray-600">
														{challenge.description}
													</p>
												</div>
												<Button
													onClick={() => handleAddChallenge(challenge._id)}
													disabled={isSubmitting}
													size="sm"
												>
													Add
												</Button>
											</div>
										))
									) : (
										<p className="text-sm text-gray-500">
											No challenges found
										</p>
									)}
								</div>
							</div>
						)}
					</div>

					<DialogFooter>
						<Button
							onClick={() => setShowAddChallengeDialog(false)}
							variant="outline"
						>
							Close
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Add Category Dialog */}
			<Dialog open={showAddCategoryDialog} onOpenChange={setShowAddCategoryDialog}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Add Category</DialogTitle>
						<DialogDescription>
							Select a canonical category to add to your challenge board.
						</DialogDescription>
					</DialogHeader>
					<div>
						<label className="block text-sm font-medium mb-2">
							Category *
						</label>
						<select
							value={newCategoryTitle}
							onChange={(e) => setNewCategoryTitle(e.target.value)}
							className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
						>
							<option value="">Select a category...</option>
							{canonicalCategories?.filter((cat) =>
								!board.categories.some((boardCat) => boardCat.title === cat.name)
							).map((cat) => (
								<option key={cat._id} value={cat.name}>
									{cat.name}
								</option>
							))}
						</select>
					</div>
					<DialogFooter>
						<Button
							onClick={() => setShowAddCategoryDialog(false)}
							variant="outline"
						>
							Cancel
						</Button>
						<Button
							onClick={handleAddCategory}
							disabled={isSubmitting || !newCategoryTitle}
						>
							{isSubmitting ? "Adding..." : "Add"}
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
					Back to Admin
				</Button>
			</div>
		</main>
	);
}

