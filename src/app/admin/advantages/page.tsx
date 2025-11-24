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

export default function AdminAdvantagesPage() {
	const router = useRouter();
	const { isAuthenticated, user, isLoading } = useAuth();

	const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
	const [advantageToDelete, setAdvantageToDelete] = useState<Id<"canonical_advantages"> | null>(null);

	const currentUser = useQuery(
		api.users.getUserById,
		user ? { userId: user.id as Id<"users"> } : "skip"
	);

	const canonicalAdvantages = useQuery(api.admin.getCanonicalAdvantages);
	const deleteAdvantageMutation = useMutation(api.admin.deleteCanonicalAdvantage);

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
		if (!advantageToDelete) return;

		try {
			await deleteAdvantageMutation({ id: advantageToDelete });
			toast.success("Advantage deleted");
			setDeleteConfirmOpen(false);
			setAdvantageToDelete(null);
		} catch (err) {
			toast.error("Failed to delete advantage");
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
				<h1 className="font-semibold text-3xl">Advantages Library</h1>
				<p className="mt-2 text-gray-600">
					Manage the global library of advantages available to commissioners.
				</p>
			</div>

			{/* Add Advantage Button */}
			<div className="mb-8 flex gap-2">
				<Button
					onClick={() => router.push("/admin/advantages/new")}
					className="bg-green-600 hover:bg-green-700 text-white px-6 py-2"
				>
					+ Add Advantage
				</Button>
				<Button
					onClick={() => router.push("/admin/advantages/bulk-import")}
					variant="outline"
					className="px-6 py-2"
				>
					Bulk Import
				</Button>
			</div>

			{/* Advantages Grid */}
			{canonicalAdvantages && canonicalAdvantages.length > 0 ? (
				<div className="mb-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
					{canonicalAdvantages.map((advantage) => (
						<div
							key={advantage._id}
							className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm flex flex-col"
						>
							<div className="mb-2">
								<p className="font-semibold text-gray-900">{advantage.name}</p>
								<p className="text-xs text-gray-500">{advantage.code}</p>
							</div>
							<p className="mb-3 text-sm text-gray-700 flex-grow">{advantage.description}</p>
							<div className="flex gap-2 justify-end mt-auto pt-4">
								<Button
									onClick={() => router.push(`/admin/advantages/${advantage._id}/edit`)}
									variant="outline"
									size="sm"
								>
									Edit
								</Button>
								<Button
									onClick={() => {
										setAdvantageToDelete(advantage._id);
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
				<p className="text-gray-500">No advantages yet. Add one to get started!</p>
			)}

			{/* Delete Confirmation Dialog */}
			<Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Delete Advantage</DialogTitle>
						<DialogDescription>
							Are you sure you want to delete this advantage? This action cannot be undone.
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

