"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "convex/_generated/api";
import type { Id } from "convex/_generated/dataModel";
import { Button } from "~/components/ui/button";
import { useAuth } from "~/lib/auth-context";
import { toast } from "sonner";

type WeekType = "GROWTH" | "CHAOS" | "SKIP";
type Tier = 1 | 2 | 3;

interface WeekTypeConfig {
  weekNumber: number;
  type: WeekType;
}

interface GrowthWeekConfig {
  selfCutCount: number;
  redraftCount: number;
}

interface ChaosWeekConfig {
  baseProtectionCount: number;
  firstPlaceProtectionReduction: number;
  opponentCutsPerPlayer: number;
  redraftTargetRosterSize: number;
  includesPoolDraft: boolean;
  poolDraftCount: number;
  banishOldPool: boolean;
}

interface ChaosAdvantageDraftConfig {
  enabled: boolean;
  advantageCount: number;
  tier: Tier;
}

const WEEK_TYPE_COLORS = {
  GROWTH: "bg-green-100 text-green-800 border-green-300",
  CHAOS: "bg-red-100 text-red-800 border-red-300",
  SKIP: "bg-gray-100 text-gray-800 border-gray-300",
};

const WEEK_TYPE_LABELS = {
  GROWTH: "🌱 Growth",
  CHAOS: "💥 Chaos",
  SKIP: "⏭️ Skip",
};

