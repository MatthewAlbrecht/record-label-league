"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useQuery } from "convex/react";
import { api } from "convex/_generated/api";
import type { Id } from "convex/_generated/dataModel";
import { Button } from "~/components/ui/button";
import { useAuth } from "~/lib/auth-context";

export default function AdminPage() {
	const router = useRouter();
	const { isAuthenticated, user, isLoading } = useAuth();

	const currentUser = useQuery(
		api.users.getUserById,
		user ? { userId: user.id as Id<"users"> } : "skip"
	);

	useEffect(() => {
		if (!isLoading && !isAuthenticated) {
			router.replace("/login");
		}
	}, [isAuthenticated, isLoading, router]);

	useEffect(() => {
		if (currentUser !== undefined && !currentUser?.isAdmin) {
			router.replace("/dashboard");
		}
	}, [currentUser, router]);

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
				<h1 className="font-semibold text-3xl">Admin Panel</h1>
				<p className="mt-2 text-gray-600">
					Manage system-wide settings and configurations.
				</p>
			</div>

			{/* Admin Sections Grid */}
			<div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
				{/* Prompt Bank Management */}
				<Link href="/admin/prompts">
					<div className="cursor-pointer rounded-lg border-2 border-blue-300 bg-gradient-to-br from-blue-50 to-blue-100 p-6 transition hover:shadow-lg">
						<h2 className="font-semibold text-lg text-blue-900">
							Prompt Bank
						</h2>
						<p className="mt-3 text-sm text-blue-700">
							Manage the canonical library of draft prompts that commissioners can use.
						</p>
						<div className="mt-4 flex items-center text-sm font-medium text-blue-600">
							Manage <span className="ml-2">→</span>
						</div>
					</div>
				</Link>

				{/* Challenge Library Management */}
				<Link href="/admin/challenges">
					<div className="cursor-pointer rounded-lg border-2 border-purple-300 bg-gradient-to-br from-purple-50 to-purple-100 p-6 transition hover:shadow-lg">
						<h2 className="font-semibold text-lg text-purple-900">
							Challenge Library
						</h2>
						<p className="mt-3 text-sm text-purple-700">
							Manage the canonical library of challenges that commissioners build their boards from.
						</p>
						<div className="mt-4 flex items-center text-sm font-medium text-purple-600">
							Manage <span className="ml-2">→</span>
						</div>
					</div>
				</Link>

				{/* Challenge Categories Management */}
				<Link href="/admin/challenge-categories">
					<div className="cursor-pointer rounded-lg border-2 border-indigo-300 bg-gradient-to-br from-indigo-50 to-indigo-100 p-6 transition hover:shadow-lg">
						<h2 className="font-semibold text-lg text-indigo-900">
							Challenge Categories
						</h2>
						<p className="mt-3 text-sm text-indigo-700">
							Manage the categories used when organizing challenges.
						</p>
						<div className="mt-4 flex items-center text-sm font-medium text-indigo-600">
							Manage <span className="ml-2">→</span>
						</div>
					</div>
				</Link>

				{/* Advantages Library Management */}
				<Link href="/admin/advantages">
					<div className="cursor-pointer rounded-lg border-2 border-emerald-300 bg-gradient-to-br from-emerald-50 to-emerald-100 p-6 transition hover:shadow-lg">
						<h2 className="font-semibold text-lg text-emerald-900">
							Advantages Library
						</h2>
						<p className="mt-3 text-sm text-emerald-700">
							Manage the canonical library of advantages available to commissioners.
						</p>
						<div className="mt-4 flex items-center text-sm font-medium text-emerald-600">
							Manage <span className="ml-2">→</span>
						</div>
					</div>
				</Link>

				{/* Coming Soon - Users Management */}
				<div className="rounded-lg border-2 border-gray-200 bg-gray-50 p-6">
					<h2 className="font-semibold text-lg text-gray-900">
						Users
					</h2>
					<p className="mt-3 text-sm text-gray-600">
						Manage user roles and permissions.
					</p>
					<div className="mt-4 flex items-center text-sm font-medium text-gray-400">
						Coming Soon
					</div>
				</div>
			</div>

			{/* Back Button */}
			<div className="mt-8">
				<Button
					onClick={() => router.push("/dashboard")}
					variant="outline"
				>
					Back to Dashboard
				</Button>
			</div>
		</main>
	);
}

