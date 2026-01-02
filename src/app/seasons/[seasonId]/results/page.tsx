'use client';

import { useParams, useRouter } from 'next/navigation';
import { useQuery } from 'convex/react';
import { api } from 'convex/_generated/api';
import type { Id } from 'convex/_generated/dataModel';
import { Loader2 } from 'lucide-react';
import { useEffect } from 'react';

export default function ResultsRedirectPage() {
  const params = useParams();
  const router = useRouter();
  const seasonId = (params?.seasonId as string) || '';

  const latestWeek = useQuery(api.voting.getLatestWeekWithResults, {
    seasonId: seasonId as Id<'seasons'>,
  });

  const season = useQuery(api.seasons.getSeason, {
    seasonId: seasonId as Id<'seasons'>,
  });

  useEffect(() => {
    if (latestWeek !== undefined && season) {
      if (latestWeek !== null) {
        router.replace(`/seasons/${seasonId}/results/${latestWeek}`);
      }
    }
  }, [latestWeek, season, seasonId, router]);

  if (latestWeek === null) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-500 mb-4">No results available yet.</p>
          <button
            onClick={() => router.back()}
            className="text-blue-600 hover:underline"
          >
            Go back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
    </div>
  );
}









