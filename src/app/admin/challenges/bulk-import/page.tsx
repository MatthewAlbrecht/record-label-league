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

interface BulkChallenge {
	category: string;
	title: string;
	emoji: string;
	description: string;
	generalVibe: string;
	minTracks?: number;
	maxTracks?: number;
	rules?: string[];
	options?: Array<{ name: string; description?: string }>;
	awards: Array<{ name: string; description: string }>;
}

interface ValidationError {
	index: number;
	challenge: string;
	errors: string[];
}

export default function BulkImportPage() {
	const router = useRouter();
	const { isAuthenticated, user, isLoading } = useAuth();

	const [jsonInput, setJsonInput] = useState("");
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);
	const [previewData, setPreviewData] = useState<BulkChallenge[]>([]);
	const [showPreview, setShowPreview] = useState(false);

	const currentUser = useQuery(
		api.users.getUserById,
		user ? { userId: user.id as Id<"users"> } : "skip"
	);

	const categories = useQuery(api.admin.getChallengeCategories);
	const createChallengeMutation = useMutation(api.admin.createCanonicalChallenge);

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

	function validateChallenges(data: unknown): { valid: BulkChallenge[]; errors: ValidationError[] } {
		const errors: ValidationError[] = [];
		const valid: BulkChallenge[] = [];

		if (!Array.isArray(data)) {
			errors.push({
				index: 0,
				challenge: "Root",
				errors: ["Input must be a JSON array"],
			});
			return { valid, errors };
		}

		data.forEach((item, index) => {
			const challengeErrors: string[] = [];

			// Required fields
			if (!item.title || typeof item.title !== "string") {
				challengeErrors.push("Missing or invalid title");
			}
			if (!item.emoji || typeof item.emoji !== "string") {
				challengeErrors.push("Missing or invalid emoji");
			}
			if (!item.description || typeof item.description !== "string") {
				challengeErrors.push("Missing or invalid description");
			}
			if (!item.generalVibe || typeof item.generalVibe !== "string") {
				challengeErrors.push("Missing or invalid generalVibe");
			}
			if (!item.category || typeof item.category !== "string") {
				challengeErrors.push("Missing or invalid category");
			}

			// Category validation
			if (item.category && !categories?.some((c) => c.name === item.category)) {
				challengeErrors.push(
					`Category "${item.category}" not found. Available: ${categories?.map((c) => c.name).join(", ")}`
				);
			}

			// Awards validation
			if (!Array.isArray(item.awards) || item.awards.length !== 7) {
				challengeErrors.push("Must have exactly 7 awards");
			} else {
				const awardErrors = validateAwards(item.awards);
				challengeErrors.push(...awardErrors);
			}

			// Options validation
			if (item.options && Array.isArray(item.options)) {
				if (item.options.length > 0 && item.options.length < 4) {
					challengeErrors.push("If options provided, must have at least 4");
				}
				item.options.forEach((opt, idx) => {
					if (!opt.name || typeof opt.name !== "string") {
						challengeErrors.push(`Option ${idx + 1}: Missing name`);
					}
				});
			}

			// Constraints validation
			const minTracks = item.minTracks ?? 3;
			const maxTracks = item.maxTracks ?? 8;
			if (minTracks < 1) challengeErrors.push("minTracks must be >= 1");
			if (maxTracks < minTracks)
				challengeErrors.push("maxTracks must be >= minTracks");

			if (challengeErrors.length > 0) {
				errors.push({
					index,
					challenge: item.title || "Unknown",
					errors: challengeErrors,
				});
			} else {
				valid.push({
					category: item.category,
					title: item.title,
					emoji: item.emoji,
					description: item.description,
					generalVibe: item.generalVibe,
					minTracks: minTracks,
					maxTracks: maxTracks,
					rules: item.rules || [],
					options: item.options || [],
					awards: item.awards,
				});
			}
		});

		return { valid, errors };
	}

	function validateAwards(awards: any[]): string[] {
		const errors: string[] = [];

		awards.forEach((award, idx) => {
			if (!award.name || typeof award.name !== "string")
				errors.push(`Award ${idx + 1}: Missing name`);
			if (!award.description || typeof award.description !== "string")
				errors.push(`Award ${idx + 1}: Missing description`);
		});

		return errors;
	}

	function addPointsToAwards(
		awards: Array<{ name: string; description: string }>
	): Array<{ id: string; name: string; description: string; points: 1 | 2 | 3 }> {
		return awards.map((award, idx) => ({
			id: crypto.randomUUID(),
			name: award.name,
			description: award.description,
			points: idx < 4 ? 1 : idx < 6 ? 2 : (3 as 1 | 2 | 3),
		}));
	}

	function handleValidateAndPreview() {
		try {
			const data = JSON.parse(jsonInput);
			const { valid, errors } = validateChallenges(data);

			setValidationErrors(errors);
			setPreviewData(valid);
			setShowPreview(true);

			if (errors.length > 0) {
				toast.error(`${errors.length} challenge(s) have validation errors`);
			} else {
				toast.success(`All ${valid.length} challenges valid!`);
			}
		} catch (err) {
			const message = err instanceof Error ? err.message : "Invalid JSON";
			toast.error(`JSON Parse Error: ${message}`);
			setValidationErrors([]);
			setPreviewData([]);
		}
	}

	async function handleImport() {
		if (previewData.length === 0) {
			toast.error("No valid challenges to import");
			return;
		}

		setIsSubmitting(true);
		let successCount = 0;
		let failureCount = 0;

		for (const challenge of previewData) {
			try {
				const categoryId = categories?.find((c) => c.name === challenge.category)?._id;
				if (!categoryId) {
					failureCount++;
					continue;
				}

			await createChallengeMutation({
				title: challenge.title,
				description: challenge.description,
				emoji: challenge.emoji,
				generalVibe: challenge.generalVibe,
				categoryId: categoryId,
				constraints: {
					minTracks: challenge.minTracks || 3,
					maxTracks: challenge.maxTracks || 8,
					rules: challenge.rules || [],
				},
				awardCategories: addPointsToAwards(challenge.awards),
				options:
					challenge.options && challenge.options.length > 0
						? challenge.options.map((opt) => `${opt.name} — ${opt.description || ""}`)
						: undefined,
			});
				successCount++;
			} catch (err) {
				failureCount++;
			}
		}

		setIsSubmitting(false);

		if (successCount > 0) {
			toast.success(`Imported ${successCount} challenge(s)`);
		}
		if (failureCount > 0) {
			toast.error(`Failed to import ${failureCount} challenge(s)`);
		}

		if (successCount > 0) {
			setTimeout(() => router.push("/admin/challenges"), 1500);
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
				<h1 className="font-semibold text-3xl">Bulk Import Challenges</h1>
				<p className="mt-2 text-gray-600">
					Paste JSON data to import multiple challenges at once.
				</p>
			</div>

			{/* JSON Input */}
			<div className="rounded-lg border border-gray-200 bg-white p-8 mb-6">
				<label className="block text-sm font-medium mb-2">JSON Data</label>
				<Textarea
					value={jsonInput}
					onChange={(e) => setJsonInput(e.target.value)}
					placeholder='[{"category":"Category","title":"Title","emoji":"🎯","description":"...","awards":[...]}]'
					className="w-full text-sm font-mono"
					rows={12}
				/>
				<div className="mt-4 flex gap-2">
					<Button
						onClick={handleValidateAndPreview}
						variant="outline"
					>
						Validate & Preview
					</Button>
					<Button
						onClick={() => router.push("/admin/challenges")}
						variant="outline"
					>
						Cancel
					</Button>
				</div>
			</div>

			{/* Validation Errors */}
			{validationErrors.length > 0 && (
				<div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4">
					<h3 className="font-semibold text-red-900 mb-2">Validation Errors</h3>
					<div className="space-y-2">
						{validationErrors.map((error, idx) => (
							<div key={idx} className="text-sm text-red-800">
								<p className="font-medium">Challenge {error.index + 1}: {error.challenge}</p>
								<ul className="ml-4 list-disc">
									{error.errors.map((err, errIdx) => (
										<li key={errIdx}>{err}</li>
									))}
								</ul>
							</div>
						))}
					</div>
				</div>
			)}

			{/* Preview */}
			{showPreview && previewData.length > 0 && (
				<div className="mb-6">
					<h2 className="font-semibold text-lg mb-4">Preview ({previewData.length} valid)</h2>
					<div className="space-y-3 max-h-96 overflow-y-auto">
						{previewData.map((challenge, idx) => (
							<div
								key={idx}
								className="rounded border border-gray-200 bg-gray-50 p-3"
							>
								<div className="flex items-center gap-2 mb-2">
									<span className="text-lg">{challenge.emoji}</span>
									<div>
										<p className="font-medium text-gray-900">{challenge.title}</p>
										<p className="text-xs text-gray-600">{challenge.category}</p>
									</div>
								</div>
								<p className="text-xs text-gray-700 line-clamp-2 mb-2">
									{challenge.description}
								</p>
								<div className="flex gap-4 text-xs text-gray-600">
									{challenge.options && challenge.options.length > 0 && (
										<span>Options: {challenge.options.length}</span>
									)}
									<span>Awards: {challenge.awards.length}</span>
									<span>
										Tracks: {challenge.minTracks}-{challenge.maxTracks}
									</span>
								</div>
							</div>
						))}
					</div>

					<div className="mt-6 flex gap-2">
						<Button
							onClick={handleImport}
							disabled={isSubmitting}
							className="bg-green-600 hover:bg-green-700"
						>
							{isSubmitting ? "Importing..." : `Import ${previewData.length} Challenges`}
						</Button>
						<Button
							onClick={() => setShowPreview(false)}
							variant="outline"
						>
							Back to Edit
						</Button>
					</div>
				</div>
			)}
		</main>
	);
}

