"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "convex/_generated/api";
import type { Id } from "convex/_generated/dataModel";
import { Button } from "~/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "~/components/ui/dialog";
import { useAuth } from "~/lib/auth-context";
import { toast } from "sonner";
import { getSeasonStatusLabel, getPhaseLabel } from "~/lib/enum-utils";
import { getAvailableCheckpoints, type CheckpointOption } from "~/lib/checkpoint-implications";
import { DebugDataPanel } from "./components/debug-data-panel";

const flashStyles = `
  @keyframes successFlash {
    from {
      background-color: rgb(220, 252, 231);
      border-color: rgb(134, 239, 172);
    }
    to {
      background-color: transparent;
      border-color: rgb(229, 231, 235);
    }
  }
  
  .success-flash {
    animation: successFlash 0.8s ease-out forwards;
  }
`;

const SEASON_PHASES = [
	"SEASON_SETUP",
	"DRAFTING",
	"ADVANTAGE_SELECTION",
	"READY_FOR_WEEK_1",
	"IN_SEASON_CHALLENGE_SELECTION",
	"PLAYLIST_SUBMISSION",
	"PLAYLIST_PRESENTATION",
	"VOTING",
	"IN_SEASON_WEEK_END",
];

const PHASE_ORDER: Record<string, number> = {
	SEASON_SETUP: 0,
	DRAFTING: 1,
	ADVANTAGE_SELECTION: 2,
	READY_FOR_WEEK_1: 3,
	IN_SEASON_CHALLENGE_SELECTION: 4,
	PLAYLIST_SUBMISSION: 5,
	PLAYLIST_PRESENTATION: 6,
	VOTING: 7,
	IN_SEASON_WEEK_END: 8,
};