export default function RosterEvolutionSettingsPage() {
  const router = useRouter();
  const params = useParams();
  const seasonId = params.seasonId as string;
  const { isAuthenticated, user, isLoading: authLoading } = useAuth();

  const [isSaving, setIsSaving] = useState(false);
  const [totalWeeks, setTotalWeeks] = useState(8);

  // Form state
  const [weekTypes, setWeekTypes] = useState<WeekTypeConfig[]>([]);
  const [growthWeek, setGrowthWeek] = useState<GrowthWeekConfig>({
    selfCutCount: 1,
    redraftCount: 1,
  });
  const [poolDraftWeeks, setPoolDraftWeeks] = useState<number[]>([]);
  const [poolDraftCount, setPoolDraftCount] = useState(1);
  const [chaosWeek, setChaosWeek] = useState<ChaosWeekConfig>({
    baseProtectionCount: 3,
    firstPlaceProtectionReduction: 1,
    opponentCutsPerPlayer: 1,
    redraftTargetRosterSize: 8,
    includesPoolDraft: true,
    poolDraftCount: 1,
    banishOldPool: true,
  });
  const [chaosAdvantageDraft, setChaosAdvantageDraft] = useState<ChaosAdvantageDraftConfig>({
    enabled: true,
    advantageCount: 5,
    tier: 3,
  });

  const season = useQuery(api.seasons.getSeason, {
    seasonId: seasonId as Id<"seasons">,
  });

  const settings = useQuery(api.rosterEvolutionSettings.getRosterEvolutionSettings, {
    seasonId: seasonId as Id<"seasons">,
  });

  const saveSettingsMutation = useMutation(api.rosterEvolutionSettings.saveRosterEvolutionSettings);
  const resetToDefaultsMutation = useMutation(api.rosterEvolutionSettings.resetToDefaults);

  // Initialize form state from settings
  useEffect(() => {
    if (settings) {
      setWeekTypes(settings.weekTypes as WeekTypeConfig[]);
      setGrowthWeek(settings.growthWeek);
      setPoolDraftWeeks(settings.poolDraftWeeks);
      setPoolDraftCount(settings.poolDraftCount);
      setChaosWeek(settings.chaosWeek);
      setChaosAdvantageDraft(settings.chaosAdvantageDraft as ChaosAdvantageDraftConfig);
      setTotalWeeks(settings.weekTypes.length);
    }
  }, [settings]);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.replace("/login");
    }
  }, [isAuthenticated, authLoading, router]);

  const isCommissioner = season && season.league.commissioner.id === user?.id;

  // Update week type for a specific week
  const updateWeekType = (weekNumber: number, type: WeekType) => {
    setWeekTypes(
      weekTypes.map((w) => (w.weekNumber === weekNumber ? { ...w, type } : w))
    );
  };

  // Toggle Pool Draft for a specific week
  const togglePoolDraftWeek = (weekNumber: number) => {
    if (poolDraftWeeks.includes(weekNumber)) {
      setPoolDraftWeeks(poolDraftWeeks.filter((w) => w !== weekNumber));
    } else {
      setPoolDraftWeeks([...poolDraftWeeks, weekNumber].sort((a, b) => a - b));
    }
  };

  // Add a week
  const addWeek = () => {
    const newWeekNumber = totalWeeks + 1;
    setTotalWeeks(newWeekNumber);
    setWeekTypes([
      ...weekTypes,
      { weekNumber: newWeekNumber, type: newWeekNumber % 4 === 0 ? "CHAOS" : "GROWTH" },
    ]);
  };

  // Remove last week
  const removeWeek = () => {
    if (totalWeeks <= 4) return; // Minimum 4 weeks
    setTotalWeeks(totalWeeks - 1);
    setWeekTypes(weekTypes.filter((w) => w.weekNumber <= totalWeeks - 1));
    setPoolDraftWeeks(poolDraftWeeks.filter((w) => w <= totalWeeks - 1));
  };

  const handleSave = async () => {
    if (!user) return;

    setIsSaving(true);
    try {
      await saveSettingsMutation({
        seasonId: seasonId as Id<"seasons">,
        weekTypes,
        growthWeek,
        poolDraftWeeks,
        poolDraftCount,
        chaosWeek,
        chaosAdvantageDraft,
        requestingUserId: user.id,
      });
      toast.success("Roster evolution settings saved!");
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to save settings";
      toast.error(errorMessage);
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetToDefaults = async () => {
    if (!user) return;

    try {
      await resetToDefaultsMutation({
        seasonId: seasonId as Id<"seasons">,
        requestingUserId: user.id,
        totalWeeks,
      });
      toast.success("Settings reset to defaults!");
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to reset settings";
      toast.error(errorMessage);
    }
  };

  if (authLoading || !isAuthenticated || !user) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-10">
        <p>Loading...</p>
      </main>
    );
  }

  if (season === undefined || settings === undefined) {
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
        <Button onClick={() => router.push("/dashboard")}>Back to Dashboard</Button>
      </main>
    );
  }

  if (!isCommissioner) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-10">
        <p className="text-red-500">Only the commissioner can access this page.</p>
        <Button onClick={() => router.push(`/seasons/${seasonId}`)}>
          Back to Season
        </Button>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <div className="mb-6">
        <button
          onClick={() => router.push(`/seasons/${seasonId}/admin`)}
          className="text-sm text-blue-600 hover:text-blue-800 hover:underline mb-2 block"
        >
          ← Back to Admin
        </button>
        <h1 className="font-semibold text-3xl">Roster Evolution Settings</h1>
        <p className="text-gray-600 mt-2">
          Configure how rosters change throughout the season: Growth Week cuts/drafts, Chaos Week rules, and Pool Drafts.
        </p>
        {settings?.isDefault && (
          <p className="text-amber-600 text-sm mt-1">
            ⚠️ Using default settings. Save to customize for this season.
          </p>
        )}
      </div>

      {/* Week Type Configuration */}
      <div className="mb-8 rounded-lg border border-gray-200 bg-white p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-semibold text-xl">📅 Week Type Configuration</h2>
            <p className="text-gray-600 text-sm mt-1">
              Define which weeks are Growth (1-in/1-out), Chaos (major shakeup), or Skip (no roster changes).
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={removeWeek} variant="outline" size="sm" disabled={totalWeeks <= 4}>
              − Week
            </Button>
            <Button onClick={addWeek} variant="outline" size="sm">
              + Week
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {weekTypes.map((week) => (
            <div
              key={week.weekNumber}
              className={`rounded-lg border-2 p-3 ${WEEK_TYPE_COLORS[week.type]}`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="font-semibold">Week {week.weekNumber}</span>
                <span className="text-xs">{WEEK_TYPE_LABELS[week.type]}</span>
              </div>
              <select
                value={week.type}
                onChange={(e) => updateWeekType(week.weekNumber, e.target.value as WeekType)}
                className="w-full rounded border border-gray-300 px-2 py-1 text-sm bg-white"
              >
                <option value="GROWTH">Growth</option>
                <option value="CHAOS">Chaos</option>
                <option value="SKIP">Skip</option>
              </select>
            </div>
          ))}
        </div>

        <div className="mt-4 text-sm text-gray-600">
          <strong>Summary:</strong>{" "}
          {weekTypes.filter((w) => w.type === "GROWTH").length} Growth,{" "}
          {weekTypes.filter((w) => w.type === "CHAOS").length} Chaos,{" "}
          {weekTypes.filter((w) => w.type === "SKIP").length} Skip
        </div>
      </div>

      {/* Growth Week Settings */}
      <div className="mb-8 rounded-lg border border-gray-200 bg-white p-6">
        <h2 className="mb-4 font-semibold text-xl">🌱 Growth Week Settings</h2>
        <p className="text-gray-600 text-sm mb-4">
          During Growth Weeks, each player cuts artists from their roster and then drafts replacements.
        </p>

        <div className="grid grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium mb-2">
              Self-Cut Count
            </label>
            <input
              type="number"
              min="0"
              max="5"
              value={growthWeek.selfCutCount}
              onChange={(e) =>
                setGrowthWeek({ ...growthWeek, selfCutCount: parseInt(e.target.value) || 0 })
              }
              className="w-24 rounded border border-gray-300 px-3 py-2 text-center"
            />
            <p className="text-xs text-gray-500 mt-1">
              Artists each player must cut
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">
              Redraft Count
            </label>
            <input
              type="number"
              min="0"
              max="5"
              value={growthWeek.redraftCount}
              onChange={(e) =>
                setGrowthWeek({ ...growthWeek, redraftCount: parseInt(e.target.value) || 0 })
              }
              className="w-24 rounded border border-gray-300 px-3 py-2 text-center"
            />
            <p className="text-xs text-gray-500 mt-1">
              New artists each player drafts
            </p>
          </div>
        </div>
      </div>

      {/* Pool Draft Settings */}
      <div className="mb-8 rounded-lg border border-gray-200 bg-white p-6">
        <h2 className="mb-4 font-semibold text-xl">🎱 Pool Draft Settings</h2>
        <p className="text-gray-600 text-sm mb-4">
          Pool Drafts let players pick artists from the shared pool of previously cut artists.
        </p>

        <div className="mb-4">
          <label className="block text-sm font-medium mb-2">
            Pool Draft Weeks (select Growth Weeks that include Pool Draft)
          </label>
          <div className="flex flex-wrap gap-2">
            {weekTypes
              .filter((w) => w.type === "GROWTH")
              .map((week) => (
                <button
                  key={week.weekNumber}
                  onClick={() => togglePoolDraftWeek(week.weekNumber)}
                  className={`px-3 py-1 rounded-full text-sm border-2 transition ${
                    poolDraftWeeks.includes(week.weekNumber)
                      ? "bg-blue-100 border-blue-400 text-blue-800"
                      : "bg-gray-50 border-gray-300 text-gray-600"
                  }`}
                >
                  Week {week.weekNumber} {poolDraftWeeks.includes(week.weekNumber) && "✓"}
                </button>
              ))}
          </div>
          {weekTypes.filter((w) => w.type === "GROWTH").length === 0 && (
            <p className="text-gray-500 text-sm italic">No Growth Weeks configured.</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">
            Pool Draft Picks per Player
          </label>
          <input
            type="number"
            min="0"
            max="5"
            value={poolDraftCount}
            onChange={(e) => setPoolDraftCount(parseInt(e.target.value) || 0)}
            className="w-24 rounded border border-gray-300 px-3 py-2 text-center"
          />
        </div>
      </div>

      {/* Chaos Week Settings */}
      <div className="mb-8 rounded-lg border border-gray-200 bg-white p-6">
        <h2 className="mb-4 font-semibold text-xl">💥 Chaos Week Settings</h2>
        <p className="text-gray-600 text-sm mb-4">
          Chaos Weeks are major roster shakeups with protection, opponent cuts, and large redrafts.
        </p>

        <div className="grid grid-cols-2 gap-6 mb-6">
          <div>
            <label className="block text-sm font-medium mb-2">
              Base Protection Count
            </label>
            <input
              type="number"
              min="0"
              max="10"
              value={chaosWeek.baseProtectionCount}
              onChange={(e) =>
                setChaosWeek({ ...chaosWeek, baseProtectionCount: parseInt(e.target.value) || 0 })
              }
              className="w-24 rounded border border-gray-300 px-3 py-2 text-center"
            />
            <p className="text-xs text-gray-500 mt-1">
              Artists each player can protect
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">
              1st Place Protection Reduction
            </label>
            <input
              type="number"
              min="0"
              max="5"
              value={chaosWeek.firstPlaceProtectionReduction}
              onChange={(e) =>
                setChaosWeek({
                  ...chaosWeek,
                  firstPlaceProtectionReduction: parseInt(e.target.value) || 0,
                })
              }
              className="w-24 rounded border border-gray-300 px-3 py-2 text-center"
            />
            <p className="text-xs text-gray-500 mt-1">
              Fewer protections for standings leader
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">
              Opponent Cuts per Player
            </label>
            <input
              type="number"
              min="0"
              max="5"
              value={chaosWeek.opponentCutsPerPlayer}
              onChange={(e) =>
                setChaosWeek({
                  ...chaosWeek,
                  opponentCutsPerPlayer: parseInt(e.target.value) || 0,
                })
              }
              className="w-24 rounded border border-gray-300 px-3 py-2 text-center"
            />
            <p className="text-xs text-gray-500 mt-1">
              Artists cut from each opponent
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">
              Redraft Target Roster Size
            </label>
            <input
              type="number"
              min="4"
              max="15"
              value={chaosWeek.redraftTargetRosterSize}
              onChange={(e) =>
                setChaosWeek({
                  ...chaosWeek,
                  redraftTargetRosterSize: parseInt(e.target.value) || 8,
                })
              }
              className="w-24 rounded border border-gray-300 px-3 py-2 text-center"
            />
            <p className="text-xs text-gray-500 mt-1">
              Roster size after Chaos redraft
            </p>
          </div>
        </div>

        <div className="space-y-4 border-t pt-4">
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="chaosPoolDraft"
              checked={chaosWeek.includesPoolDraft}
              onChange={(e) =>
                setChaosWeek({ ...chaosWeek, includesPoolDraft: e.target.checked })
              }
              className="h-4 w-4 rounded border-gray-300"
            />
            <label htmlFor="chaosPoolDraft" className="font-medium">
              Include Pool Draft
            </label>
            {chaosWeek.includesPoolDraft && (
              <div className="flex items-center gap-2 ml-4">
                <label className="text-sm">Picks:</label>
                <input
                  type="number"
                  min="0"
                  max="5"
                  value={chaosWeek.poolDraftCount}
                  onChange={(e) =>
                    setChaosWeek({
                      ...chaosWeek,
                      poolDraftCount: parseInt(e.target.value) || 0,
                    })
                  }
                  className="w-16 rounded border border-gray-300 px-2 py-1 text-center text-sm"
                />
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="banishOldPool"
              checked={chaosWeek.banishOldPool}
              onChange={(e) =>
                setChaosWeek({ ...chaosWeek, banishOldPool: e.target.checked })
              }
              className="h-4 w-4 rounded border-gray-300"
            />
            <label htmlFor="banishOldPool" className="font-medium">
              Banish Old Pool Artists
            </label>
            <span className="text-gray-500 text-sm">
              (Permanently remove "stale" artists from the Pool after Chaos Week)
            </span>
          </div>
        </div>
      </div>

      {/* Chaos Advantage Draft Settings */}
      <div className="mb-8 rounded-lg border border-gray-200 bg-white p-6">
        <h2 className="mb-4 font-semibold text-xl">🎁 Chaos Advantage Draft</h2>
        <p className="text-gray-600 text-sm mb-4">
          After Chaos Week cuts, players may draft advantages in reverse standings order.
        </p>

        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="chaosAdvEnabled"
              checked={chaosAdvantageDraft.enabled}
              onChange={(e) =>
                setChaosAdvantageDraft({ ...chaosAdvantageDraft, enabled: e.target.checked })
              }
              className="h-4 w-4 rounded border-gray-300"
            />
            <label htmlFor="chaosAdvEnabled" className="font-medium">
              Enable Chaos Advantage Draft
            </label>
          </div>

          {chaosAdvantageDraft.enabled && (
            <div className="flex items-center gap-6 ml-7">
              <div>
                <label className="block text-sm font-medium mb-1">Advantage Count</label>
                <input
                  type="number"
                  min="1"
                  max="10"
                  value={chaosAdvantageDraft.advantageCount}
                  onChange={(e) =>
                    setChaosAdvantageDraft({
                      ...chaosAdvantageDraft,
                      advantageCount: parseInt(e.target.value) || 5,
                    })
                  }
                  className="w-20 rounded border border-gray-300 px-2 py-1 text-center"
                />
                <p className="text-xs text-gray-500 mt-1">Total available</p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Advantage Tier</label>
                <select
                  value={chaosAdvantageDraft.tier}
                  onChange={(e) =>
                    setChaosAdvantageDraft({
                      ...chaosAdvantageDraft,
                      tier: parseInt(e.target.value) as Tier,
                    })
                  }
                  className="rounded border border-gray-300 px-3 py-1"
                >
                  <option value={1}>Tier 1</option>
                  <option value={2}>Tier 2</option>
                  <option value={3}>Tier 3</option>
                </select>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-4">
        <Button onClick={handleSave} disabled={isSaving} className="bg-blue-600 hover:bg-blue-700">
          {isSaving ? "Saving..." : "Save Settings"}
        </Button>
        <Button onClick={handleResetToDefaults} variant="outline">
          Reset to Defaults
        </Button>
        <Button
          onClick={() => router.push(`/seasons/${seasonId}/admin`)}
          variant="outline"
          className="text-gray-500"
        >
          Cancel
        </Button>
      </div>
    </main>
  );
}

