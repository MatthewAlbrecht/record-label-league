"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "convex/_generated/api";
import type { Id } from "convex/_generated/dataModel";
import { Button } from "~/components/ui/button";
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

export default function AdminChallengesPage() {
	const router = useRouter();
	const { isAuthenticated, user, isLoading } = useAuth();

	const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
	const [challengeToDelete, setChallengeToDelete] = useState<Id<"canonical_challenges"> | null>(null);

	const currentUser = useQuery(
		api.users.getUserById,
		user ? { userId: user.id as Id<"users"> } : "skip"
	);

	const canonicalChallenges = useQuery(api.admin.getCanonicalChallenges);
	const deleteChallengeMutation = useMutation(api.admin.deleteCanonicalChallenge);

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


	async function handleConfirmDelete() {
		if (!challengeToDelete) return;

		try {
			await deleteChallengeMutation({ id: challengeToDelete });
			toast.success("Challenge deleted");
			setDeleteConfirmOpen(false);
			setChallengeToDelete(null);
		} catch (err) {
			toast.error("Failed to delete challenge");
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
		<main className="mx-auto max-w-6xl px-4 py-10">
			<div className="mb-8">
				<h1 className="font-semibold text-3xl">Challenge Library</h1>
				<p className="mt-2 text-gray-600">
					Manage the global library of challenges for commissioners to use.
				</p>
			</div>

			{/* Add Challenge Buttons */}
			<div className="mb-8 flex gap-3">
				<Button
					onClick={() => router.push("/admin/challenges/new")}
					className="bg-green-600 hover:bg-green-700 text-white px-6 py-2"
				>
					+ Add Challenge
				</Button>
				<Button
					onClick={() => router.push("/admin/challenges/bulk-import")}
					variant="outline"
					className="px-6 py-2"
				>
					📋 Bulk Import
				</Button>
			</div>

			{/* Challenges Grid */}
			{canonicalChallenges && canonicalChallenges.length > 0 ? (
				<div className="mb-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
					{canonicalChallenges.map((challenge) => (
						<div
							key={challenge._id}
							className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm flex flex-col"
						>
							<div className="mb-2 flex items-start gap-2">
								<span className="text-2xl">{challenge.emoji}</span>
								<div className="flex-1">
									<p className="font-semibold text-gray-900">{challenge.title}</p>
									{challenge.category && (
										<p className="text-xs text-gray-500 mt-0.5">{challenge.category}</p>
									)}
								</div>
							</div>
							{challenge.generalVibe && (
								<div className="mb-3 px-2 py-1 rounded bg-blue-50 border border-blue-100">
									<p className="text-xs text-blue-700 italic">{challenge.generalVibe}</p>
								</div>
							)}
							<p className="mb-3 text-sm text-gray-700">{challenge.description}</p>

							{/* Options */}
							{challenge.options && challenge.options.length > 0 && (
								<div className="mb-3 border-t pt-2">
									<p className="text-xs font-medium text-gray-600 mb-1">Options:</p>
									<p className="text-xs text-gray-700">
										{challenge.options.map((opt) => {
											const optName = opt?.split(' — ')[0]?.trim() || opt;
											return optName;
										}).join(', ')}
									</p>
								</div>
							)}

							<div className="mb-3 border-t pt-2">
								<p className="text-xs font-medium text-gray-600 mb-1">Awards:</p>
								<div className="space-y-1">
									{challenge.awardCategories.map((award) => (
										<div key={award.id} className="flex items-center gap-2">
											<span className="text-xs text-gray-400 min-w-[2rem]">
												{award.points}pt
											</span>
											<p className="text-xs font-medium text-gray-700">{award.name}</p>
										</div>
									))}
								</div>
							</div>
							<div className="flex gap-2 justify-end mt-auto pt-4">
								<Button
									onClick={() => router.push(`/admin/challenges/${challenge._id}/edit`)}
									variant="outline"
									size="sm"
								>
									Edit
								</Button>
								<Button
									onClick={() => {
										setChallengeToDelete(challenge._id);
										setDeleteConfirmOpen(true);
									}}
									variant="outline"
									className="text-red-600 hover:bg-red-50 hover:text-red-700"
									size="sm"
								>
									Delete
								</Button>
							</div>
						</div>
					))}
				</div>
			) : (
				<p className="text-gray-500">No challenges yet. Add one to get started!</p>
			)}


			{/* Delete Confirmation Dialog */}
			<Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Delete Challenge</DialogTitle>
						<DialogDescription>
							Are you sure you want to delete this challenge? This action cannot be undone.
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button
							onClick={() => setDeleteConfirmOpen(false)}
							variant="outline"
						>
							Cancel
						</Button>
						<Button
							onClick={handleConfirmDelete}
							className="bg-red-600 hover:bg-red-700"
						>
							Delete
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

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

