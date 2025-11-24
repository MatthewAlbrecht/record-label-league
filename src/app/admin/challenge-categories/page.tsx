"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "convex/_generated/api";
import type { Id } from "convex/_generated/dataModel";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { useAuth } from "~/lib/auth-context";
import { toast } from "sonner";

export default function AdminChallengeCategoriesPage() {
	const router = useRouter();
	const { isAuthenticated, user, isLoading } = useAuth();

	const [newCategoryName, setNewCategoryName] = useState("");
	const [isSubmitting, setIsSubmitting] = useState(false);

	const currentUser = useQuery(
		api.users.getUserById,
		user ? { userId: user.id as Id<"users"> } : "skip"
	);

	const categories = useQuery(api.admin.getChallengeCategories);
	const createCategoryMutation = useMutation(api.admin.createChallengeCategory);

	useEffect(() => {
		if (!isLoading && !isAuthenticated) {
			router.replace("/login");
		}
	}, [isAuthenticated, isLoading, router]);

	useEffect(() => {
		if (currentUser !== undefined && !currentUser?.isAdmin) {
			router.replace("/");
		}
	}, [currentUser, router]);

	async function handleAddCategory() {
		if (!newCategoryName.trim()) {
			toast.error("Category name cannot be empty");
			return;
		}

		setIsSubmitting(true);
		try {
			await createCategoryMutation({
				name: newCategoryName.trim(),
			});
			toast.success("Category created!");
			setNewCategoryName("");
		} catch (err) {
			const errorMsg = err instanceof Error ? err.message : "Failed to create category";
			toast.error(errorMsg);
		} finally {
			setIsSubmitting(false);
		}
	}

	if (isLoading || !isAuthenticated || !user || currentUser === undefined) {
		return (
			<main className="mx-auto max-w-6xl px-4 py-10">
				<p>Loading...</p>
			</main>
		);
	}

	return (
		<main className="mx-auto max-w-2xl px-4 py-10">
			<div className="mb-8">
				<h1 className="font-semibold text-3xl">Challenge Categories</h1>
				<p className="mt-2 text-gray-600">
					Manage the categories used when organizing challenges.
				</p>
			</div>

			{/* Add Category Form */}
			<div className="mb-8 rounded-lg border border-gray-200 bg-white p-6">
				<h2 className="mb-4 font-semibold text-lg">Add New Category</h2>
				<div className="flex gap-2">
					<Input
						value={newCategoryName}
						onChange={(e) => setNewCategoryName(e.target.value)}
						placeholder="e.g., Indie, Hip-Hop, Electronic"
						className="flex-1"
						onKeyDown={(e) => {
							if (e.key === "Enter") {
								handleAddCategory();
							}
						}}
					/>
					<Button
						onClick={handleAddCategory}
						disabled={isSubmitting}
						className="bg-green-600 hover:bg-green-700"
					>
						{isSubmitting ? "Adding..." : "Add"}
					</Button>
				</div>
			</div>

			{/* Categories List */}
			{categories && categories.length > 0 ? (
				<div className="mb-8 space-y-2">
					<h2 className="font-semibold text-lg mb-3">Existing Categories</h2>
					{categories.map((category) => (
						<div
							key={category._id}
							className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 flex items-center justify-between"
						>
							<p className="font-medium text-gray-900">{category.name}</p>
							<p className="text-xs text-gray-500">
								{new Date(category.createdAt).toLocaleDateString()}
							</p>
						</div>
					))}
				</div>
			) : (
				<p className="text-gray-500">No categories yet. Add one to get started!</p>
			)}

			{/* Back Button */}
			<div>
				<Button
					onClick={() => router.push("/admin")}
					variant="outline"
				>
					Back to Admin
				</Button>
			</div>
		</main>
	);
}

