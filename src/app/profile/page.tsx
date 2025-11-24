"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { useAuth } from "~/lib/auth-context";

export default function ProfilePage() {
	const router = useRouter();
	const { isAuthenticated, user, updateDisplayName, isLoading } = useAuth();
	const [displayName, setDisplayName] = useState("");
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [message, setMessage] = useState<{
		type: "success" | "error";
		text: string;
	} | null>(null);

	// Initialize form with current display name
	useEffect(() => {
		if (user) {
			setDisplayName(user.displayName);
		}
	}, [user]);

	// Check authentication
	useEffect(() => {
		if (!isLoading && !isAuthenticated) {
			router.replace("/login");
		}
	}, [isAuthenticated, isLoading, router]);

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		setIsSubmitting(true);
		setMessage(null);

		// Validate input
		if (!displayName.trim()) {
			setMessage({ type: "error", text: "Display name cannot be empty" });
			setIsSubmitting(false);
			return;
		}

		try {
			const success = await updateDisplayName(user!.id, displayName.trim());

			if (success) {
				setMessage({
					type: "success",
					text: "Display name updated successfully!",
				});
			} else {
				setMessage({ type: "error", text: "Failed to update display name" });
			}
		} catch (error) {
			const errorText =
				error instanceof Error ? error.message : "An error occurred";
			setMessage({ type: "error", text: errorText });
		} finally {
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
			<h1 className="mb-6 font-semibold text-2xl">Profile</h1>

			<div className="rounded-lg border border-gray-200 bg-white p-6">
				<div className="mb-6">
					<p className="text-gray-600">
						<strong>Email:</strong> {user.email}
					</p>
				</div>

				<form onSubmit={handleSubmit} className="space-y-4">
					<div className="flex flex-col gap-1">
						<Label htmlFor="displayName">Display Name</Label>
						<Input
							id="displayName"
							type="text"
							value={displayName}
							onChange={(e) => setDisplayName(e.target.value)}
							placeholder="Your display name"
						/>
					</div>

					{message && (
						<p
							className={`text-sm ${
								message.type === "success"
									? "text-green-600"
									: "text-red-600"
							}`}
						>
							{message.text}
						</p>
					)}

					<Button type="submit" disabled={isSubmitting} variant="outline">
						{isSubmitting ? "Saving..." : "Save Changes"}
					</Button>
				</form>

				<div className="mt-6 border-t border-gray-200 pt-6">
					<Button
						onClick={() => router.push("/dashboard")}
						variant="outline"
						className="text-blue-500 hover:text-blue-600"
					>
						Back to Dashboard
					</Button>
				</div>
			</div>
		</main>
	);
}

