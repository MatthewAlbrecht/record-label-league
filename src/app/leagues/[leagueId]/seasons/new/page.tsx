"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "convex/_generated/api";
import { Id } from "convex/_generated/dataModel";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { useAuth } from "~/lib/auth-context";

export default function NewSeasonPage() {
	const router = useRouter();
	const params = useParams();
	const leagueId = params.leagueId as string;
	const { isAuthenticated, user, isLoading } = useAuth();

	const [seasonName, setSeasonName] = useState("");
	const [rosterSize, setRosterSize] = useState(8);
	const [challengeCount, setChallengeCount] = useState(8);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const createSeasonMutation = useMutation(api.seasons.createSeason);

	useEffect(() => {
		if (!isLoading && !isAuthenticated) {
			router.replace("/login");
		}
	}, [isAuthenticated, isLoading, router]);

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		setError(null);
		setIsSubmitting(true);

		// Validate input
		if (!seasonName.trim()) {
			setError("Season name is required");
			setIsSubmitting(false);
			return;
		}

		if (rosterSize < 1 || rosterSize > 20) {
			setError("Roster size must be between 1 and 20");
			setIsSubmitting(false);
			return;
		}

		if (challengeCount < 1 || challengeCount > 20) {
			setError("Challenge count must be between 1 and 20");
			setIsSubmitting(false);
			return;
		}

		try {
			const seasonId = await createSeasonMutation({
				leagueId: leagueId as Id<"leagues">,
				name: seasonName.trim(),
				rosterSize,
				challengeCount,
				requesterId: user!.id,
			});

			// Redirect to the season admin page
			router.push(`/seasons/${seasonId}/admin`);
		} catch (err) {
			const errorMessage =
				err instanceof Error ? err.message : "Failed to create season";
			setError(errorMessage);
			setIsSubmitting(false);
		}
	}

	if (isLoading || !isAuthenticated || !user) {
		return (
			<main className="mx-auto max-w-sm px-4 py-10">
				<p>Loading...</p>
			</main>
		);
	}

	return (
		<main className="mx-auto max-w-sm px-4 py-10">
			<h1 className="mb-6 font-semibold text-2xl">Create New Season</h1>

			<div className="rounded-lg border border-gray-200 bg-white p-6">
				<form onSubmit={handleSubmit} className="space-y-4">
					<div className="flex flex-col gap-1">
						<Label htmlFor="seasonName">Season Name</Label>
						<Input
							id="seasonName"
							type="text"
							value={seasonName}
							onChange={(e) => setSeasonName(e.target.value)}
							placeholder="e.g., Summer Season 2025"
						/>
					</div>

					<div className="flex flex-col gap-1">
						<Label htmlFor="rosterSize">Roster Size</Label>
						<Input
							id="rosterSize"
							type="number"
							min="1"
							max="20"
							value={rosterSize}
							onChange={(e) => setRosterSize(Number(e.target.value))}
						/>
						<p className="text-xs text-gray-500">
							Number of artists per player (default: 8)
						</p>
					</div>

					<div className="flex flex-col gap-1">
						<Label htmlFor="challengeCount">Number of Challenges</Label>
						<Input
							id="challengeCount"
							type="number"
							min="1"
							max="20"
							value={challengeCount}
							onChange={(e) => setChallengeCount(Number(e.target.value))}
						/>
						<p className="text-xs text-gray-500">
							Number of challenges in the season (default: 8)
						</p>
					</div>

					{error && <p className="text-red-500 text-sm">{error}</p>}

					<Button type="submit" disabled={isSubmitting} variant="outline">
						{isSubmitting ? "Creating..." : "Create Season"}
					</Button>
				</form>

				<div className="mt-4 border-t border-gray-200 pt-4">
					<Button
						onClick={() => router.push(`/leagues/${leagueId}`)}
						variant="outline"
						className="text-gray-500"
					>
						Back to League
					</Button>
				</div>
			</div>
		</main>
	);
}