export default function SeasonAdminPage() {
	const router = useRouter();
	const params = useParams();
	const seasonId = params.seasonId as string;
	const { isAuthenticated, user, isLoading } = useAuth();

	const [selectedPhase, setSelectedPhase] = useState<string>("");
	const [isAdvancing, setIsAdvancing] = useState(false);
	const [editingLabelId, setEditingLabelId] = useState<string | null>(null);
	const [editingLabelText, setEditingLabelText] = useState("");
	const [flashingRowId, setFlashingRowId] = useState<string | null>(null);
	const [showPhaseConfirm, setShowPhaseConfirm] = useState(false);
	const [message, setMessage] = useState<{
		type: "success" | "error";
		text: string;
	} | null>(null);
	const [showDraftConfirm, setShowDraftConfirm] = useState(false);
	const [isInitiatingDraft, setIsInitiatingDraft] = useState(false);
	const [showResetConfirm, setShowResetConfirm] = useState(false);
	const [isResettingDraft, setIsResettingDraft] = useState(false);
	const [showStartSeasonConfirm, setShowStartSeasonConfirm] = useState(false);
	const [isStartingSeason, setIsStartingSeason] = useState(false);
	const [showResetChallengeConfirm, setShowResetChallengeConfirm] = useState(false);
	const [isResettingChallenge, setIsResettingChallenge] = useState(false);
	const [selectedCheckpoint, setSelectedCheckpoint] = useState<string>("");
	const [showRollbackConfirm, setShowRollbackConfirm] = useState(false);
	const [isRollingBack, setIsRollingBack] = useState(false);
	const [isStartingPresentation, setIsStartingPresentation] = useState(false);
	const [showPresentationConfirm, setShowPresentationConfirm] = useState(false);
	const [isAdvancingToVoting, setIsAdvancingToVoting] = useState(false);
	const [showVotingConfirm, setShowVotingConfirm] = useState(false);
	const [voteRevealMode, setVoteRevealMode] = useState<'IMMEDIATE' | 'ON_REVEAL'>('ON_REVEAL');
	const [showDeleteSeasonConfirm, setShowDeleteSeasonConfirm] = useState(false);
	const [isDeletingSeason, setIsDeletingSeason] = useState(false);
	const [draftDuplicateSourceSeasonId, setDraftDuplicateSourceSeasonId] = useState<string>("");
	const [challengeDuplicateSourceSeasonId, setChallengeDuplicateSourceSeasonId] = useState<string>("");
	const [advantageDuplicateSourceSeasonId, setAdvantageDuplicateSourceSeasonId] = useState<string>("");
	const [isDuplicatingDraftBoard, setIsDuplicatingDraftBoard] = useState(false);
	const [isDuplicatingChallengeBoard, setIsDuplicatingChallengeBoard] = useState(false);
	const [isDuplicatingAdvantageBoard, setIsDuplicatingAdvantageBoard] = useState(false);

	const season = useQuery(api.seasons.getSeason, {
		seasonId: seasonId as Id<"seasons">,
	});

	const seasonPlayers = useQuery(api.seasons.getSeasonPlayers, {
		seasonId: seasonId as Id<"seasons">,
	});

	const boardData = useQuery(api.drafts.getBoard, {
		seasonId: seasonId as Id<"seasons">,
	});

	const challengeBoardData = useQuery(api.challenges.getBoard, {
		seasonId: seasonId as Id<"seasons">,
	});

	const advantageBoardData = useQuery(api.advantages.getBoard, {
		seasonId: seasonId as Id<"seasons">,
	});

	const advantageSelectionState = useQuery(api.inventory.getAdvantageSelectionState, {
		seasonId: seasonId as Id<"seasons">,
	});

	const weekPlaylists = useQuery(
		api.playlists.getWeekPlaylists,
		season && season.currentPhase === "PLAYLIST_SUBMISSION"
			? { seasonId: seasonId as Id<"seasons">, weekNumber: season.currentWeek }
			: "skip"
	);

	const leagueSeasons = useQuery(
		api.seasons.getCommissionerSeasons,
		user ? { userId: user.id } : "skip"
	);

	const advancePhaseMutation = useMutation(api.seasons.advancePhase);
	const updateLabelMutation = useMutation(
		api.seasons.updateSeasonPlayerLabel
	);
	const startSeasonMutation = useMutation(api.seasons.startSeason);
	const resetChallengeSelectionMutation = useMutation(api.challenges.resetChallengeSelection);
	const rollbackToCheckpointMutation = useMutation(api.seasons.rollbackToCheckpoint);
	const startPresentationPhaseAction = useAction(api.actions.presentation.startPresentationPhase);
	const advanceToVotingMutation = useMutation(api.seasons.advanceToVoting);
	const deleteSeasonMutation = useMutation(api.seasons.deleteSeason);
	const duplicateDraftBoardMutation = useMutation(api.drafts.duplicateBoardFromSeason);
	const duplicateChallengeBoardMutation = useMutation(api.challenges.duplicateBoardFromSeason);
	const duplicateAdvantageBoardMutation = useMutation(api.advantages.duplicateBoardFromSeason);

	const [showDebugData, setShowDebugData] = useState(false);

	useEffect(() => {
		if (!isLoading && !isAuthenticated) {
			router.replace("/login");
		}
	}, [isAuthenticated, isLoading, router]);

	useEffect(() => {
		if (season) {
			setSelectedPhase(season.currentPhase);
		}
	}, [season]);

	function handleAdvancePhaseClick() {
		setShowPhaseConfirm(true);
	}

	const handleDuplicateDraftBoard = async () => {
		if (!season || !user) return;
		if (!draftDuplicateSourceSeasonId) {
			toast.error("Select a source season to duplicate from");
			return;
		}
		if (draftDuplicateSourceSeasonId === season._id) {
			toast.error("Cannot duplicate from the same season");
			return;
		}
		try {
			setIsDuplicatingDraftBoard(true);
			await duplicateDraftBoardMutation({
				targetSeasonId: season._id as Id<"seasons">,
				sourceSeasonId: draftDuplicateSourceSeasonId as Id<"seasons">,
				requestingUserId: user.id,
			});
			toast.success("Draft board duplicated from selected season");
		} catch (err) {
			const errorMessage =
				err instanceof Error ? err.message : "Failed to duplicate draft board";
			toast.error(errorMessage);
		} finally {
			setIsDuplicatingDraftBoard(false);
		}
	};

	const handleDuplicateChallengeBoard = async () => {
		if (!season || !user) return;
		if (!challengeDuplicateSourceSeasonId) {
			toast.error("Select a source season to duplicate from");
			return;
		}
		if (challengeDuplicateSourceSeasonId === season._id) {
			toast.error("Cannot duplicate from the same season");
			return;
		}
		try {
			setIsDuplicatingChallengeBoard(true);
			await duplicateChallengeBoardMutation({
				targetSeasonId: season._id as Id<"seasons">,
				sourceSeasonId: challengeDuplicateSourceSeasonId as Id<"seasons">,
				requestingUserId: user.id,
			});
			toast.success("Challenge board duplicated from selected season");
		} catch (err) {
			const errorMessage =
				err instanceof Error ? err.message : "Failed to duplicate challenge board";
			toast.error(errorMessage);
		} finally {
			setIsDuplicatingChallengeBoard(false);
		}
	};

	const handleDuplicateAdvantageBoard = async () => {
		if (!season || !user) return;
		if (!advantageDuplicateSourceSeasonId) {
			toast.error("Select a source season to duplicate from");
			return;
		}
		if (advantageDuplicateSourceSeasonId === season._id) {
			toast.error("Cannot duplicate from the same season");
			return;
		}
		try {
			setIsDuplicatingAdvantageBoard(true);
			await duplicateAdvantageBoardMutation({
				targetSeasonId: season._id as Id<"seasons">,
				sourceSeasonId: advantageDuplicateSourceSeasonId as Id<"seasons">,
				requestingUserId: user.id,
			});
			toast.success("Advantage board duplicated from selected season");
		} catch (err) {
			const errorMessage =
				err instanceof Error ? err.message : "Failed to duplicate advantage board";
			toast.error(errorMessage);
		} finally {
			setIsDuplicatingAdvantageBoard(false);
		}
	};

	async function handleConfirmAdvancePhase() {
		if (!selectedPhase || !season) return;

		// Validate phase progression
		if (PHASE_ORDER[selectedPhase] <= PHASE_ORDER[season.currentPhase]) {
			setMessage({
				type: "error",
				text: "Phases can only move forward, not backwards",
			});
			setShowPhaseConfirm(false);
			return;
		}

		setIsAdvancing(true);
		setMessage(null);
		setShowPhaseConfirm(false);

		try {
			await advancePhaseMutation({
				seasonId: seasonId as Id<"seasons">,
				newPhase: selectedPhase,
				requesterId: user!.id,
			});

			setMessage({
				type: "success",
				text: `Phase advanced to ${selectedPhase}`,
			});
		} catch (err) {
			const errorMessage =
				err instanceof Error ? err.message : "Failed to advance phase";
			setMessage({ type: "error", text: errorMessage });
		} finally {
			setIsAdvancing(false);
		}
	}

	// Check if draft order is set (all players have draftPosition)
	const draftOrderIsSet = (): boolean => {
		return !!(seasonPlayers && seasonPlayers.length > 0 && seasonPlayers.every(p => p.draftPosition));
	};

	// Check if all 4 setup aspects are ready
	const allSetupsReady = (): boolean => {
		const draftBoardReady = boardData?.board?.isLocked;
		const challengeBoardReady = challengeBoardData?.board?.isLocked;
		const advantageBoardReady = advantageBoardData?.board?.isLocked;
		const draftOrderReady = draftOrderIsSet();

		return !!(draftBoardReady && challengeBoardReady && advantageBoardReady && draftOrderReady);
	};

	// Check if all players have starting advantages assigned
	const allAdvantagesAssigned = (): boolean => {
		if (!advantageSelectionState || !seasonPlayers) {
			return false;
		}

		// Check if every player has at least one starting advantage
		return seasonPlayers.every((player) => {
			const assignment = advantageSelectionState.playerAssignments.find(
				(pa) => pa.playerId.toString() === player._id.toString()
			);
			return assignment && assignment.assignedAdvantages.length > 0;
		});
	};

	// Check if all players have submitted their playlists
	const allPlaylistsSubmitted = (): boolean => {
		if (!weekPlaylists || !seasonPlayers) {
			return false;
		}
		// Check if every player has a submission
		return seasonPlayers.every((player) =>
			weekPlaylists.some(
				(submission) => submission.seasonPlayerId.toString() === player._id.toString()
			)
		);
	};

	// Initialize draft and advance phase
	const initializeDraftMutation = useMutation(api.drafts.initializeDraft);
	const advancePhaseForDraftMutation = useMutation(api.seasons.advancePhase);
	const resetDraftMutation = useMutation(api.drafts.resetDraft);

	const handleInitiateDraft = async () => {
		try {
			setIsInitiatingDraft(true);

			// Initialize draft state
			await initializeDraftMutation({
				seasonId: seasonId as Id<"seasons">,
			});

			// Advance phase to DRAFTING
			await advancePhaseForDraftMutation({
				seasonId: seasonId as Id<"seasons">,
				newPhase: 'DRAFTING',
				requesterId: user!.id,
			});

			// Close dialog and redirect
			setShowDraftConfirm(false);
			toast.success('Draft initiated! Redirecting to draft board...');

			setTimeout(() => {
				router.push(`/seasons/${seasonId}/draft`);
			}, 1000);
		} catch (err) {
			const errorMessage = err instanceof Error ? err.message : 'Failed to initiate draft';
			toast.error(errorMessage);
			setIsInitiatingDraft(false);
		}
	};

	function startEditingLabel(playerId: string, currentLabel: string) {
		setEditingLabelId(playerId);
		setEditingLabelText(currentLabel);
	}

	async function handleSaveLabel(playerId: string) {
		if (!editingLabelText.trim()) {
			setMessage({ type: "error", text: "Label name cannot be empty" });
			return;
		}

		try {
			await updateLabelMutation({
				seasonPlayerId: playerId as Id<"season_players">,
				labelName: editingLabelText.trim(),
				requesterId: user!.id,
			});

			// Flash the row with success color
			setFlashingRowId(playerId);
			setTimeout(() => setFlashingRowId(null), 800);

			setEditingLabelId(null);
			setEditingLabelText("");
		} catch (err) {
			const errorMessage =
				err instanceof Error ? err.message : "Failed to update label";
			setMessage({ type: "error", text: errorMessage });
		}
	}

	function handleCancelEdit() {
		setEditingLabelId(null);
		setEditingLabelText("");
	}

	const handleResetDraft = async () => {
		try {
			setIsResettingDraft(true);
			await resetDraftMutation({
				seasonId: seasonId as Id<"seasons">,
				requestingUserId: user!.id,
				randomizeDraftOrder: false, // Keep existing draft order - never randomize on reset
			});
			setShowResetConfirm(false);
			toast.success('Draft reset to initial state! Players and selections cleared.');
		} catch (err) {
			const errorMessage = err instanceof Error ? err.message : 'Failed to reset draft';
			toast.error(errorMessage);
		} finally {
			setIsResettingDraft(false);
		}
	};

	const handleStartSeason = async () => {
		try {
			setIsStartingSeason(true);
			await startSeasonMutation({
				seasonId: seasonId as Id<"seasons">,
				requesterId: user!.id,
			});
			setShowStartSeasonConfirm(false);
			toast.success('Season started! Entering challenge selection phase...');
			// Reload to get updated season state
			setTimeout(() => {
				window.location.reload();
			}, 1000);
		} catch (err) {
			const errorMessage = err instanceof Error ? err.message : 'Failed to start season';
			toast.error(errorMessage);
		} finally {
			setIsStartingSeason(false);
		}
	};

	const handleResetChallengeSelection = async () => {
		try {
			setIsResettingChallenge(true);
			await resetChallengeSelectionMutation({
				seasonId: seasonId as Id<"seasons">,
				requestingUserId: user!.id,
			});
			setShowResetChallengeConfirm(false);
			toast.success('Challenge selection reset! All reveals and selections cleared for this week.');
			// Reload to get updated state
			setTimeout(() => {
				window.location.reload();
			}, 1000);
		} catch (err) {
			const errorMessage = err instanceof Error ? err.message : 'Failed to reset challenge selection';
			toast.error(errorMessage);
		} finally {
			setIsResettingChallenge(false);
		}
	};

	const handleRollbackToCheckpoint = async () => {
		if (!selectedCheckpoint || !season) return;

		try {
			setIsRollingBack(true);
			await rollbackToCheckpointMutation({
				seasonId: seasonId as Id<"seasons">,
				checkpoint: selectedCheckpoint,
				requesterId: user!.id,
			});
			setShowRollbackConfirm(false);
			setSelectedCheckpoint("");
			toast.success('Season rolled back successfully!');
			// Reload to get updated state
			setTimeout(() => {
				window.location.reload();
			}, 1000);
		} catch (err) {
			const errorMessage = err instanceof Error ? err.message : 'Failed to rollback season';
			toast.error(errorMessage);
		} finally {
			setIsRollingBack(false);
		}
	};

	const handleStartPresentationPhase = async () => {
		if (!season || !user) return;

		try {
			setIsStartingPresentation(true);
			const result = await startPresentationPhaseAction({
				seasonId: seasonId as Id<"seasons">,
				requestingUserId: user.id,
			});
			setShowPresentationConfirm(false);
			toast.success(`Presentation phase started! Refreshed ${result.refreshedCount} playlists from Spotify.`);
			// Navigate to presentation page
			setTimeout(() => {
				router.push(`/seasons/${seasonId}/presentation`);
			}, 500);
		} catch (err) {
			const errorMessage = err instanceof Error ? err.message : 'Failed to start presentation phase';
			toast.error(errorMessage);
		} finally {
			setIsStartingPresentation(false);
		}
	};

	const handleAdvanceToVoting = async () => {
		if (!season || !user) return;

		try {
			setIsAdvancingToVoting(true);
			await advanceToVotingMutation({
				seasonId: seasonId as Id<"seasons">,
				revealMode: voteRevealMode,
				requesterId: user.id,
			});
			setShowVotingConfirm(false);
			toast.success(`Voting phase started! Vote visibility: ${voteRevealMode === 'IMMEDIATE' ? 'Immediate' : 'On Reveal'}`);
			// Navigate to voting page
			setTimeout(() => {
				router.push(`/seasons/${seasonId}/vote`);
			}, 500);
		} catch (err) {
			const errorMessage = err instanceof Error ? err.message : 'Failed to advance to voting phase';
			toast.error(errorMessage);
		} finally {
			setIsAdvancingToVoting(false);
		}
	};

	const handleDeleteSeason = async () => {
		if (!season || !user) return;

		try {
			setIsDeletingSeason(true);
			await deleteSeasonMutation({
				seasonId: seasonId as Id<"seasons">,
				requesterId: user.id,
			});
			setShowDeleteSeasonConfirm(false);
			toast.success('Season deleted successfully');
			// Redirect to league page
			setTimeout(() => {
				router.push(`/leagues/${season.leagueId}`);
			}, 1000);
		} catch (err) {
			const errorMessage = err instanceof Error ? err.message : 'Failed to delete season';
			toast.error(errorMessage);
		} finally {
			setIsDeletingSeason(false);
		}
	};

	function handleFormSubmit(
		e: React.FormEvent<HTMLFormElement>,
		playerId: string
	) {
		e.preventDefault();
		handleSaveLabel(playerId);
	}

	const isCommissioner = season && season.league.commissioner.id === user?.id;

	if (isLoading || !isAuthenticated || !user) {
		return (
			<main className="mx-auto max-w-4xl px-4 py-10">
				<p>Loading...</p>
			</main>
		);
	}

	if (season === undefined) {
		return (
			<main className="mx-auto max-w-4xl px-4 py-10">
				<p>Loading...</p>
			</main>
		);
	}

	if (!season) {
		return (
			<main className="mx-auto max-w-4xl px-4 py-10">
				<p className="text-red-500">Season not found</p>
				<Button onClick={() => router.push("/dashboard")}>
					Back to Dashboard
				</Button>
			</main>
		);
	}

	return (
		<>
			<style>{flashStyles}</style>
			<main className="mx-auto max-w-4xl px-4 py-10">
				<div className="mb-6 flex items-start justify-between gap-4">
					<div>
						<h1 className="mb-2 font-semibold text-3xl">{season.name}</h1>
						<p className="text-gray-600">
							League:{" "}
							<span className="font-medium">{season.league.name}</span>
						</p>
					</div>
					<button
						onClick={() => router.push(`/seasons/${seasonId}`)}
						className="text-sm text-blue-600 hover:text-blue-800 hover:underline whitespace-nowrap"
					>
						Go to Player Dashboard →
					</button>
				</div>

				{/* Season Status & Config */}
				<div className="mb-8 rounded-lg border border-gray-200 bg-white p-6">
					<h2 className="mb-4 font-semibold text-xl">Season Status</h2>
					<div className="space-y-3">
						<div className="grid grid-cols-2 gap-4 md:grid-cols-4">
							<div>
								<p className="text-sm text-gray-600">Status</p>
								<p className="font-medium">{getSeasonStatusLabel(season.status)}</p>
							</div>
							<div>
								<p className="text-sm text-gray-600">Current Phase</p>
								<p className="font-medium">{getPhaseLabel(season.currentPhase)}</p>
							</div>
							<div>
								<p className="text-sm text-gray-600">Week</p>
								<p className="font-medium">{season.currentWeek}</p>
							</div>
							<div>
								<p className="text-sm text-gray-600">Roster Size</p>
								<p className="font-medium">
									{season.config.rosterSize}
								</p>
							</div>
						</div>
					</div>
				</div>

				{/* Setup Sections (Commissioner Only) */}
				{isCommissioner && (
					<>
						<div className="mb-8">
							<button
								onClick={() => router.push(`/seasons/${seasonId}/admin/players`)}
								className="w-full rounded-lg border-2 border-slate-300 bg-slate-50 p-6 text-left transition hover:bg-slate-100 flex items-center justify-between mb-4"
							>
								<div>
									<h3 className="font-semibold text-lg text-slate-900">
										View All Players
									</h3>
									<p className="mt-2 text-sm text-slate-700">
										See standings, rosters, and advantages for all players
									</p>
								</div>
								<div className="text-slate-600 ml-4 flex-shrink-0">
									<svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
									</svg>
								</div>
							</button>
						</div>
						{season.currentPhase === "SEASON_SETUP" && (
							<div className="mb-8">
								<button
									onClick={() => router.push(`/seasons/${seasonId}/preseason-settings`)}
									className="w-full rounded-lg border-2 border-purple-300 bg-purple-50 p-6 text-left transition hover:bg-purple-100 flex items-center justify-between mb-4"
								>
									<div>
										<h3 className="font-semibold text-lg text-purple-900">
											⚙️ Preseason Settings
										</h3>
										<p className="mt-2 text-sm text-purple-700">
											Configure advantage selection requirements for each player
										</p>
									</div>
									<div className="text-purple-600 ml-4 flex-shrink-0">
										<svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
										</svg>
									</div>
								</button>
							</div>
						)}
						<div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-4">
							<div className={`rounded-lg border-2 p-6 transition ${boardData?.board?.isLocked
								? "border-green-300 bg-green-50"
								: "border-blue-300 bg-blue-50"
								}`}>
								<button
									onClick={() => router.push(`/seasons/${seasonId}/admin/draft-board`)}
									className="w-full text-left"
								>
									<h3 className={`font-semibold text-lg ${boardData?.board?.isLocked
										? "text-green-900"
										: "text-blue-900"
										}`}>
										{boardData?.board?.isLocked ? "✓ Draft Board Locked" : "Draft Board Setup"}
									</h3>
									<p className={`mt-2 text-sm ${boardData?.board?.isLocked
										? "text-green-700"
										: "text-blue-700"
										}`}>
										{boardData?.board?.isLocked
											? "Your draft board is ready to go"
											: "Create categories and add prompts for your draft board."}
									</p>
								</button>
								{leagueSeasons && leagueSeasons.length > 1 && !boardData?.board?.isLocked && (
									<div className="mt-4 space-y-1 text-xs text-slate-700" onClick={(e) => e.stopPropagation()}>
										<p className="font-semibold">Duplicate from another season</p>
										<div className="flex flex-col gap-2">
											<select
												value={draftDuplicateSourceSeasonId}
												onChange={(e) => setDraftDuplicateSourceSeasonId(e.target.value)}
												onClick={(e) => e.stopPropagation()}
												className="rounded border border-gray-300 px-2 py-1 text-xs"
											>
												<option value="">Select season...</option>
												{leagueSeasons
													.filter((s: any) => s._id !== season._id)
													.map((s: any) => (
														<option key={s._id} value={s._id}>
															{s.name}
														</option>
													))}
											</select>
											<Button
												onClick={(e) => {
													e.stopPropagation();
													handleDuplicateDraftBoard();
												}}
												size="sm"
												variant="outline"
												disabled={isDuplicatingDraftBoard || !draftDuplicateSourceSeasonId}
												className="text-xs"
											>
												{isDuplicatingDraftBoard ? "Duplicating..." : "Duplicate Draft Board"}
											</Button>
										</div>
									</div>
								)}
							</div>
							<div className={`rounded-lg border-2 p-6 transition ${challengeBoardData?.board?.isLocked
								? "border-green-300 bg-green-50"
								: "border-purple-300 bg-purple-50"
								}`}>
								<button
									onClick={() => router.push(`/seasons/${seasonId}/admin/challenges`)}
									className="w-full text-left"
								>
									<h3 className={`font-semibold text-lg ${challengeBoardData?.board?.isLocked
										? "text-green-900"
										: "text-purple-900"
										}`}>
										{challengeBoardData?.board?.isLocked ? "✓ Challenge Board Locked" : "Challenge Board Setup"}
									</h3>
									<p className={`mt-2 text-sm ${challengeBoardData?.board?.isLocked
										? "text-green-700"
										: "text-purple-700"
										}`}>
										{challengeBoardData?.board?.isLocked
											? "Your challenge board is ready to go"
											: "Create categories and add challenges for your board."}
									</p>
								</button>
								{leagueSeasons && leagueSeasons.length > 1 && !challengeBoardData?.board?.isLocked && (
									<div className="mt-4 space-y-1 text-xs text-slate-700" onClick={(e) => e.stopPropagation()}>
										<p className="font-semibold">Duplicate from another season</p>
										<div className="flex flex-col gap-2">
											<select
												value={challengeDuplicateSourceSeasonId}
												onChange={(e) => setChallengeDuplicateSourceSeasonId(e.target.value)}
												onClick={(e) => e.stopPropagation()}
												className="rounded border border-gray-300 px-2 py-1 text-xs"
											>
												<option value="">Select season...</option>
												{leagueSeasons
													.filter((s: any) => s._id !== season._id)
													.map((s: any) => (
														<option key={s._id} value={s._id}>
															{s.name}
														</option>
													))}
											</select>
											<Button
												onClick={(e) => {
													e.stopPropagation();
													handleDuplicateChallengeBoard();
												}}
												size="sm"
												variant="outline"
												disabled={isDuplicatingChallengeBoard || !challengeDuplicateSourceSeasonId}
												className="text-xs"
											>
												{isDuplicatingChallengeBoard ? "Duplicating..." : "Duplicate Challenge Board"}
											</Button>
										</div>
									</div>
								)}
							</div>
							<div className={`rounded-lg border-2 p-6 transition ${advantageBoardData?.board?.isLocked
								? "border-green-300 bg-green-50"
								: "border-orange-300 bg-orange-50"
								}`}>
								<button
									onClick={() => router.push(`/seasons/${seasonId}/admin/advantages`)}
									className="w-full text-left"
								>
									<h3 className={`font-semibold text-lg ${advantageBoardData?.board?.isLocked
										? "text-green-900"
										: "text-orange-900"
										}`}>
										{advantageBoardData?.board?.isLocked ? "✓ Advantage Board Locked" : "Advantage Board Setup"}
									</h3>
									<p className={`mt-2 text-sm ${advantageBoardData?.board?.isLocked
										? "text-green-700"
										: "text-orange-700"
										}`}>
										{advantageBoardData?.board?.isLocked
											? "Your advantage board is ready to go"
											: "Organize advantages into Tier 1, Tier 2, and Tier 3."}
									</p>
								</button>
								{leagueSeasons && leagueSeasons.length > 1 && !advantageBoardData?.board?.isLocked && (
									<div className="mt-4 space-y-1 text-xs text-slate-700" onClick={(e) => e.stopPropagation()}>
										<p className="font-semibold">Duplicate from another season</p>
										<div className="flex flex-col gap-2">
											<select
												value={advantageDuplicateSourceSeasonId}
												onChange={(e) => setAdvantageDuplicateSourceSeasonId(e.target.value)}
												onClick={(e) => e.stopPropagation()}
												className="rounded border border-gray-300 px-2 py-1 text-xs"
											>
												<option value="">Select season...</option>
												{leagueSeasons
													.filter((s: any) => s._id !== season._id)
													.map((s: any) => (
														<option key={s._id} value={s._id}>
															{s.name}
														</option>
													))}
											</select>
											<Button
												onClick={(e) => {
													e.stopPropagation();
													handleDuplicateAdvantageBoard();
												}}
												size="sm"
												variant="outline"
												disabled={isDuplicatingAdvantageBoard || !advantageDuplicateSourceSeasonId}
												className="text-xs"
											>
												{isDuplicatingAdvantageBoard ? "Duplicating..." : "Duplicate Advantage Board"}
											</Button>
										</div>
									</div>
								)}
							</div>
							{/* Draft Order Setup - Show during SEASON_SETUP or DRAFTING (after reset) */}
							{(season.currentPhase === "SEASON_SETUP" || season.currentPhase === "DRAFTING") && (
								<button
									onClick={() => router.push(`/seasons/${seasonId}/admin/draft-order`)}
									className={`rounded-lg border-2 p-6 text-left transition ${draftOrderIsSet()
										? "border-green-300 bg-green-50 hover:bg-green-100"
										: "border-indigo-300 bg-indigo-50 hover:bg-indigo-100"
										}`}
								>
									<h3 className={`font-semibold text-lg ${draftOrderIsSet()
										? "text-green-900"
										: "text-indigo-900"
										}`}>
										{draftOrderIsSet() ? "✓ Draft Order Set" : "Set Draft Order"}
									</h3>
									<p className={`mt-2 text-sm ${draftOrderIsSet()
										? "text-green-700"
										: "text-indigo-700"
										}`}>
										{draftOrderIsSet()
											? "Players are ready to draft"
											: "Arrange players to determine pick order."}
									</p>
								</button>
							)}
						</div>
					</>
				)}

				{/* Initiate Draft Phase Button (Commissioner Only, when all ready) */}
				{isCommissioner && season.currentPhase === "SEASON_SETUP" && allSetupsReady() && (
					<div className="mb-8">
						<button
							onClick={() => setShowDraftConfirm(true)}
							className="w-full rounded-lg border-2 border-blue-300 bg-blue-50 p-6 text-left transition hover:bg-blue-100 flex items-center justify-between"
						>
							<div>
								<h3 className="font-semibold text-lg text-blue-900">
									Initiate Draft Phase
								</h3>
								<p className="mt-2 text-sm text-blue-700">
									All setup is complete! Click to begin the draft.
								</p>
							</div>
							<div className="text-blue-600 ml-4 flex-shrink-0">
								<svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
								</svg>
							</div>
						</button>
					</div>
				)}

				{/* Go To Draft Button (Commissioner Only, during DRAFTING phase) */}
				{isCommissioner && season.currentPhase === "DRAFTING" && (
					<div className="mb-8">
						<button
							onClick={() => router.push(`/seasons/${seasonId}/draft`)}
							className="w-full rounded-lg border-2 border-blue-400 bg-blue-100 p-6 text-left transition hover:bg-blue-200 flex items-center justify-between"
						>
							<div>
								<h3 className="font-semibold text-lg text-blue-900">
									🎯 Go To Draft
								</h3>
								<p className="mt-2 text-sm text-blue-800">
									Continue or view the live draft board
								</p>
							</div>
							<div className="text-blue-700 ml-4 flex-shrink-0">
								<svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
								</svg>
							</div>
						</button>
					</div>
				)}

				{/* Assign Advantages Button (Commissioner Only, during ADVANTAGE_SELECTION phase) */}
				{isCommissioner && season.currentPhase === "ADVANTAGE_SELECTION" && (
					<div className="mb-8">
						<button
							onClick={() => router.push(`/seasons/${seasonId}/advantage-selection`)}
							className={`w-full rounded-lg border-2 p-6 text-left transition flex items-center justify-between ${allAdvantagesAssigned()
								? "border-green-300 bg-green-50 hover:bg-green-100"
								: "border-orange-300 bg-orange-50 hover:bg-orange-100"
								}`}
						>
							<div>
								<h3 className={`font-semibold text-lg ${allAdvantagesAssigned() ? "text-green-900" : "text-orange-900"
									}`}>
									{allAdvantagesAssigned() ? "✓ Assign Starting Advantages" : "Assign Starting Advantages"}
								</h3>
								<p className={`mt-2 text-sm ${allAdvantagesAssigned() ? "text-green-700" : "text-orange-700"
									}`}>
									{allAdvantagesAssigned()
										? "All players have starting advantages assigned"
										: "Assign Tier 1 starting advantages to each player"}
								</p>
							</div>
							<div className={`ml-4 flex-shrink-0 ${allAdvantagesAssigned() ? "text-green-600" : "text-orange-600"
								}`}>
								<svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
								</svg>
							</div>
						</button>
					</div>
				)}

				{/* Start Season Button (Commissioner Only, during ADVANTAGE_SELECTION phase when all advantages assigned) */}
				{isCommissioner && season.currentPhase === "ADVANTAGE_SELECTION" && allAdvantagesAssigned() && (
					<div className="mb-8">
						<button
							onClick={() => setShowStartSeasonConfirm(true)}
							className="w-full rounded-lg border-2 border-blue-400 bg-blue-100 p-6 text-left transition hover:bg-blue-200 flex items-center justify-between"
						>
							<div>
								<h3 className="font-semibold text-lg text-blue-900">
									🚀 Start Season
								</h3>
								<p className="mt-2 text-sm text-blue-800">
									All advantages assigned. Click to enter the in-season challenge selection loop.
								</p>
							</div>
							<div className="text-blue-700 ml-4 flex-shrink-0">
								<svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
								</svg>
							</div>
						</button>
					</div>
				)}

				{/* Move to Presentation Phase Button (Commissioner Only, during PLAYLIST_SUBMISSION phase, when all submitted) */}
				{isCommissioner && season.currentPhase === "PLAYLIST_SUBMISSION" && allPlaylistsSubmitted() && (
					<div className="mb-8">
						<button
							onClick={() => setShowPresentationConfirm(true)}
							className="w-full rounded-lg border-2 border-purple-400 bg-purple-100 p-6 text-left transition hover:bg-purple-200 flex items-center justify-between"
						>
							<div>
								<h3 className="font-semibold text-lg text-purple-900">
									🎬 Move to Presentation Phase
								</h3>
								<p className="mt-2 text-sm text-purple-800">
									Lock all playlists and refresh from Spotify. Start the presentation.
								</p>
							</div>
							<div className="text-purple-700 ml-4 flex-shrink-0">
								<svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
								</svg>
							</div>
						</button>
					</div>
				)}

				{/* Move to Voting Phase Button (Commissioner Only, during PLAYLIST_PRESENTATION phase) */}
				{isCommissioner && season.currentPhase === "PLAYLIST_PRESENTATION" && (
					<div className="mb-8 rounded-lg border border-gray-200 bg-white p-6">
						<h2 className="mb-4 font-semibold text-xl">Voting Phase</h2>
						<div className="space-y-4">
							<div className="flex flex-col gap-2">
								<label htmlFor="revealMode" className="font-medium">
									Vote Visibility
								</label>
								<select
									id="revealMode"
									value={voteRevealMode}
									onChange={(e) => setVoteRevealMode(e.target.value as 'IMMEDIATE' | 'ON_REVEAL')}
									className="rounded border border-gray-300 px-3 py-2"
								>
									<option value="ON_REVEAL">Hide votes until reveal (default)</option>
									<option value="IMMEDIATE">Show votes immediately</option>
								</select>
								<p className="text-sm text-gray-600">
									{voteRevealMode === 'ON_REVEAL'
										? 'Votes will be hidden until you reveal each category'
										: 'Votes will be visible to all players as they are cast'}
								</p>
							</div>
							<button
								onClick={() => setShowVotingConfirm(true)}
								className="w-full rounded-lg border-2 border-blue-400 bg-blue-100 p-6 text-left transition hover:bg-blue-200 flex items-center justify-between"
							>
								<div>
									<h3 className="font-semibold text-lg text-blue-900">
										🗳️ Move to Voting Phase
									</h3>
									<p className="mt-2 text-sm text-blue-800">
										Start award-by-award voting. Presentations are optional.
									</p>
								</div>
								<div className="text-blue-700 ml-4 flex-shrink-0">
									<svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
									</svg>
								</div>
							</button>
						</div>
					</div>
				)}

				{/* Phase Management (Commissioner Only) */}
				{isCommissioner && (
					<div className="mb-8 rounded-lg border border-gray-200 bg-white p-6">
						<h2 className="mb-4 font-semibold text-xl">God Mode - Advance Phase</h2>
						<div className="space-y-4">
							<div className="flex flex-col gap-2">
								<label htmlFor="phase" className="font-medium">
									Select Phase
								</label>
								<select
									id="phase"
									value={selectedPhase}
									onChange={(e) => setSelectedPhase(e.target.value)}
									className="rounded border border-gray-300 px-3 py-2"
								>
									{SEASON_PHASES.map((phase) => (
										<option
											key={phase}
											value={phase}
											disabled={
												PHASE_ORDER[phase] <=
												PHASE_ORDER[season.currentPhase]
											}
										>
											{phase}
										</option>
									))}
								</select>
							</div>

							<Button
								onClick={handleAdvancePhaseClick}
								disabled={isAdvancing}
								variant="outline"
							>
								{isAdvancing ? "Advancing..." : "Advance Phase"}
							</Button>

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
						</div>
					</div>
				)}

				{/* Season Players */}
				<div className="mb-8 rounded-lg border border-gray-200 bg-white p-6">
					<h2 className="mb-4 font-semibold text-xl">Enrolled Players</h2>
					{seasonPlayers && seasonPlayers.length > 0 ? (
						<div className="overflow-x-auto">
							<table className="w-full">
								<thead>
									<tr className="border-b">
										<th className="px-4 py-2 text-left font-semibold">
											Draft Position
										</th>
										<th className="px-4 py-2 text-left font-semibold">
											Name
										</th>
										<th className="px-4 py-2 text-left font-semibold">
											Label Name
										</th>
										<th className="px-4 py-2 text-left font-semibold">
											Points
										</th>
										{isCommissioner && (
											<th className="px-4 py-2 text-left font-semibold">
												Actions
											</th>
										)}
									</tr>
								</thead>
								<tbody>
									{seasonPlayers.map((player: any) => (
										<tr
											key={player._id}
											className={`border-b hover:bg-gray-50 ${flashingRowId === player._id
												? "success-flash"
												: ""
												}`}
										>
											<td className="px-4 py-2">
												{player.draftPosition ?? "-"}
											</td>
											<td className="px-4 py-2">
												{player.user.displayName}
											</td>
											<td className="px-4 py-2">
												{editingLabelId === player._id ? (
													<form
														onSubmit={(e) =>
															handleFormSubmit(
																e,
																player._id
															)
														}
														className="flex gap-2"
													>
														<input
															type="text"
															value={editingLabelText}
															onChange={(e) =>
																setEditingLabelText(
																	e.target.value
																)
															}
															className="flex-1 rounded border border-gray-300 px-2 py-1"
															autoFocus
														/>
														<button
															type="submit"
															className="rounded bg-green-500 px-2 py-1 text-white text-sm hover:bg-green-600"
														>
															Save
														</button>
														<button
															type="button"
															onClick={
																handleCancelEdit
															}
															className="rounded bg-gray-500 px-2 py-1 text-white text-sm hover:bg-gray-600"
														>
															Cancel
														</button>
													</form>
												) : (
													player.labelName
												)}
											</td>
											<td className="px-4 py-2">
												{player.totalPoints}
											</td>
											{isCommissioner && !editingLabelId && (
												<td className="px-4 py-2">
													<button
														onClick={() =>
															startEditingLabel(
																player._id,
																player.labelName
															)
														}
														className="text-blue-500 hover:underline"
													>
														Edit
													</button>
												</td>
											)}
										</tr>
									))}
								</tbody>
							</table>
						</div>
					) : (
						<p className="text-gray-500">No players enrolled yet</p>
					)}
				</div>

				{/* Debug Panel (Commissioner Only) */}
				{isCommissioner && (
					<div className="mb-8 rounded-lg border-2 border-gray-300 bg-gray-50 p-6">
						<div className="flex items-center justify-between mb-4">
							<h2 className="font-semibold text-xl text-gray-900">🐛 Debug Data</h2>
							<Button
								onClick={() => setShowDebugData(!showDebugData)}
								variant="outline"
								size="sm"
							>
								{showDebugData ? 'Hide' : 'Show'} Debug Info
							</Button>
						</div>

						{showDebugData && (
							<DebugDataPanel seasonId={seasonId as Id<"seasons">} />
						)}
					</div>
				)}

				{/* Danger Zone (Commissioner Only) */}
				{isCommissioner && (
					<div className="mb-8 rounded-lg border-2 border-red-300 bg-red-50 p-6">
						<h2 className="mb-2 font-semibold text-xl text-red-900">⚠️ Danger Zone</h2>
						<p className="mb-4 text-sm text-red-800">
							These actions are irreversible. Use with caution.
						</p>

						{/* Go Back To Checkpoint Section */}
						<div className="rounded-lg bg-white p-4 border border-red-200 mb-4">
							<h3 className="font-semibold text-red-900 mb-3">📍 Go back to...</h3>
							<div className="space-y-3">
								<div>
									<label htmlFor="checkpoint" className="block text-sm font-medium text-red-900 mb-2">
										Select checkpoint to roll back to:
									</label>
									<select
										id="checkpoint"
										value={selectedCheckpoint}
										onChange={(e) => setSelectedCheckpoint(e.target.value)}
										className="w-full rounded border border-gray-300 px-3 py-2 text-sm bg-white"
									>
										<option value="">-- Select a checkpoint --</option>
										{season && getAvailableCheckpoints(season.currentPhase, season.currentWeek, season.status).map((checkpoint) => (
											<option key={checkpoint.id} value={checkpoint.id}>
												{checkpoint.title}
											</option>
										))}
									</select>
								</div>

								{selectedCheckpoint && season && (() => {
									const checkpoint = getAvailableCheckpoints(season.currentPhase, season.currentWeek, season.status).find(
										(cp) => cp.id === selectedCheckpoint
									);
									return checkpoint ? (
										<div className="rounded-lg bg-red-100 p-3 border border-red-300">
											<p className="text-sm font-semibold text-red-900 mb-2">Implications:</p>
											<ul className="text-sm text-red-800 space-y-1">
												{checkpoint.implications.map((implication, idx) => (
													<li key={idx} className="flex items-start gap-2">
														<span className="text-red-600 font-bold">•</span>
														<span>{implication}</span>
													</li>
												))}
											</ul>
										</div>
									) : null;
								})()}

								<Button
									onClick={() => setShowRollbackConfirm(true)}
									disabled={!selectedCheckpoint || isRollingBack}
									className="w-full bg-red-600 hover:bg-red-700 text-white"
								>
									{isRollingBack ? "Rolling back..." : "Confirm Rollback"}
								</Button>
							</div>
						</div>

						{/* Delete Season Section */}
						<div className="rounded-lg bg-white p-4 border border-red-200">
							<h3 className="font-semibold text-red-900 mb-3">🗑️ Delete Season</h3>
							<p className="text-sm text-red-800 mb-4">
								This will permanently delete this season and ALL associated data including drafts, rosters, playlists, votes, and events. This action cannot be undone.
							</p>
							<Button
								onClick={() => setShowDeleteSeasonConfirm(true)}
								disabled={isDeletingSeason}
								className="w-full bg-red-600 hover:bg-red-700 text-white"
							>
								{isDeletingSeason ? "Deleting..." : "Delete Season"}
							</Button>
						</div>

					</div>
				)}

				{/* Back Button */}
				<div>
					<Button
						onClick={() =>
							router.push(`/leagues/${season.leagueId}`)
						}
						variant="outline"
						className="text-gray-500"
					>
						Back to League
					</Button>
				</div>
			</main>

			{/* Phase Confirmation Dialog */}
			<Dialog open={showPhaseConfirm} onOpenChange={setShowPhaseConfirm}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Confirm Phase Change</DialogTitle>
						<DialogDescription>
							Are you sure you want to advance from{" "}
							<span className="font-medium text-foreground">
								{getPhaseLabel(season.currentPhase)}
							</span>{" "}
							to{" "}
							<span className="font-medium text-foreground">
								{getPhaseLabel(selectedPhase)}
							</span>
							?
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button
							onClick={() => setShowPhaseConfirm(false)}
							variant="outline"
						>
							Cancel
						</Button>
						<Button
							onClick={handleConfirmAdvancePhase}
							className="bg-blue-600 hover:bg-blue-700"
						>
							Confirm
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Draft Initiation Confirmation Dialog */}
			<Dialog open={showDraftConfirm} onOpenChange={setShowDraftConfirm}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Initiate Draft Phase?</DialogTitle>
						<DialogDescription>
							Here's what will happen when you confirm:
						</DialogDescription>
					</DialogHeader>

					<div className="space-y-3 py-4 text-sm">
						<div className="rounded-lg bg-blue-50 p-3 border border-blue-200">
							<p className="font-semibold text-blue-900 mb-2">Draft will begin immediately:</p>
							<ul className="text-blue-800 space-y-1 ml-4">
								<li>• Players will be locked into the draft order you set</li>
								<li>• The draft board will go live</li>
								<li>• Players can start picking categories and drafting artists</li>
								<li>• You cannot change the draft order once started</li>
							</ul>
						</div>

						<p className="text-gray-700">
							The first player in your draft order will make the first selection.
						</p>
					</div>

					<DialogFooter>
						<Button
							onClick={() => setShowDraftConfirm(false)}
							variant="outline"
							disabled={isInitiatingDraft}
						>
							Cancel
						</Button>
						<Button
							onClick={handleInitiateDraft}
							disabled={isInitiatingDraft}
							className="bg-green-600 hover:bg-green-700"
						>
							{isInitiatingDraft ? "Starting..." : "Initiate Draft"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Reset Draft Confirmation Dialog */}
			<Dialog open={showResetConfirm} onOpenChange={setShowResetConfirm}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle className="text-red-600">⚠️ Reset Draft?</DialogTitle>
						<DialogDescription>
							This action cannot be undone.
						</DialogDescription>
					</DialogHeader>

					<div className="space-y-3 py-4 text-sm">
						<div className="rounded-lg bg-red-50 p-3 border border-red-200">
							<p className="font-semibold text-red-900 mb-2">This will:</p>
							<ul className="text-red-800 space-y-1 ml-4">
								<li>• Erase ALL draft picks and prompt selections</li>
								<li>• Delete all roster entries for all players</li>
								<li>• Delete all drafted artists</li>
								<li>• Reset all prompts back to OPEN status</li>
								<li>• Preserve the existing draft order</li>
								<li>• Return the season to DRAFTING phase ready to restart</li>
							</ul>
						</div>

						<p className="font-semibold text-gray-900">
							Are you absolutely sure? This will erase all draft progress.
						</p>
					</div>

					<DialogFooter>
						<Button
							onClick={() => setShowResetConfirm(false)}
							variant="outline"
							disabled={isResettingDraft}
						>
							Cancel
						</Button>
						<Button
							onClick={handleResetDraft}
							disabled={isResettingDraft}
							className="bg-red-600 hover:bg-red-700"
						>
							{isResettingDraft ? "Resetting..." : "Yes, Reset Draft"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Start Season Confirmation Dialog */}
			<Dialog open={showStartSeasonConfirm} onOpenChange={setShowStartSeasonConfirm}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>🚀 Start Season?</DialogTitle>
						<DialogDescription>
							This will transition the season from pre-season to in-season gameplay.
						</DialogDescription>
					</DialogHeader>

					<div className="space-y-3 py-4 text-sm">
						<div className="rounded-lg bg-green-50 p-3 border border-green-200">
							<p className="font-semibold text-green-900 mb-2">This will:</p>
							<ul className="text-green-800 space-y-1 ml-4">
								<li>• Advance the season phase to IN_SEASON_CHALLENGE_SELECTION</li>
								<li>• Set the season status to IN_PROGRESS</li>
								<li>• Set Week 1 as the current week</li>
								<li>• Enable challenge selection for players</li>
								<li>• Begin the in-season loop</li>
							</ul>
						</div>

						<p className="font-semibold text-gray-900">
							Are you ready to begin the season? Players will start selecting challenges.
						</p>
					</div>

					<DialogFooter>
						<Button
							onClick={() => setShowStartSeasonConfirm(false)}
							variant="outline"
							disabled={isStartingSeason}
						>
							Cancel
						</Button>
						<Button
							onClick={handleStartSeason}
							disabled={isStartingSeason}
							className="bg-green-600 hover:bg-green-700"
						>
							{isStartingSeason ? "Starting..." : "Yes, Start Season"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Reset Challenge Selection Confirmation Dialog */}
			<Dialog open={showResetChallengeConfirm} onOpenChange={setShowResetChallengeConfirm}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle className="text-red-600">🔄 Reset Challenge Selection?</DialogTitle>
						<DialogDescription>
							This action cannot be undone.
						</DialogDescription>
					</DialogHeader>

					<div className="space-y-3 py-4 text-sm">
						<div className="rounded-lg bg-red-50 p-3 border border-red-200">
							<p className="font-semibold text-red-900 mb-2">This will:</p>
							<ul className="text-red-800 space-y-1 ml-4">
								<li>• Delete all challenge reveals for Week {season.currentWeek}</li>
								<li>• Delete the challenge selection for Week {season.currentWeek}</li>
								<li>• Reset the picker's reveal count to 0</li>
								<li>• Allow players to start the reveal/select process over</li>
							</ul>
						</div>

						<p className="font-semibold text-gray-900">
							Are you absolutely sure? This will erase all challenge selection progress for this week.
						</p>
					</div>

					<DialogFooter>
						<Button
							onClick={() => setShowResetChallengeConfirm(false)}
							variant="outline"
							disabled={isResettingChallenge}
						>
							Cancel
						</Button>
						<Button
							onClick={handleResetChallengeSelection}
							disabled={isResettingChallenge}
							className="bg-red-600 hover:bg-red-700"
						>
							{isResettingChallenge ? "Resetting..." : "Yes, Reset Challenge Selection"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Rollback Confirmation Dialog */}
			<Dialog open={showRollbackConfirm} onOpenChange={setShowRollbackConfirm}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle className="text-red-600">⚠️ Confirm Rollback?</DialogTitle>
						<DialogDescription>
							This action cannot be undone.
						</DialogDescription>
					</DialogHeader>

					{season && selectedCheckpoint && (() => {
						const checkpoint = getAvailableCheckpoints(season.currentPhase, season.currentWeek, season.status).find(
							(cp) => cp.id === selectedCheckpoint
						);
						return checkpoint ? (
							<div className="space-y-3 py-4 text-sm">
								<div>
									<p className="font-semibold text-gray-900 mb-2">You are about to roll back to:</p>
									<p className="text-lg font-bold text-red-700">{checkpoint.title}</p>
									<p className="text-gray-600 mt-1">{checkpoint.description}</p>
								</div>

								<div className="rounded-lg bg-red-50 p-3 border border-red-200">
									<p className="font-semibold text-red-900 mb-2">This will delete or reset:</p>
									<ul className="text-red-800 space-y-1 ml-4">
										{checkpoint.implications.map((implication, idx) => (
											<li key={idx}>• {implication}</li>
										))}
									</ul>
								</div>

								<p className="font-semibold text-gray-900">
									Are you absolutely sure? This will permanently erase all data after this checkpoint.
								</p>
							</div>
						) : null;
					})()}

					<DialogFooter>
						<Button
							onClick={() => setShowRollbackConfirm(false)}
							variant="outline"
							disabled={isRollingBack}
						>
							Cancel
						</Button>
						<Button
							onClick={handleRollbackToCheckpoint}
							disabled={isRollingBack}
							className="bg-red-600 hover:bg-red-700"
						>
							{isRollingBack ? "Rolling back..." : "Yes, Rollback to Checkpoint"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Start Presentation Phase Confirmation Dialog */}
			<Dialog open={showPresentationConfirm} onOpenChange={setShowPresentationConfirm}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>🎬 Start Presentation Phase?</DialogTitle>
						<DialogDescription>
							All playlists will be locked and refreshed from Spotify
						</DialogDescription>
					</DialogHeader>

					<div className="space-y-3 py-4 text-sm">
						<div className="rounded-lg bg-purple-50 p-3 border border-purple-200">
							<p className="font-semibold text-purple-900 mb-2">This will:</p>
							<ul className="text-purple-800 space-y-1 ml-4">
								<li>• Lock all player playlists submitted this week</li>
								<li>• Refresh each playlist from Spotify with latest track data</li>
								<li>• Advance the season to PLAYLIST_PRESENTATION phase</li>
								<li>• Initialize presentation state for song-by-song reveals</li>
								<li>• Allow you to select players to present their playlists</li>
							</ul>
						</div>

						<p className="font-semibold text-gray-900">
							You can then select which player presents first and proceed through the presentation.
						</p>
					</div>

					<DialogFooter>
						<Button
							onClick={() => setShowPresentationConfirm(false)}
							variant="outline"
							disabled={isStartingPresentation}
						>
							Cancel
						</Button>
						<Button
							onClick={handleStartPresentationPhase}
							disabled={isStartingPresentation}
							className="bg-purple-600 hover:bg-purple-700"
						>
							{isStartingPresentation ? "Starting..." : "Start Presentation Phase"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Move to Voting Phase Confirmation Dialog */}
			<Dialog open={showVotingConfirm} onOpenChange={setShowVotingConfirm}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>🗳️ Move to Voting Phase?</DialogTitle>
						<DialogDescription>
							Start award-by-award voting for this week
						</DialogDescription>
					</DialogHeader>

					<div className="space-y-3 py-4 text-sm">
						<div className="rounded-lg bg-blue-50 p-3 border border-blue-200">
							<p className="font-semibold text-blue-900 mb-2">This will:</p>
							<ul className="text-blue-800 space-y-1 ml-4">
								<li>• Advance the season to VOTING phase</li>
								<li>• Create a voting session with 7 award categories</li>
								<li>• Set vote visibility to: <strong>{voteRevealMode === 'IMMEDIATE' ? 'Immediate' : 'On Reveal'}</strong></li>
								<li>• Allow players to vote award-by-award</li>
								<li>• Presentations are optional - you can skip directly to voting</li>
							</ul>
						</div>

						<p className="font-semibold text-gray-900">
							Voting will proceed one award at a time, ending with the marquee category (3pt).
						</p>
					</div>

					<DialogFooter>
						<Button
							onClick={() => setShowVotingConfirm(false)}
							variant="outline"
							disabled={isAdvancingToVoting}
						>
							Cancel
						</Button>
						<Button
							onClick={handleAdvanceToVoting}
							disabled={isAdvancingToVoting}
							className="bg-blue-600 hover:bg-blue-700"
						>
							{isAdvancingToVoting ? "Starting..." : "Start Voting Phase"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Delete Season Confirmation Dialog */}
			<Dialog open={showDeleteSeasonConfirm} onOpenChange={setShowDeleteSeasonConfirm}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle className="text-red-600">🗑️ Delete Season?</DialogTitle>
						<DialogDescription>
							This action cannot be undone.
						</DialogDescription>
					</DialogHeader>

					<div className="space-y-3 py-4 text-sm">
						<div className="rounded-lg bg-red-50 p-3 border border-red-200">
							<p className="font-semibold text-red-900 mb-2">This will permanently delete:</p>
							<ul className="text-red-800 space-y-1 ml-4">
								<li>• The entire season record</li>
								<li>• All draft boards, prompts, and selections</li>
								<li>• All challenge boards and selections</li>
								<li>• All advantage boards</li>
								<li>• All player rosters and artists</li>
								<li>• All playlist submissions and tracks</li>
								<li>• All voting sessions and votes</li>
								<li>• All presentation states</li>
								<li>• All game events and history</li>
							</ul>
						</div>

						<p className="font-semibold text-gray-900">
							Are you absolutely sure? This will permanently erase all data for "{season?.name}".
						</p>
					</div>

					<DialogFooter>
						<Button
							onClick={() => setShowDeleteSeasonConfirm(false)}
							variant="outline"
							disabled={isDeletingSeason}
						>
							Cancel
						</Button>
						<Button
							onClick={handleDeleteSeason}
							disabled={isDeletingSeason}
							className="bg-red-600 hover:bg-red-700"
						>
							{isDeletingSeason ? "Deleting..." : "Yes, Delete Season"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}

