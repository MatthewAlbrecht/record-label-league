"use client";

import { useParams, useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "convex/_generated/api";
import type { Id } from "convex/_generated/dataModel";
import { ArrowLeft, Archive } from "lucide-react";
import { PoolDisplay } from "~/components/pool-display";

export default function PoolPage() {
  const params = useParams();
  const router = useRouter();
  const seasonId = (params?.seasonId as string) || "";

  const season = useQuery(api.seasons.get, {
    seasonId: seasonId as Id<"seasons">,
  });

  const poolArtists = useQuery(api.pool.getPoolArtists, {
    seasonId: seasonId as Id<"seasons">,
  });

  const poolCount = useQuery(api.pool.getPoolCount, {
    seasonId: seasonId as Id<"seasons">,
  });

  const rosterEvolutionSettings = useQuery(
    api.rosterEvolutionSettings.getRosterEvolutionSettings,
    { seasonId: seasonId as Id<"seasons"> }
  );

  // Determine if current week is Chaos Week
  const currentWeek = season?.currentWeek ?? 1;
  const weekTypeEntry = rosterEvolutionSettings?.weekTypes.find(
    (w) => w.weekNumber === currentWeek
  );
  const isChaosWeek = weekTypeEntry?.type === "CHAOS";

  // Get chaos-categorized pool if needed
  const chaosPoolData = useQuery(
    api.pool.getPoolArtistsForChaos,
    isChaosWeek
      ? {
          seasonId: seasonId as Id<"seasons">,
          currentWeek,
        }
      : "skip"
  );

  if (!poolArtists || poolCount === undefined) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-gray-500">Loading pool...</p>
      </div>
    );
  }

  // For Chaos Week, use categorized data; otherwise use regular pool data
  const displayArtists = isChaosWeek && chaosPoolData
    ? [...chaosPoolData.oldPool, ...chaosPoolData.newPool]
    : poolArtists;

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => router.back()}
            className="p-1.5 hover:bg-gray-200 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Archive className="w-6 h-6 text-indigo-600" />
              The Pool
            </h1>
            <p className="text-gray-500 text-sm mt-0.5">
              Available artists from cut rosters
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="bg-indigo-100 text-indigo-700 px-3 py-1 rounded-full text-sm font-medium">
              {poolCount} artist{poolCount !== 1 ? "s" : ""} available
            </span>
            {isChaosWeek && (
              <span className="bg-orange-100 text-orange-700 px-3 py-1 rounded-full text-sm font-medium">
                Chaos Week
              </span>
            )}
          </div>
        </div>

        {/* Chaos Week Info Banner */}
        {isChaosWeek && chaosPoolData && (
          <div className="mb-6 p-4 rounded-lg bg-orange-50 border border-orange-200">
            <h3 className="font-semibold text-orange-800 mb-1">
              Chaos Week Pool Status
            </h3>
            <p className="text-sm text-orange-700">
              Old Pool artists ({chaosPoolData.oldPool.length}) will be banished
              after the redraft. New Pool artists ({chaosPoolData.newPool.length})
              were cut this week and remain draftable.
            </p>
          </div>
        )}

        {/* Pool Display */}
        <PoolDisplay
          artists={displayArtists}
          showChaosCategories={isChaosWeek && !!chaosPoolData}
          emptyMessage="No artists in the pool yet"
        />

        {/* Banished Section Link (if pool has history) */}
        <div className="mt-8 pt-6 border-t border-gray-200">
          <button
            onClick={() => router.push(`/seasons/${seasonId}/pool/banished`)}
            className="text-sm text-gray-500 hover:text-gray-700 transition-colors flex items-center gap-1"
          >
            <span>View banished artists →</span>
          </button>
        </div>
      </div>
    </div>
  );
}

