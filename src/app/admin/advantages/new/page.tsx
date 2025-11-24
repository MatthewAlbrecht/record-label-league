"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "convex/_generated/api";
import type { Id } from "convex/_generated/dataModel";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Textarea } from "~/components/ui/textarea";
import { useAuth } from "~/lib/auth-context";
import { toast } from "sonner";

export default function NewAdvantagePage() {
	const router = useRouter();
	const { isAuthenticated, user, isLoading } = useAuth();

	const [formData, setFormData] = useState({
		code: '',
		name: '',
		description: '',
		validPhases: '',
	});
	const [isSubmitting, setIsSubmitting] = useState(false);

	const currentUser = useQuery(
		api.users.getUserById,
		user ? { userId: user.id as Id<"users"> } : "skip"
	);

	const createAdvantageMutation = useMutation(api.admin.createCanonicalAdvantage);

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

	async function handleCreateAdvantage() {
		if (!formData.code.trim() || !formData.name.trim() || !formData.description.trim()) {
			toast.error("Code, name, and description are required");
			return;
		}

		setIsSubmitting(true);
		try {
			const validPhases = formData.validPhases
				.split(',')
				.map((p) => p.trim())
				.filter((p) => p.length > 0);

			await createAdvantageMutation({
				code: formData.code.trim(),
				name: formData.name.trim(),
				description: formData.description.trim(),
				validPhases: validPhases.length > 0 ? validPhases : undefined,
			});
			toast.success("Advantage created!");
			router.push("/admin/advantages");
		} catch (err) {
			const errorMsg = err instanceof Error ? err.message : "Failed to create advantage";
			toast.error(errorMsg);
		} finally {
			setIsSubmitting(false);
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
				<h1 className="font-semibold text-3xl">Create New Advantage</h1>
				<p className="mt-2 text-gray-600">
					Add a new advantage to the canonical library.
				</p>
			</div>

			{/* Form */}
			<div className="rounded-lg border border-gray-200 bg-white p-8 space-y-6">
				{/* Code */}
				<div>
					<label className="block text-sm font-medium mb-2">Code *</label>
					<Input
						value={formData.code}
						onChange={(e) => setFormData({ ...formData, code: e.target.value })}
						placeholder="e.g., DIRECTORS_CHAIR"
						className="w-full"
					/>
				</div>

				{/* Name */}
				<div>
					<label className="block text-sm font-medium mb-2">Name *</label>
					<Input
						value={formData.name}
						onChange={(e) => setFormData({ ...formData, name: e.target.value })}
						placeholder="e.g., Director's Chair"
						className="w-full"
					/>
				</div>

				{/* Description */}
				<div>
					<label className="block text-sm font-medium mb-2">Description *</label>
					<Textarea
						value={formData.description}
						onChange={(e) => setFormData({ ...formData, description: e.target.value })}
						placeholder="Detailed description of the advantage"
						className="w-full"
						rows={4}
					/>
				</div>

				{/* Valid Phases */}
				<div>
					<label className="block text-sm font-medium mb-2">Valid Phases (comma-separated)</label>
					<Input
						value={formData.validPhases}
						onChange={(e) => setFormData({ ...formData, validPhases: e.target.value })}
						placeholder="e.g., SETUP, DRAFTING, IN_PROGRESS"
						className="w-full"
					/>
				</div>

				{/* Action Buttons */}
				<div className="flex gap-3 pt-6 border-t">
					<Button
						onClick={() => router.push("/admin/advantages")}
						variant="outline"
					>
						Cancel
					</Button>
					<Button
						onClick={handleCreateAdvantage}
						disabled={isSubmitting}
						className="bg-green-600 hover:bg-green-700 ml-auto"
					>
						{isSubmitting ? "Creating..." : "Create Advantage"}
					</Button>
				</div>
			</div>
		</main>
	);
}

