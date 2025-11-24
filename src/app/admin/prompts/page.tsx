"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "convex/_generated/api";
import type { Id } from "convex/_generated/dataModel";
import { Button } from "~/components/ui/button";
import { Textarea } from "~/components/ui/textarea";
import { useAuth } from "~/lib/auth-context";
import { toast } from "sonner";

export default function AdminPromptsPage() {
	const router = useRouter();
	const { isAuthenticated, user, isLoading } = useAuth();

	const [newPromptsText, setNewPromptsText] = useState("");
	const [isSubmitting, setIsSubmitting] = useState(false);

	const currentUser = useQuery(
		api.users.getUserById,
		user ? { userId: user.id as Id<"users"> } : "skip"
	);

	const canonicalPrompts = useQuery(api.admin.getCanonicalPrompts);
	const addPromptMutation = useMutation(api.admin.addCanonicalPrompt);
	const deletePromptMutation = useMutation(api.admin.deleteCanonicalPrompt);

	useEffect(() => {
		if (!isLoading && !isAuthenticated) {
			router.replace("/login");
		}
	}, [isAuthenticated, isLoading, router]);

	useEffect(() => {
		if (currentUser !== undefined && !currentUser?.isAdmin) {
			router.replace("/dashboard");
		}
	}, [currentUser, router]);

	async function handleAddPrompts() {
		if (!newPromptsText.trim()) {
			toast.error("Please enter at least one prompt");
			return;
		}

		const lines = newPromptsText
			.split("\n")
			.map((line) => line.trim())
			.filter((line) => line.length > 0);

		if (lines.length === 0) {
			toast.error("Please enter at least one prompt");
			return;
		}

		setIsSubmitting(true);
		let successCount = 0;
		let failureCount = 0;

		for (const text of lines) {
			try {
				await addPromptMutation({ text });
				successCount++;
			} catch (err) {
				failureCount++;
				const errorMsg =
					err instanceof Error ? err.message : "Unknown error";
				console.log(`Failed to add "${text}": ${errorMsg}`);
			}
		}

		setIsSubmitting(false);

		if (successCount > 0) {
			toast.success(
				`Added ${successCount} prompt${successCount !== 1 ? "s" : ""}`
			);
		}

		if (failureCount > 0) {
			toast.error(
				`Failed to add ${failureCount} prompt${failureCount !== 1 ? "s" : ""} (likely duplicates)`
			);
		}

		setNewPromptsText("");
	}

	async function handleDeletePrompt(id: Id<"canonical_draft_prompts">) {
		if (!confirm("Delete this prompt?")) return;

		try {
			await deletePromptMutation({ id });
			toast.success("Prompt deleted");
		} catch (err) {
			toast.error("Failed to delete prompt");
		}
	}

	if (isLoading || !isAuthenticated || !user || currentUser === undefined) {
		return (
			<main className="mx-auto max-w-4xl px-4 py-10">
				<p>Loading...</p>
			</main>
		);
	}

	return (
		<main className="mx-auto max-w-4xl px-4 py-10">
			<div className="mb-8">
				<h1 className="font-semibold text-3xl">Canonical Prompt Bank</h1>
				<p className="mt-2 text-gray-600">
					Manage the global library of draft prompts.
				</p>
			</div>

			{/* Add Prompts Section */}
			<div className="mb-8 rounded-lg border border-gray-200 bg-white p-6">
				<h2 className="mb-4 font-semibold text-lg">Add Prompts</h2>
				<p className="mb-4 text-sm text-gray-600">
					Enter one prompt per line. Duplicates will be skipped.
				</p>
				<div className="space-y-3">
					<Textarea
						value={newPromptsText}
						onChange={(e) => setNewPromptsText(e.target.value)}
						placeholder={`Enter prompts, one per line:
Artist you've wanted to dive deeper into
Artist you recently fell in love with
Artist whose most recent release is their best work
Artist more famous for live shows than recordings
Artist you'd want to see perform in a completely silent room`}
						className="min-h-32 font-mono text-sm"
					/>
					<div className="flex justify-end">
						<Button
							onClick={handleAddPrompts}
							disabled={isSubmitting || !newPromptsText.trim()}
							className="bg-blue-600 hover:bg-blue-700"
						>
							{isSubmitting ? "Adding..." : "Add Prompts"}
						</Button>
					</div>
				</div>
			</div>

			{/* Prompts Grid */}
			<div className="mb-8">
				<h2 className="mb-4 font-semibold text-lg">
					Current Prompts ({canonicalPrompts?.length || 0})
				</h2>
				{canonicalPrompts && canonicalPrompts.length > 0 ? (
					<div className="grid gap-3">
						{canonicalPrompts.map((prompt) => (
							<div
								key={prompt._id}
								className="flex items-start justify-between rounded-lg border border-gray-200 bg-gray-50 p-4"
							>
								<div className="flex-1">
									<p className="text-sm text-gray-800">
										{prompt.text}
									</p>
									{prompt.category && (
										<p className="mt-1 text-xs font-medium text-gray-500">
											Category: {prompt.category}
										</p>
									)}
								</div>
								<button
									onClick={() => handleDeletePrompt(prompt._id)}
									className="ml-4 flex-shrink-0 text-sm font-medium text-red-600 hover:text-red-700"
								>
									Delete
								</button>
							</div>
						))}
					</div>
				) : (
					<p className="text-gray-500">
						No prompts yet. Add some above to get started!
					</p>
				)}
			</div>

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
