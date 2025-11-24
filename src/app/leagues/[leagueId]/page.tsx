"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "convex/_generated/api";
import { Id } from "convex/_generated/dataModel";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { useAuth } from "~/lib/auth-context";
import { getSeasonStatusLabel, getPhaseLabel } from "~/lib/enum-utils";

export default function LeagueDashboardPage() {
	const router = useRouter();
	const params = useParams();
	const leagueId = params.leagueId as string;
	const { isAuthenticated, user, isLoading } = useAuth();

	const [newMemberEmail, setNewMemberEmail] = useState("");
	const [newMemberRole, setNewMemberRole] = useState<
		"COMMISSIONER" | "PLAYER" | "SPECTATOR"
	>("PLAYER");
	const [isAddingMember, setIsAddingMember] = useState(false);
	const [message, setMessage] = useState<{
		type: "success" | "error";
		text: string;
	} | null>(null);

	const league = useQuery(api.leagues.getLeague, {
		leagueId: leagueId as Id<"leagues">,
	});

	const seasons = useQuery(api.seasons.listSeasons, {
		leagueId: leagueId as Id<"leagues">,
	});

	const addMemberMutation = useMutation(api.leagues.addMember);

	useEffect(() => {
		if (!isLoading && !isAuthenticated) {
			router.replace("/login");
		}
	}, [isAuthenticated, isLoading, router]);

	async function handleAddMember(e: React.FormEvent) {
		e.preventDefault();
		setMessage(null);
		setIsAddingMember(true);

		if (!newMemberEmail.trim()) {
			setMessage({ type: "error", text: "Email is required" });
			setIsAddingMember(false);
			return;
		}

		try {
			await addMemberMutation({
				leagueId: leagueId as Id<"leagues">,
				email: newMemberEmail.trim(),
				role: newMemberRole,
				requesterId: user!.id,
			});

			setMessage({
				type: "success",
				text: `${newMemberEmail} added to league!`,
			});
			setNewMemberEmail("");
			setNewMemberRole("PLAYER");
		} catch (err) {
			const errorMessage =
				err instanceof Error ? err.message : "Failed to add member";
			setMessage({ type: "error", text: errorMessage });
		} finally {
			setIsAddingMember(false);
		}
	}

	const isCommissioner = league && league.commissionerId === user?.id;

	if (isLoading || !isAuthenticated || !user) {
		return (
			<main className="mx-auto max-w-4xl px-4 py-10">
				<p>Loading...</p>
			</main>
		);
	}

	if (!league) {
		return (
			<main className="mx-auto max-w-4xl px-4 py-10">
				<p className="text-red-500">League not found</p>
				<Button onClick={() => router.push("/dashboard")}>
					Back to Dashboard
				</Button>
			</main>
		);
	}

	return (
		<main className="mx-auto max-w-4xl px-4 py-10">
			<h1 className="mb-2 font-semibold text-3xl">{league.name}</h1>
			<p className="mb-6 text-gray-600">
				Commissioner:{" "}
				<span className="font-medium">
					{league.commissioner.displayName} ({league.commissioner.email})
				</span>
			</p>

			{/* Members List */}
			<div className="mb-8 rounded-lg border border-gray-200 bg-white p-6">
				<h2 className="mb-4 font-semibold text-xl">Members</h2>
				<div className="space-y-2">
					{league.members && league.members.length > 0 ? (
						<div className="overflow-x-auto">
							<table className="w-full">
								<thead>
									<tr className="border-b">
										<th className="px-4 py-2 text-left font-semibold">
											Name
										</th>
										<th className="px-4 py-2 text-left font-semibold">
											Email
										</th>
										<th className="px-4 py-2 text-left font-semibold">
											Role
										</th>
									</tr>
								</thead>
								<tbody>
									{league.members.map((member: any) => (
										<tr
											key={member._id}
											className="border-b hover:bg-gray-50"
										>
											<td className="px-4 py-2">
												{member.user.displayName}
											</td>
											<td className="px-4 py-2">{member.user.email}</td>
											<td className="px-4 py-2">
												<span
													className={`px-2 py-1 rounded text-sm font-medium ${member.role === "COMMISSIONER"
															? "bg-purple-100 text-purple-800"
															: member.role === "PLAYER"
																? "bg-blue-100 text-blue-800"
																: "bg-gray-100 text-gray-800"
														}`}
												>
													{member.role}
												</span>
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					) : (
						<p className="text-gray-500">No members yet</p>
					)}
				</div>
			</div>

			{/* Add Member Section (Commissioner Only) */}
			{isCommissioner && (
				<div className="mb-8 rounded-lg border border-gray-200 bg-white p-6">
					<h2 className="mb-4 font-semibold text-xl">Add Member</h2>
					<form onSubmit={handleAddMember} className="space-y-4">
						<div className="grid grid-cols-1 gap-4 md:grid-cols-3">
							<div className="flex flex-col gap-1">
								<Label htmlFor="email">Email</Label>
								<Input
									id="email"
									type="email"
									value={newMemberEmail}
									onChange={(e) => setNewMemberEmail(e.target.value)}
									placeholder="player@example.com"
								/>
							</div>

							<div className="flex flex-col gap-1">
								<Label htmlFor="role">Role</Label>
								<select
									id="role"
									value={newMemberRole}
									onChange={(e) =>
										setNewMemberRole(
											e.target.value as
											| "COMMISSIONER"
											| "PLAYER"
											| "SPECTATOR"
										)
									}
									className="rounded border border-gray-300 px-3 py-2"
								>
									<option value="PLAYER">Player</option>
									<option value="SPECTATOR">Spectator</option>
									<option value="COMMISSIONER">Commissioner</option>
								</select>
							</div>

							<div className="flex items-end gap-2">
								<Button
									type="submit"
									disabled={isAddingMember}
									variant="outline"
								>
									{isAddingMember ? "Adding..." : "Add Member"}
								</Button>
							</div>
						</div>

						{message && (
							<p
								className={`text-sm ${message.type === "success"
										? "text-green-600"
										: "text-red-600"
									}`}
							>
								{message.text}
							</p>
						)}
					</form>
				</div>
			)}

			{/* Seasons Section */}
			<div className="mb-8 rounded-lg border border-gray-200 bg-white p-6">
				<div className="mb-4 flex items-center justify-between">
					<h2 className="font-semibold text-xl">Seasons</h2>
					{isCommissioner && (
						<Button
							onClick={() =>
								router.push(
									`/leagues/${leagueId}/seasons/new`
								)
							}
							variant="outline"
						>
							Create Season
						</Button>
					)}
				</div>

				{seasons && seasons.length > 0 ? (
					<div className="space-y-3">
						{seasons.map((season: any) => (
							<div
								key={season._id}
								className="flex items-center justify-between rounded border border-gray-200 p-4 hover:bg-gray-50"
							>
								<div
									className="flex-1 cursor-pointer"
									onClick={() =>
										router.push(
											`/seasons/${season._id}`
										)
									}
								>
									<p className="font-medium">{season.name}</p>
									<p className="text-sm text-gray-600">
										Phase: {getPhaseLabel(season.currentPhase)} • Week:{" "}
										{season.currentWeek}
									</p>
									<p className="text-sm text-gray-500">
										Status: {getSeasonStatusLabel(season.status)}
									</p>
								</div>
								{isCommissioner && (
									<Button
										onClick={() =>
											router.push(
												`/seasons/${season._id}/admin`
											)
										}
										variant="outline"
										className="text-blue-500 ml-4"
									>
										Manage
									</Button>
								)}
							</div>
						))}
					</div>
				) : (
					<p className="text-gray-600">
						No seasons yet.{" "}
						{isCommissioner && (
							<button
								onClick={() =>
									router.push(
										`/leagues/${leagueId}/seasons/new`
									)
								}
								className="text-blue-500 hover:underline"
							>
								Create one now!
							</button>
						)}
					</p>
				)}
			</div>

			{/* Back Button */}
			<div>
				<Button
					onClick={() => router.push("/dashboard")}
					variant="outline"
					className="text-gray-500"
				>
					Back to Dashboard
				</Button>
			</div>
		</main>
	);
}

