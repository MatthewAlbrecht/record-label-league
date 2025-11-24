"use client";

import { useRouter, useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "convex/_generated/api";
import type { Id } from "convex/_generated/dataModel";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Textarea } from "~/components/ui/textarea";
import { useAuth } from "~/lib/auth-context";
import { toast } from "sonner";
import { AwardCategoryList, type AwardCategory } from "~/components/award-category-list";
import { ChevronDown, ChevronUp } from "lucide-react";

const DEFAULT_AWARDS: AwardCategory[] = [
	{ id: '1', name: '', description: '', points: 1 },
	{ id: '2', name: '', description: '', points: 1 },
	{ id: '3', name: '', description: '', points: 1 },
	{ id: '4', name: '', description: '', points: 1 },
	{ id: '5', name: '', description: '', points: 2 },
	{ id: '6', name: '', description: '', points: 2 },
	{ id: '7', name: '', description: '', points: 3 },
];

export default function EditChallengePage() {
	const router = useRouter();
	const params = useParams();
	const challengeId = params.id as string;
	const { isAuthenticated, user, isLoading } = useAuth();

	const [formData, setFormData] = useState({
		title: '',
		description: '',
		emoji: '',
		generalVibe: '',
		categoryId: '' as Id<"canonical_challenge_categories"> | '',
		minTracks: 3,
		maxTracks: 8,
		rules: '',
		options: [] as Array<{ name: string; description: string }>,
		awards: DEFAULT_AWARDS,
	});
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [showJsonPaste, setShowJsonPaste] = useState(false);
	const [jsonInput, setJsonInput] = useState('');

	const currentUser = useQuery(
		api.users.getUserById,
		user ? { userId: user.id as Id<"users"> } : "skip"
	);

	const challenge = useQuery(
		api.admin.getCanonicalChallenge,
		challengeId ? { id: challengeId as Id<"canonical_challenges"> } : "skip"
	);

	const categories = useQuery(api.admin.getChallengeCategories);
	const updateChallengeMutation = useMutation(api.admin.updateCanonicalChallenge);

	// Load challenge data into form
	useEffect(() => {
		if (challenge) {
			const parsedOptions = (challenge.options || []).map((opt) => {
				const [name, description] = opt.split(' — ').map((s) => s.trim());
				return { name, description };
			});
			setFormData({
				title: challenge.title,
				description: challenge.description,
				emoji: challenge.emoji,
				generalVibe: challenge.generalVibe || '',
				categoryId: challenge.categoryId,
				minTracks: challenge.constraints.minTracks,
				maxTracks: challenge.constraints.maxTracks,
				rules: challenge.constraints.rules.join('\n'),
				options: parsedOptions,
				awards: challenge.awardCategories.map((award, idx) => ({
					id: award.id || String(idx + 1),
					name: award.name,
					description: award.description,
					points: award.points,
				})),
			});
		}
	}, [challenge]);

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

	async function handleUpdateChallenge() {
		if (!formData.title.trim() || !formData.description.trim()) {
			toast.error("Title and description required");
			return;
		}

		if (!formData.categoryId) {
			toast.error("Category is required");
			return;
		}

		// Validate options: if any options provided, must have at least 4
		if (formData.options.length > 0 && formData.options.length < 4) {
			toast.error("If you add options, you must add at least 4");
			return;
		}

		// Validate all options have names (descriptions are optional)
		if (formData.options.length > 0 && formData.options.some((o) => !o.name.trim())) {
			toast.error("All options must have a name");
			return;
		}

		// Validate all awards have names and descriptions
		if (formData.awards.some((a) => !a.name.trim() || !a.description.trim())) {
			toast.error("All 7 award categories must have names and descriptions");
			return;
		}

		setIsSubmitting(true);
		try {
			await updateChallengeMutation({
				id: challengeId as Id<"canonical_challenges">,
				title: formData.title.trim(),
				description: formData.description.trim(),
				emoji: formData.emoji.trim() || '🎯',
				generalVibe: formData.generalVibe.trim(),
				categoryId: formData.categoryId as Id<"canonical_challenge_categories">,
				constraints: {
					minTracks: formData.minTracks,
					maxTracks: formData.maxTracks,
					rules: formData.rules
						.split('\n')
						.map((r) => r.trim())
						.filter((r) => r.length > 0),
				},
				awardCategories: formData.awards,
				options: formData.options.length > 0
					? formData.options.map((opt) => `${opt.name} — ${opt.description}`)
					: undefined,
			});
			toast.success("Challenge updated!");
			router.push("/admin/challenges");
		} catch (err) {
			const errorMsg = err instanceof Error ? err.message : "Failed to update challenge";
			toast.error(errorMsg);
		} finally {
			setIsSubmitting(false);
		}
	}

	function updateAward(index: number, field: keyof AwardCategory, value: any) {
		const newAwards = [...formData.awards];
		newAwards[index] = { ...newAwards[index], [field]: value };
		setFormData({ ...formData, awards: newAwards });
	}

	function handleAwardsReorder(newAwards: AwardCategory[]) {
		setFormData({ ...formData, awards: newAwards });
	}

	function addOption() {
		setFormData({
			...formData,
			options: [...formData.options, { name: '', description: '' }],
		});
	}

	function removeOption(index: number) {
		setFormData({
			...formData,
			options: formData.options.filter((_, i) => i !== index),
		});
	}

	function updateOption(index: number, field: 'name' | 'description', value: string) {
		const newOptions = [...formData.options];
		newOptions[index] = { ...newOptions[index], [field]: value };
		setFormData({ ...formData, options: newOptions });
	}

	function handleJsonPaste() {
		try {
			const parsed = JSON.parse(jsonInput);
			if (!Array.isArray(parsed)) {
				toast.error("JSON must be an array of awards");
				return;
			}

			const awards: AwardCategory[] = parsed.map((item, idx) => {
				if (typeof item.name !== 'string' || typeof item.description !== 'string') {
					throw new Error(`Award at index ${idx} missing name or description`);
				}
				// Assign points based on position: first 4 = 1pt, next 2 = 2pt, rest = 3pt
				let points: 1 | 2 | 3 = 1;
				if (idx >= 4 && idx < 6) points = 2;
				else if (idx >= 6) points = 3;

				return {
					id: item.id || String(idx + 1),
					name: item.name,
					description: item.description,
					points: item.points ?? points,
				};
			});

			setFormData({ ...formData, awards });
			setJsonInput('');
			setShowJsonPaste(false);
			toast.success(`Replaced with ${awards.length} awards`);
		} catch (err) {
			const msg = err instanceof Error ? err.message : "Invalid JSON";
			toast.error(msg);
		}
	}

	if (isLoading || !isAuthenticated || !user || currentUser === undefined) {
		return (
			<main className="mx-auto max-w-6xl px-4 py-10">
				<p>Loading...</p>
			</main>
		);
	}

	if (!challenge) {
		return (
			<main className="mx-auto max-w-6xl px-4 py-10">
				<p>Challenge not found</p>
				<Button onClick={() => router.push("/admin/challenges")} variant="outline" className="mt-4">
					Back to Challenges
				</Button>
			</main>
		);
	}

	return (
		<main className="mx-auto max-w-4xl px-4 py-10">
			<div className="mb-8">
				<h1 className="font-semibold text-3xl">Edit Challenge</h1>
				<p className="mt-2 text-gray-600">
					Update challenge details in the canonical library.
				</p>
			</div>

			{/* Form */}
			<div className="rounded-lg border border-gray-200 bg-white p-8 space-y-6">
				{/* Basic Info */}
				<div className="grid grid-cols-2 gap-4">
					<div>
						<label className="block text-sm font-medium mb-2">Emoji</label>
						<div className="w-24 h-24 border-2 border-gray-300 rounded-lg flex items-center justify-center bg-gray-50">
							<input
								type="text"
								value={formData.emoji}
								onChange={(e) =>
									setFormData({ ...formData, emoji: e.target.value.slice(0, 2) })
								}
								maxLength="2"
								className="w-full h-full text-center text-5xl bg-transparent border-none focus:outline-none"
							/>
						</div>
					</div>
					<div>
						<label className="block text-sm font-medium mb-2">Category *</label>
						<select
							value={formData.categoryId}
							onChange={(e) =>
								setFormData({ ...formData, categoryId: e.target.value as Id<"canonical_challenge_categories"> })
							}
							className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
						>
							<option value="">Select category...</option>
							{categories?.map((cat) => (
								<option key={cat._id} value={cat._id}>
									{cat.name}
								</option>
							))}
						</select>
					</div>
				</div>

				{/* Title & Description */}
				<div>
					<label className="block text-sm font-medium mb-2">Title *</label>
					<Input
						value={formData.title}
						onChange={(e) => setFormData({ ...formData, title: e.target.value })}
						placeholder="Challenge title"
						className="w-full"
					/>
				</div>

				<div>
					<label className="block text-sm font-medium mb-2">Description *</label>
					<Textarea
						value={formData.description}
						onChange={(e) =>
							setFormData({ ...formData, description: e.target.value })
						}
						placeholder="Challenge description"
						className="w-full"
						rows={4}
					/>
				</div>

				<div>
					<label className="block text-sm font-medium mb-2">General Vibe *</label>
					<Input
						value={formData.generalVibe}
						onChange={(e) => setFormData({ ...formData, generalVibe: e.target.value })}
						placeholder="e.g., color synesthesia in music, emotional transformation, mathematical concepts"
						className="w-full"
					/>
				</div>

				{/* Constraints */}
				<div>
					<h3 className="font-medium text-base mb-3">Constraints</h3>
					<div className="grid grid-cols-2 gap-4">
						<div>
							<label className="block text-sm font-medium mb-2">Min Tracks</label>
							<Input
								type="number"
								value={formData.minTracks}
								onChange={(e) =>
									setFormData({
										...formData,
										minTracks: parseInt(e.target.value) || 0,
									})
								}
								className="w-full"
							/>
						</div>
						<div>
							<label className="block text-sm font-medium mb-2">Max Tracks</label>
							<Input
								type="number"
								value={formData.maxTracks}
								onChange={(e) =>
									setFormData({
										...formData,
										maxTracks: parseInt(e.target.value) || 0,
									})
								}
								className="w-full"
							/>
						</div>
					</div>
				</div>

				<div>
					<label className="block text-sm font-medium mb-2">Rules (one per line)</label>
					<Textarea
						value={formData.rules}
						onChange={(e) => setFormData({ ...formData, rules: e.target.value })}
						placeholder="Rule 1&#10;Rule 2&#10;Rule 3"
						className="w-full"
						rows={4}
					/>
				</div>

				{/* Options Editor */}
				<div>
					<div className="flex items-center justify-between mb-3">
						<h3 className="font-medium text-base">Options (Optional)</h3>
						<Button
							onClick={addOption}
							variant="outline"
							size="sm"
						>
							+ Add Option
						</Button>
					</div>
					{formData.options.length > 0 ? (
						<div className="space-y-3">
							{formData.options.map((option, idx) => (
								<div key={idx} className="border rounded-lg p-4 bg-gray-50 relative">
									<button
										onClick={() => removeOption(idx)}
										className="absolute top-2 right-2 text-gray-400 hover:text-red-500"
										title="Remove option"
									>
										✕
									</button>
									<div className="mb-3">
										<label className="block text-xs font-medium text-gray-600 mb-1">Name</label>
										<Input
											value={option.name}
											onChange={(e) => updateOption(idx, 'name', e.target.value)}
											placeholder="Option name (e.g., Symmetry)"
											className="w-full text-sm bg-white"
										/>
									</div>
									<div>
										<label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
										<Textarea
											value={option.description}
											onChange={(e) => updateOption(idx, 'description', e.target.value)}
											placeholder="Option description"
											className="w-full text-sm bg-white"
											rows={2}
										/>
									</div>
								</div>
							))}
						</div>
					) : (
						<p className="text-sm text-gray-500">No options yet. Add one if players need to choose from predefined themes.</p>
					)}
				</div>

				{/* Awards Editor */}
				<div>
					<div className="flex items-center justify-between mb-3">
						<h3 className="font-medium text-base">Award Categories *</h3>
						<Button
							onClick={() => setShowJsonPaste(!showJsonPaste)}
							variant="outline"
							size="sm"
							className="gap-1"
						>
							{showJsonPaste ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
							Paste JSON
						</Button>
					</div>

					{showJsonPaste && (
						<div className="mb-4 p-4 bg-gray-50 border rounded-lg">
							<p className="text-xs text-gray-600 mb-2">
								Paste an array of awards. Each should have <code className="bg-gray-200 px-1 rounded">name</code> and <code className="bg-gray-200 px-1 rounded">description</code>. Points will be auto-assigned by position.
							</p>
							<Textarea
								value={jsonInput}
								onChange={(e) => setJsonInput(e.target.value)}
								placeholder='[{"name": "Best Track", "description": "..."}, ...]'
								rows={6}
								className="font-mono text-xs mb-2"
							/>
							<div className="flex gap-2">
								<Button onClick={handleJsonPaste} size="sm">
									Apply JSON
								</Button>
								<Button onClick={() => { setShowJsonPaste(false); setJsonInput(''); }} variant="ghost" size="sm">
									Cancel
								</Button>
							</div>
						</div>
					)}

					<AwardCategoryList
						awards={formData.awards}
						onAwardsChange={handleAwardsReorder}
						onAwardUpdate={updateAward}
						defaultMode="reorder"
					/>
				</div>

				{/* Action Buttons */}
				<div className="flex gap-3 pt-6 border-t">
					<Button
						onClick={() => router.push("/admin/challenges")}
						variant="outline"
					>
						Cancel
					</Button>
					<Button
						onClick={handleUpdateChallenge}
						disabled={isSubmitting}
						className="bg-green-600 hover:bg-green-700 ml-auto"
					>
						{isSubmitting ? "Updating..." : "Update Challenge"}
					</Button>
				</div>
			</div>
		</main>
	);
}

