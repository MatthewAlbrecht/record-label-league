"use client";

import type { Id } from "convex/_generated/dataModel";

interface PoolArtist {
  _id: Id<"pool_entries">;
  artistId: Id<"artists">;
  enteredPoolWeek: number;
  enteredVia: "SELF_CUT" | "CHAOS_CUT" | "OPPONENT_CUT";
  artist: {
    _id: Id<"artists">;
    name: string;
  } | null;
  cutByPlayer: {
    _id: Id<"season_players">;
    labelName: string;
  } | null;
  cutFromPlayer: {
    _id: Id<"season_players">;
    labelName: string;
  } | null;
  poolCategory?: "OLD" | "NEW";
}

interface PoolDisplayProps {
  artists: PoolArtist[];
  showChaosCategories?: boolean;
  emptyMessage?: string;
  onSelect?: (artistId: Id<"artists">) => void;
  selectedArtistId?: Id<"artists"> | null;
  selectable?: boolean;
}

function getCutReasonLabel(reason: "SELF_CUT" | "CHAOS_CUT" | "OPPONENT_CUT"): string {
  switch (reason) {
    case "SELF_CUT":
      return "Self-cut";
    case "CHAOS_CUT":
      return "Chaos cut";
    case "OPPONENT_CUT":
      return "Opponent cut";
    default:
      return "Cut";
  }
}

function PoolArtistCard({
  artist,
  onSelect,
  isSelected,
  selectable,
}: {
  artist: PoolArtist;
  onSelect?: (artistId: Id<"artists">) => void;
  isSelected: boolean;
  selectable: boolean;
}) {
  const handleClick = () => {
    if (selectable && onSelect && artist.artist) {
      onSelect(artist.artist._id);
    }
  };

  return (
    <div
      onClick={handleClick}
      className={`
        p-4 rounded-lg border-2 transition-all
        ${selectable ? "cursor-pointer hover:border-indigo-400 hover:bg-indigo-50" : ""}
        ${isSelected ? "border-indigo-600 bg-indigo-50" : "border-gray-200 bg-white"}
        ${artist.poolCategory === "OLD" ? "opacity-70" : ""}
      `}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <h4 className="font-semibold text-gray-900 truncate">
            {artist.artist?.name ?? "Unknown Artist"}
          </h4>
          <div className="mt-1 space-y-0.5">
            {artist.cutFromPlayer && (
              <p className="text-sm text-gray-600">
                From <span className="font-medium">{artist.cutFromPlayer.labelName}</span>
              </p>
            )}
            {artist.cutByPlayer && artist.cutByPlayer._id !== artist.cutFromPlayer?._id && (
              <p className="text-sm text-gray-500">
                Cut by {artist.cutByPlayer.labelName}
              </p>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span
            className={`
              text-xs px-2 py-0.5 rounded-full font-medium
              ${artist.enteredVia === "SELF_CUT" ? "bg-blue-100 text-blue-700" : ""}
              ${artist.enteredVia === "OPPONENT_CUT" ? "bg-red-100 text-red-700" : ""}
              ${artist.enteredVia === "CHAOS_CUT" ? "bg-orange-100 text-orange-700" : ""}
            `}
          >
            {getCutReasonLabel(artist.enteredVia)}
          </span>
          <span className="text-xs text-gray-400">
            Week {artist.enteredPoolWeek}
          </span>
        </div>
      </div>
    </div>
  );
}

export function PoolDisplay({
  artists,
  showChaosCategories = false,
  emptyMessage = "Pool is empty",
  onSelect,
  selectedArtistId,
  selectable = false,
}: PoolDisplayProps) {
  if (artists.length === 0) {
    return (
      <div className="text-center py-12 px-4 rounded-lg border-2 border-dashed border-gray-200 bg-gray-50">
        <div className="text-4xl mb-2">🎵</div>
        <p className="text-gray-500 font-medium">{emptyMessage}</p>
        <p className="text-sm text-gray-400 mt-1">
          Cut artists will appear here
        </p>
      </div>
    );
  }

  if (showChaosCategories) {
    const oldPool = artists.filter((a) => a.poolCategory === "OLD");
    const newPool = artists.filter((a) => a.poolCategory === "NEW");

    return (
      <div className="space-y-6">
        {oldPool.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <h3 className="font-semibold text-orange-700">Old Pool</h3>
              <span className="text-xs bg-orange-100 text-orange-600 px-2 py-0.5 rounded-full">
                {oldPool.length} artist{oldPool.length !== 1 ? "s" : ""}
              </span>
              <span className="text-xs text-orange-500 ml-2">
                Will be banished after Chaos Week
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {oldPool.map((artist) => (
                <PoolArtistCard
                  key={artist._id}
                  artist={artist}
                  onSelect={onSelect}
                  isSelected={selectedArtistId === artist.artist?._id}
                  selectable={selectable}
                />
              ))}
            </div>
          </div>
        )}

        {newPool.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <h3 className="font-semibold text-green-700">New Pool</h3>
              <span className="text-xs bg-green-100 text-green-600 px-2 py-0.5 rounded-full">
                {newPool.length} artist{newPool.length !== 1 ? "s" : ""}
              </span>
              <span className="text-xs text-green-500 ml-2">
                From this week&apos;s cuts
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {newPool.map((artist) => (
                <PoolArtistCard
                  key={artist._id}
                  artist={artist}
                  onSelect={onSelect}
                  isSelected={selectedArtistId === artist.artist?._id}
                  selectable={selectable}
                />
              ))}
            </div>
          </div>
        )}

        {oldPool.length === 0 && newPool.length === 0 && (
          <div className="text-center py-12 px-4 rounded-lg border-2 border-dashed border-gray-200 bg-gray-50">
            <p className="text-gray-500">{emptyMessage}</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {artists.map((artist) => (
        <PoolArtistCard
          key={artist._id}
          artist={artist}
          onSelect={onSelect}
          isSelected={selectedArtistId === artist.artist?._id}
          selectable={selectable}
        />
      ))}
    </div>
  );
}

