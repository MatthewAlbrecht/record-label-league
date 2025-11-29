"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "convex/_generated/api";
import type { Id } from "convex/_generated/dataModel";
import { Button } from "~/components/ui/button";
import { useAuth } from "~/lib/auth-context";
import { toast } from "sonner";

type Tier = 1 | 2 | 3;
type Placement = 1 | 2 | 3 | 4;

interface PlacementReward {
  placement: Placement;
  tier: Tier;
  count: number;
}

interface SweepReward {
  categoryPointValue: Tier;
  tier: Tier;
  count: number;
}

interface CooldownConfig {
  tier: Tier;
  weeksDelay: number;
}

const TIER_COLORS = {
  1: "bg-emerald-100 text-emerald-800 border-emerald-300",
  2: "bg-amber-100 text-amber-800 border-amber-300",
  3: "bg-purple-100 text-purple-800 border-purple-300",
};

const PLACEMENT_LABELS = {
  1: "🥇 1st Place",
  2: "🥈 2nd Place",
  3: "🥉 3rd Place",
  4: "4th Place",
};

export default function AdvantageSettingsPage() {
  const router = useRouter();
  const params = useParams();
  const seasonId = params.seasonId as string;
  const { isAuthenticated, user, isLoading: authLoading } = useAuth();

  const [isSaving, setIsSaving] = useState(false);

  // Form state
  const [placementRewards, setPlacementRewards] = useState<PlacementReward[]>([]);
  const [sweepRewards, setSweepRewards] = useState<SweepReward[]>([]);
  const [sweepsStack, setSweepsStack] = useState(false);
  const [maxSweepAdvantages, setMaxSweepAdvantages] = useState<number | undefined>();
  const [cooldownByTier, setCooldownByTier] = useState<CooldownConfig[]>([]);

  const season = useQuery(api.seasons.getSeason, {
    seasonId: seasonId as Id<"seasons">,
  });

  const settings = useQuery(api.advantages.getAdvantageDistributionSettings, {
    seasonId: seasonId as Id<"seasons">,
  });

  const saveSettingsMutation = useMutation(api.advantages.saveAdvantageDistributionSettings);

  // Initialize form state from settings
  useEffect(() => {
    if (settings) {
      setPlacementRewards(settings.placementRewards as PlacementReward[]);
      setSweepRewards(settings.sweepRewards as SweepReward[]);
      setSweepsStack(settings.sweepsStack);
      setMaxSweepAdvantages(settings.maxSweepAdvantagesPerWeek);
      setCooldownByTier(settings.cooldownByTier as CooldownConfig[]);
    }
  }, [settings]);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.replace("/login");
    }
  }, [isAuthenticated, authLoading, router]);

  const isCommissioner = season && season.league.commissioner.id === user?.id;

  // Helper to get count for a placement/tier combo
  const getPlacementRewardCount = (placement: Placement, tier: Tier): number => {
    const reward = placementRewards.find(
      (r) => r.placement === placement && r.tier === tier
    );
    return reward?.count ?? 0;
  };

  // Helper to update placement reward
  const updatePlacementReward = (placement: Placement, tier: Tier, count: number) => {
    const existing = placementRewards.find(
      (r) => r.placement === placement && r.tier === tier
    );
    
    if (count === 0) {
      // Remove if setting to 0
      setPlacementRewards(
        placementRewards.filter(
          (r) => !(r.placement === placement && r.tier === tier)
        )
      );
    } else if (existing) {
      // Update existing
      setPlacementRewards(
        placementRewards.map((r) =>
          r.placement === placement && r.tier === tier ? { ...r, count } : r
        )
      );
    } else {
      // Add new
      setPlacementRewards([...placementRewards, { placement, tier, count }]);
    }
  };

  // Helper to get sweep reward for a category point value
  const getSweepReward = (categoryPointValue: Tier): SweepReward | undefined => {
    return sweepRewards.find((r) => r.categoryPointValue === categoryPointValue);
  };

  // Helper to update sweep reward
  const updateSweepReward = (categoryPointValue: Tier, tier: Tier, count: number) => {
    const existing = sweepRewards.find((r) => r.categoryPointValue === categoryPointValue);
    
    if (existing) {
      setSweepRewards(
        sweepRewards.map((r) =>
          r.categoryPointValue === categoryPointValue ? { ...r, tier, count } : r
        )
      );
    } else {
      setSweepRewards([...sweepRewards, { categoryPointValue, tier, count }]);
    }
  };

  // Helper to get cooldown for a tier
  const getCooldownForTier = (tier: Tier): number => {
    const config = cooldownByTier.find((c) => c.tier === tier);
    return config?.weeksDelay ?? (tier === 1 ? 0 : 1);
  };

  // Helper to update cooldown
  const updateCooldown = (tier: Tier, weeksDelay: number) => {
    const existing = cooldownByTier.find((c) => c.tier === tier);
    
    if (existing) {
      setCooldownByTier(
        cooldownByTier.map((c) => (c.tier === tier ? { ...c, weeksDelay } : c))
      );
    } else {
      setCooldownByTier([...cooldownByTier, { tier, weeksDelay }]);
    }
  };

  const handleSave = async () => {
    if (!user) return;

    setIsSaving(true);
    try {
      // Ensure cooldown has all tiers
      const fullCooldown: CooldownConfig[] = [
        { tier: 1, weeksDelay: getCooldownForTier(1) },
        { tier: 2, weeksDelay: getCooldownForTier(2) },
        { tier: 3, weeksDelay: getCooldownForTier(3) },
      ];

      await saveSettingsMutation({
        seasonId: seasonId as Id<"seasons">,
        placementRewards,
        sweepRewards,
        sweepsStack,
        maxSweepAdvantagesPerWeek: sweepsStack ? maxSweepAdvantages : undefined,
        cooldownByTier: fullCooldown,
        requestingUserId: user.id,
      });
      toast.success("Advantage distribution settings saved!");
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to save settings";
      toast.error(errorMessage);
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetToDefaults = () => {
    setPlacementRewards([
      { placement: 2, tier: 1, count: 1 },
      { placement: 3, tier: 2, count: 1 },
    ]);
    setSweepRewards([
      { categoryPointValue: 1, tier: 1, count: 1 },
      { categoryPointValue: 2, tier: 2, count: 1 },
      { categoryPointValue: 3, tier: 3, count: 1 },
    ]);
    setSweepsStack(false);
    setMaxSweepAdvantages(undefined);
    setCooldownByTier([
      { tier: 1, weeksDelay: 0 },
      { tier: 2, weeksDelay: 1 },
      { tier: 3, weeksDelay: 1 },
    ]);
    toast.info("Reset to default settings (not saved yet)");
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
        <h1 className="font-semibold text-3xl">Advantage Distribution Settings</h1>
        <p className="text-gray-600 mt-2">
          Configure how advantages are awarded based on weekly placement and sweeps.
        </p>
        {settings?.isDefault && (
          <p className="text-amber-600 text-sm mt-1">
            ⚠️ Using default settings. Save to customize for this season.
          </p>
        )}
      </div>

      {/* Placement Rewards Section */}
      <div className="mb-8 rounded-lg border border-gray-200 bg-white p-6">
        <h2 className="mb-4 font-semibold text-xl">📊 Placement Rewards</h2>
        <p className="text-gray-600 text-sm mb-4">
          Configure how many advantages each placement receives. Players can earn multiple advantages of different tiers.
        </p>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b">
                <th className="px-4 py-2 text-left font-semibold">Placement</th>
                <th className="px-4 py-2 text-center font-semibold">
                  <span className={`inline-block px-2 py-1 rounded text-sm ${TIER_COLORS[1]}`}>
                    Tier 1
                  </span>
                </th>
                <th className="px-4 py-2 text-center font-semibold">
                  <span className={`inline-block px-2 py-1 rounded text-sm ${TIER_COLORS[2]}`}>
                    Tier 2
                  </span>
                </th>
                <th className="px-4 py-2 text-center font-semibold">
                  <span className={`inline-block px-2 py-1 rounded text-sm ${TIER_COLORS[3]}`}>
                    Tier 3
                  </span>
                </th>
              </tr>
            </thead>
            <tbody>
              {([1, 2, 3, 4] as Placement[]).map((placement) => (
                <tr key={placement} className="border-b hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">{PLACEMENT_LABELS[placement]}</td>
                  {([1, 2, 3] as Tier[]).map((tier) => (
                    <td key={tier} className="px-4 py-3 text-center">
                      <input
                        type="number"
                        min="0"
                        max="5"
                        value={getPlacementRewardCount(placement, tier)}
                        onChange={(e) =>
                          updatePlacementReward(placement, tier, parseInt(e.target.value) || 0)
                        }
                        className="w-16 rounded border border-gray-300 px-2 py-1 text-center"
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="text-gray-500 text-sm mt-4">
          <strong>Example:</strong> Setting 2nd Place → Tier 1 = 2 means the runner-up gets 2 random Tier 1 advantages each week.
        </p>
      </div>

      {/* Sweep Rewards Section */}
      <div className="mb-8 rounded-lg border border-gray-200 bg-white p-6">
        <h2 className="mb-4 font-semibold text-xl">🧹 Sweep Rewards</h2>
        <p className="text-gray-600 text-sm mb-4">
          A sweep occurs when a player receives all votes in a category. Configure rewards based on the category's point value.
        </p>

        <div className="overflow-x-auto mb-4">
          <table className="w-full">
            <thead>
              <tr className="border-b">
                <th className="px-4 py-2 text-left font-semibold">Category Type</th>
                <th className="px-4 py-2 text-center font-semibold">Reward Tier</th>
                <th className="px-4 py-2 text-center font-semibold">Count</th>
              </tr>
            </thead>
            <tbody>
              {([1, 2, 3] as Tier[]).map((categoryPointValue) => {
                const reward = getSweepReward(categoryPointValue);
                return (
                  <tr key={categoryPointValue} className="border-b hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium">{categoryPointValue}pt Category Sweep</td>
                    <td className="px-4 py-3 text-center">
                      <select
                        value={reward?.tier ?? categoryPointValue}
                        onChange={(e) =>
                          updateSweepReward(
                            categoryPointValue,
                            parseInt(e.target.value) as Tier,
                            reward?.count ?? 1
                          )
                        }
                        className="rounded border border-gray-300 px-2 py-1"
                      >
                        <option value={1}>Tier 1</option>
                        <option value={2}>Tier 2</option>
                        <option value={3}>Tier 3</option>
                      </select>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <input
                        type="number"
                        min="0"
                        max="3"
                        value={reward?.count ?? 1}
                        onChange={(e) =>
                          updateSweepReward(
                            categoryPointValue,
                            reward?.tier ?? categoryPointValue,
                            parseInt(e.target.value) || 0
                          )
                        }
                        className="w-16 rounded border border-gray-300 px-2 py-1 text-center"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="space-y-4 border-t pt-4">
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="sweepsStack"
              checked={sweepsStack}
              onChange={(e) => setSweepsStack(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300"
            />
            <label htmlFor="sweepsStack" className="font-medium">
              Sweeps Stack
            </label>
            <span className="text-gray-500 text-sm">
              (If enabled, a player can earn multiple sweep advantages if they sweep multiple categories)
            </span>
          </div>

          {sweepsStack && (
            <div className="flex items-center gap-3 ml-7">
              <label htmlFor="maxSweeps" className="text-sm font-medium">
                Max sweep advantages per week:
              </label>
              <input
                type="number"
                id="maxSweeps"
                min="1"
                max="7"
                value={maxSweepAdvantages ?? ""}
                onChange={(e) =>
                  setMaxSweepAdvantages(e.target.value ? parseInt(e.target.value) : undefined)
                }
                placeholder="No limit"
                className="w-24 rounded border border-gray-300 px-2 py-1"
              />
              <span className="text-gray-500 text-sm">(Leave blank for no limit)</span>
            </div>
          )}
        </div>
      </div>

      {/* Cooldown Section */}
      <div className="mb-8 rounded-lg border border-gray-200 bg-white p-6">
        <h2 className="mb-4 font-semibold text-xl">⏱️ Cooldown Settings</h2>
        <p className="text-gray-600 text-sm mb-4">
          Set how many weeks must pass before an advantage can be used after being earned.
          A value of 0 means usable immediately.
        </p>

        <div className="space-y-3">
          {([1, 2, 3] as Tier[]).map((tier) => (
            <div key={tier} className="flex items-center gap-4">
              <span className={`inline-block px-3 py-1 rounded font-medium w-24 text-center ${TIER_COLORS[tier]}`}>
                Tier {tier}
              </span>
              <input
                type="number"
                min="0"
                max="4"
                value={getCooldownForTier(tier)}
                onChange={(e) => updateCooldown(tier, parseInt(e.target.value) || 0)}
                className="w-20 rounded border border-gray-300 px-2 py-1 text-center"
              />
              <span className="text-gray-600 text-sm">
                {getCooldownForTier(tier) === 0
                  ? "Usable immediately"
                  : getCooldownForTier(tier) === 1
                  ? "Usable next week"
                  : `Usable in ${getCooldownForTier(tier)} weeks`}
              </span>
            </div>
          ))}
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

