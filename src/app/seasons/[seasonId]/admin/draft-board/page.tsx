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

export default function DraftBoardSetupPage() {
	const router = useRouter();
	const params = useParams();
	const seasonId = params.seasonId as string;
	const { isAuthenticated, user, isLoading } = useAuth();

	const [showAddCategoryDialog, setShowAddCategoryDialog] = useState(false);
	const [newCategoryTitle, setNewCategoryTitle] = useState("");
	const [showAddPromptDialog, setShowAddPromptDialog] = useState(false);
	const [selectedCategoryForPrompt, setSelectedCategoryForPrompt] = useState<string | null>(null);
	const [promptTab, setPromptTab] = useState<"bank" | "custom">("bank");
	const [customPromptText, setCustomPromptText] = useState("");
	const [searchBank, setSearchBank] = useState("");
	const [isSubmitting, setIsSubmitting] = useState(false);
	const searchInputRef = useRef<HTMLInputElement>(null);

	const season = useQuery(api.seasons.getSeason, {
		seasonId: seasonId as Id<"seasons">,
	});

	const boardData = useQuery(api.drafts.getBoard, {
		seasonId: seasonId as Id<"seasons">,
	});

	const canonicalPrompts = useQuery(api.admin.getCanonicalPrompts);

	const createBoardMutation = useMutation(api.drafts.createBoard);
	const addCategoryMutation = useMutation(api.drafts.addCategory);
	const addPromptMutation = useMutation(api.drafts.addPrompt);
	const importPromptMutation = useMutation(api.drafts.importCanonicalPrompt);
	const deletePromptMutation = useMutation(api.drafts.deletePrompt);
	const deleteCategoryMutation = useMutation(api.drafts.deleteCategory);
	const lockBoardMutation = useMutation(api.drafts.lockBoard);
	const unlockBoardMutation = useMutation(api.drafts.unlockBoard);

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
			toast.error("Category title cannot be empty");
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

	async function handleAddCustomPrompt() {
		if (!customPromptText.trim() || !selectedCategoryForPrompt || !boardData?.board) {
			toast.error("Invalid input");
			return;
		}

		setIsSubmitting(true);
		try {
			await addPromptMutation({
				boardId: boardData.board._id,
				categoryId: selectedCategoryForPrompt,
				text: customPromptText.trim(),
			});
			toast.success("Prompt added");
			setCustomPromptText("");
			setSearchBank("");
			// Keep dialog open, just clear the input
			setTimeout(() => searchInputRef.current?.focus(), 0);
		} catch (err) {
			toast.error("Failed to add prompt");
		} finally {
			setIsSubmitting(false);
		}
	}

	async function handleImportPrompt(canonicalId: Id<"canonical_draft_prompts">) {
		if (!selectedCategoryForPrompt || !boardData?.board) {
			toast.error("Category not selected");
			return;
		}

		setIsSubmitting(true);
		try {
			await importPromptMutation({
				boardId: boardData.board._id,
				categoryId: selectedCategoryForPrompt,
				canonicalId,
			});
			toast.success("Prompt imported");
			setSearchBank("");
			// Keep dialog open
			setTimeout(() => searchInputRef.current?.focus(), 0);
		} catch (err) {
			toast.error("Failed to import prompt");
		} finally {
			setIsSubmitting(false);
		}
	}

	async function handleDeletePrompt(promptId: Id<"draft_prompts">) {
		if (!confirm("Delete this prompt?")) return;

		try {
			await deletePromptMutation({ promptId });
			toast.success("Prompt deleted");
		} catch (err) {
			toast.error("Failed to delete prompt");
		}
	}

	async function handleDeleteCategory(categoryId: string) {
		if (!confirm("Delete this category and all its prompts?")) return;

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

	function openPromptDialog(categoryId: string) {
		setSelectedCategoryForPrompt(categoryId);
		setPromptTab("bank");
		setShowAddPromptDialog(true);
	}

	async function handleLockBoard() {
		if (!boardData?.board) return;

		try {
			await lockBoardMutation({ boardId: boardData.board._id });
			toast.success("Draft board locked in!");
		} catch (err) {
			const errorMsg = err instanceof Error ? err.message : "Failed to lock board";
			toast.error(errorMsg);
		}
	}

	async function handleUnlockBoard() {
		if (!boardData?.board) return;

		try {
			await unlockBoardMutation({ boardId: boardData.board._id });
			toast.success("Draft board unlocked");
		} catch (err) {
			const errorMsg = err instanceof Error ? err.message : "Failed to unlock board";
			toast.error(errorMsg);
		}
	}

	const filteredCanonical = canonicalPrompts?.filter((p) =>
		p.text.toLowerCase().includes(searchBank.toLowerCase())
	) || [];

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
				<Button onClick={() => router.push("/dashboard")} className="mt-4">
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
	const prompts = boardData.prompts || [];

	return (
		<main className="mx-auto max-w-6xl px-4 py-10">
			<div className="mb-8">
				<h1 className="font-semibold text-3xl">{season?.name} - Draft Board Setup</h1>
				<p className="mt-2 text-gray-600">
					Build your Jeopardy-style draft board with categories and prompts.
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

			{/* Draft Board Grid */}
			{board.categories.length > 0 ? (
				<div className="mb-8 overflow-x-auto">
					<div className="grid gap-4" style={{ gridTemplateColumns: `repeat(auto-fit, minmax(250px, 1fr))` }}>
						{board.categories.map((category) => {
							const categoryPrompts = prompts.filter(
								(p) => p.categoryId === category.id
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

									{/* Prompts in Category */}
									<div className="mb-4 flex-1 space-y-2">
										{categoryPrompts.length > 0 ? (
											categoryPrompts.map((prompt) => (
												<div
													key={prompt._id}
													className="rounded border border-gray-200 bg-gray-50 p-2"
												>
													<div className="flex items-start justify-between gap-2">
														<p className="text-xs font-medium text-gray-700 leading-snug flex-1">
															{prompt.text}
														</p>
														{!boardData?.board?.isLocked && (
															<button
																onClick={() => handleDeletePrompt(prompt._id)}
																className="flex-shrink-0 text-gray-400 hover:text-red-600"
																title="Delete prompt"
															>
																✕
															</button>
														)}
													</div>
												</div>
											))
										) : (
											<p className="text-xs text-gray-400">No prompts yet</p>
										)}
									</div>

									{/* Add Prompt Button */}
									{!boardData?.board?.isLocked && (
										<Button
											onClick={() => openPromptDialog(category.id)}
											variant="outline"
											className="w-full text-sm"
											size="sm"
										>
											+ Add Prompt
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

			{/* Add Category Dialog */}
			<Dialog open={showAddCategoryDialog} onOpenChange={setShowAddCategoryDialog}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Add Category</DialogTitle>
						<DialogDescription>
							Create a new category for your draft board.
						</DialogDescription>
					</DialogHeader>
					<div>
						<label className="block text-sm font-medium mb-1">
							Category Title
						</label>
						<Input
							value={newCategoryTitle}
							onChange={(e) => setNewCategoryTitle(e.target.value)}
							placeholder="e.g., Year, Vibe, Genre"
							className="w-full"
						/>
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
							disabled={isSubmitting}
						>
							{isSubmitting ? "Adding..." : "Add"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Add Prompt Dialog */}
			<Dialog open={showAddPromptDialog} onOpenChange={(open) => {
				// Only allow closing via Cancel button or escape key
				if (!open) {
					setShowAddPromptDialog(false);
					setSelectedCategoryForPrompt(null);
					setCustomPromptText("");
					setSearchBank("");
					setPromptTab("bank");
				} else {
					// Clear search when reopening
					setSearchBank("");
				}
			}}>
				<DialogContent className="max-w-2xl">
					<DialogHeader>
						<DialogTitle>
							{board.categories.find((c) => c.id === selectedCategoryForPrompt)?.title || "Add Prompt"}'s Prompts
						</DialogTitle>
						<DialogDescription>
							Choose from the canonical bank or create a custom prompt.
						</DialogDescription>
					</DialogHeader>

					{/* Tabs */}
					<div className="mb-4 flex gap-2 border-b">
						<button
							onClick={() => setPromptTab("bank")}
							className={`px-4 py-2 font-medium ${promptTab === "bank"
								? "border-b-2 border-blue-600 text-blue-600"
								: "text-gray-600"
								}`}
						>
							From Bank
						</button>
						<button
							onClick={() => setPromptTab("custom")}
							className={`px-4 py-2 font-medium ${promptTab === "custom"
								? "border-b-2 border-blue-600 text-blue-600"
								: "text-gray-600"
								}`}
						>
							Custom
						</button>
					</div>

					{/* Tab Content */}
					{promptTab === "bank" ? (
						<div className="space-y-3">
							<Input
								ref={searchInputRef}
								placeholder="Search prompts..."
								value={searchBank}
								onChange={(e) => setSearchBank(e.target.value)}
								className="w-full"
							/>
							<div className="max-h-96 overflow-y-auto space-y-2">
								{filteredCanonical.length > 0 ? (
									filteredCanonical.map((prompt) => (
										<div
											key={prompt._id}
											className="flex items-center justify-between rounded border p-3 hover:bg-gray-50"
										>
											<p className="text-sm">{prompt.text}</p>
											<Button
												onClick={() => handleImportPrompt(prompt._id)}
												disabled={isSubmitting}
												size="sm"
											>
												Add
											</Button>
										</div>
									))
								) : (
									<p className="text-sm text-gray-500">
										No prompts found
									</p>
								)}
							</div>
						</div>
					) : (
						<div className="space-y-3">
							<div>
								<label className="block text-sm font-medium mb-1">
									Custom Prompt Text
								</label>
								<textarea
									value={customPromptText}
									onChange={(e) => setCustomPromptText(e.target.value)}
									placeholder="Enter a custom prompt for this category"
									rows={4}
									className="w-full rounded border border-gray-300 px-3 py-2"
								/>
							</div>
						</div>
					)}

					<DialogFooter>
						<Button
							onClick={() => setShowAddPromptDialog(false)}
							variant="outline"
						>
							Cancel
						</Button>
						<Button
							onClick={
								promptTab === "bank"
									? () => { } // Bank mode handles submission per prompt
									: handleAddCustomPrompt
							}
							disabled={isSubmitting || (promptTab === "custom" && !customPromptText.trim())}
						>
							{isSubmitting ? "Adding..." : "Add"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Lock Board Section */}
			{!boardData?.board?.isLocked && (
				<div className="mb-8 rounded-lg border border-gray-200 bg-white p-6">
					<h2 className="mb-3 font-semibold text-lg">Ready to Lock?</h2>
					<p className="mb-4 text-sm text-gray-600">
						You need at least 16 prompts to lock the draft board.
						Current: {prompts.length} prompts
					</p>
					<Button
						onClick={handleLockBoard}
						disabled={prompts.length < 16}
						className="bg-green-600 hover:bg-green-700 disabled:bg-gray-300"
					>
						{prompts.length >= 16 ? "Lock in Draft Board" : "Add More Prompts"}
					</Button>
				</div>
			)}

			{boardData?.board?.isLocked && (
				<div className="mb-8 rounded-lg border-2 border-green-200 bg-green-50 p-6">
					<div className="flex items-start justify-between">
						<div>
							<p className="font-semibold text-green-900">✓ Draft Board Locked In</p>
							<p className="mt-2 text-sm text-green-700">
								{prompts.length} prompts across {board.categories.length} categories
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

