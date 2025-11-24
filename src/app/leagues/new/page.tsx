"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "convex/_generated/api";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { useAuth } from "~/lib/auth-context";

export default function NewLeaguePage() {
	const router = useRouter();
	const { isAuthenticated, user, isLoading } = useAuth();
	const [leagueName, setLeagueName] = useState("");
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const createLeagueMutation = useMutation(api.leagues.createLeagueWithUserId);

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
		if (!leagueName.trim()) {
			setError("League name is required");
			setIsSubmitting(false);
			return;
		}

		try {
			const leagueId = await createLeagueMutation({
				name: leagueName.trim(),
				userId: user!.id,
			});

			// Redirect to the new league's dashboard
			router.push(`/leagues/${leagueId}`);
		} catch (err) {
			const errorMessage =
				err instanceof Error ? err.message : "Failed to create league";
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
			<h1 className="mb-6 font-semibold text-2xl">Create New League</h1>

			<div className="rounded-lg border border-gray-200 bg-white p-6">
				<form onSubmit={handleSubmit} className="space-y-4">
					<div className="flex flex-col gap-1">
						<Label htmlFor="leagueName">League Name</Label>
						<Input
							id="leagueName"
							type="text"
							value={leagueName}
							onChange={(e) => setLeagueName(e.target.value)}
							placeholder="e.g., Summer Vibes 2025"
						/>
					</div>

					{error && <p className="text-red-500 text-sm">{error}</p>}

					<Button type="submit" disabled={isSubmitting} variant="outline">
						{isSubmitting ? "Creating..." : "Create League"}
					</Button>
				</form>

				<div className="mt-4 border-t border-gray-200 pt-4">
					<Button
						onClick={() => router.push("/dashboard")}
						variant="outline"
						className="text-gray-500"
					>
						Back to Dashboard
					</Button>
				</div>
			</div>
		</main>
	);
}

