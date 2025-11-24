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

interface BulkAdvantage {
	code: string;
	name: string;
	description: string;
	validPhases?: string[];
}

interface ValidationError {
	index: number;
	advantage: string;
	errors: string[];
}

export default function BulkImportPage() {
	const router = useRouter();
	const { isAuthenticated, user, isLoading } = useAuth();

	const [jsonInput, setJsonInput] = useState("");
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);
	const [previewData, setPreviewData] = useState<BulkAdvantage[]>([]);
	const [showPreview, setShowPreview] = useState(false);

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

	function validateAdvantages(data: unknown): { valid: BulkAdvantage[]; errors: ValidationError[] } {
		const errors: ValidationError[] = [];
		const valid: BulkAdvantage[] = [];
		const seenCodes = new Set<string>();

		if (!Array.isArray(data)) {
			errors.push({
				index: 0,
				advantage: "Root",
				errors: ["Input must be a JSON array"],
			});
			return { valid, errors };
		}

		data.forEach((item, index) => {
			const advantageErrors: string[] = [];

			// Required fields
			if (!item.code || typeof item.code !== "string") {
				advantageErrors.push("Missing or invalid code");
			} else {
				// Validate code format (uppercase, underscores, no spaces)
				if (item.code !== item.code.toUpperCase()) {
					advantageErrors.push("Code must be uppercase");
				}
				if (item.code.includes(" ")) {
					advantageErrors.push("Code must not contain spaces (use underscores)");
				}
				// Check for duplicates
				if (seenCodes.has(item.code)) {
					advantageErrors.push(`Duplicate code: ${item.code}`);
				} else {
					seenCodes.add(item.code);
				}
			}

			if (!item.name || typeof item.name !== "string") {
				advantageErrors.push("Missing or invalid name");
			}

			if (!item.description || typeof item.description !== "string") {
				advantageErrors.push("Missing or invalid description");
			}

			// Valid phases validation (optional, but must be array if present)
			if (item.validPhases !== undefined && !Array.isArray(item.validPhases)) {
				advantageErrors.push("validPhases must be an array");
			} else if (item.validPhases && Array.isArray(item.validPhases)) {
				item.validPhases.forEach((phase, idx) => {
					if (typeof phase !== "string") {
						advantageErrors.push(`validPhases[${idx}] must be a string`);
					}
				});
			}

			if (advantageErrors.length > 0) {
				errors.push({
					index,
					advantage: item.name || item.code || "Unknown",
					errors: advantageErrors,
				});
			} else {
				valid.push({
					code: item.code.trim(),
					name: item.name.trim(),
					description: item.description.trim(),
					validPhases: item.validPhases || [],
				});
			}
		});

		return { valid, errors };
	}

	function handleValidateAndPreview() {
		try {
			const data = JSON.parse(jsonInput);
			const { valid, errors } = validateAdvantages(data);

			setValidationErrors(errors);
			setPreviewData(valid);
			setShowPreview(true);

			if (errors.length > 0) {
				toast.error(`${errors.length} advantage(s) have validation errors`);
			} else {
				toast.success(`All ${valid.length} advantages valid!`);
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
			toast.error("No valid advantages to import");
			return;
		}

		setIsSubmitting(true);
		let successCount = 0;
		let failureCount = 0;

		for (const advantage of previewData) {
			try {
				await createAdvantageMutation({
					code: advantage.code,
					name: advantage.name,
					description: advantage.description,
					validPhases: advantage.validPhases && advantage.validPhases.length > 0 
						? advantage.validPhases 
						: undefined,
				});
				successCount++;
			} catch (err) {
				failureCount++;
				console.error("Failed to import advantage:", advantage.code, err);
			}
		}

		setIsSubmitting(false);

		if (successCount > 0) {
			toast.success(`Imported ${successCount} advantage(s)`);
		}
		if (failureCount > 0) {
			toast.error(`Failed to import ${failureCount} advantage(s)`);
		}

		if (successCount > 0) {
			setTimeout(() => router.push("/admin/advantages"), 1500);
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
				<h1 className="font-semibold text-3xl">Bulk Import Advantages</h1>
				<p className="mt-2 text-gray-600">
					Paste JSON data to import multiple advantages at once.
				</p>
			</div>

			{/* JSON Input */}
			<div className="rounded-lg border border-gray-200 bg-white p-8 mb-6">
				<label className="block text-sm font-medium mb-2">JSON Data</label>
				<Textarea
					value={jsonInput}
					onChange={(e) => setJsonInput(e.target.value)}
					placeholder='[{"code":"INDUCTED","name":"Inducted","description":"...","validPhases":[]}]'
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
						onClick={() => router.push("/admin/advantages")}
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
								<p className="font-medium">Advantage {error.index + 1}: {error.advantage}</p>
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
						{previewData.map((advantage, idx) => (
							<div
								key={idx}
								className="rounded border border-gray-200 bg-gray-50 p-3"
							>
								<div className="mb-2">
									<p className="font-medium text-gray-900">{advantage.name}</p>
									<p className="text-xs text-gray-600 font-mono">{advantage.code}</p>
								</div>
								<p className="text-xs text-gray-700 line-clamp-2 mb-2">
									{advantage.description}
								</p>
								<div className="flex gap-4 text-xs text-gray-600">
									{advantage.validPhases && advantage.validPhases.length > 0 && (
										<span>Valid Phases: {advantage.validPhases.length}</span>
									)}
									{(!advantage.validPhases || advantage.validPhases.length === 0) && (
										<span className="text-gray-400">No phase restrictions</span>
									)}
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
							{isSubmitting ? "Importing..." : `Import ${previewData.length} Advantages`}
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

