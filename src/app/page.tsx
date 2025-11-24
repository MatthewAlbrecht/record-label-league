"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useQuery } from "convex/react";
import { api } from "convex/_generated/api";
import type { Id } from "convex/_generated/dataModel";
import { Button } from "~/components/ui/button";
import { useAuth } from "~/lib/auth-context";

export default function HomePage() {
	const router = useRouter();
	const { isAuthenticated, user, logout, isLoading } = useAuth();
	const leagues = useQuery(
		api.leagues.listLeaguesForUser,
		user ? { userId: user.id as Id<"users"> } : "skip"
	);
	const currentUser = useQuery(
		api.users.getUserById,
		user ? { userId: user.id as Id<"users"> } : "skip"
	);

	useEffect(() => {
		if (!isLoading && !isAuthenticated) {
			router.replace("/login");
		}
	}, [isAuthenticated, isLoading, router]);

	if (isLoading || !isAuthenticated || !user) {
		return (
			<main className="mx-auto max-w-4xl px-4 py-10">
				<p>Loading...</p>
			</main>
		);
	}

	function handleLogout() {
		logout();
	}

	const isAdmin = currentUser?.isAdmin || false;

	return (
		<main className="mx-auto max-w-4xl px-4 py-10">
			<div className="mb-8 rounded-lg border border-gray-200 bg-white p-6">
				<h1 className="mb-4 font-semibold text-3xl">
					Welcome, {user.displayName}!
				</h1>
				<p className="mb-6 text-gray-600">
					You're successfully logged in to Record Label League.
				</p>
				<div className="flex gap-3">
					<Link href="/profile">
						<Button variant="outline">
							Edit Profile
						</Button>
					</Link>
					{isAdmin && (
						<Link href="/admin">
							<Button variant="outline" className="bg-purple-50 hover:bg-purple-100">
								Admin Panel
							</Button>
						</Link>
					)}
					<Button
						onClick={handleLogout}
						variant="outline"
						className="bg-red-50 hover:bg-red-100"
					>
						Sign Out
					</Button>
				</div>
			</div>

			{/* Your Leagues Section */}
			<div className="mb-8 rounded-lg border border-gray-200 bg-white p-6">
				<div className="mb-4 flex items-center justify-between">
					<h2 className="font-semibold text-xl">Your Leagues</h2>
					<Link href="/leagues/new">
						<Button variant="outline">Create League</Button>
					</Link>
				</div>

				{leagues && leagues.length > 0 ? (
					<div className="space-y-3">
						{leagues.map((league: any) => (
							<div
								key={league._id}
								className="flex items-center justify-between rounded border border-gray-200 p-4 hover:bg-gray-50"
							>
								<div>
									<p className="font-medium">{league.name}</p>
									<p className="text-sm text-gray-600">
										Commissioner:{" "}
										{league.commissioner.displayName}
									</p>
									<p className="text-sm text-gray-500">
										Your Role: {league.role}
									</p>
								</div>
								<Link href={`/leagues/${league._id}`}>
									<Button variant="outline" className="text-blue-500">
										View League
									</Button>
								</Link>
							</div>
						))}
					</div>
				) : (
					<p className="text-gray-600">
						You're not in any leagues yet.{" "}
						<Link href="/leagues/new" className="text-blue-500 hover:underline">
							Create one now!
						</Link>
					</p>
				)}
			</div>
		</main>
	);
}
