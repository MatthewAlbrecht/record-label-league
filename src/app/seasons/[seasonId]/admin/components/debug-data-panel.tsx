"use client";

import { useQuery } from "convex/react";
import { api } from "convex/_generated/api";
import { Id } from "convex/_generated/dataModel";
import { useState } from "react";

interface DebugDataPanelProps {
  seasonId: Id<"seasons">;
}

export function DebugDataPanel({ seasonId }: DebugDataPanelProps) {
  const [copiedSummary, setCopiedSummary] = useState(false);
  const [copiedJson, setCopiedJson] = useState(false);

  const debugData = useQuery(api.admin.getSeasonDebugData, {
    seasonId,
  });

  const copyToClipboard = (text: string, setCopied: (v: boolean) => void) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!debugData) {
    return (
      <div className="flex items-center justify-center py-8">
        <p className="text-gray-500">Loading debug data...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-white p-4 border border-gray-200 max-h-96 overflow-y-auto relative">
        <button
          onClick={() => {
            const summary = `Season Phase: ${debugData.season.currentPhase}
Season Week: ${debugData.season.currentWeek}
Season Status: ${debugData.season.status}
Season Players: ${debugData.seasonPlayers}
Player Inventory: ${debugData.playerInventory}
Draft Prompts: ${debugData.draftPrompts}
Draft State: ${debugData.draftState}
Draft Selections: ${debugData.draftSelections}
Roster Entries: ${debugData.rosterEntries}
Challenge Board: ${debugData.challengeBoard}
Board Challenges: ${debugData.boardChallenges}
Challenge Selections: ${debugData.challengeSelections}
Challenge Reveals: ${debugData.challengeReveals}
Advantage Board: ${debugData.advantageBoard}
Board Advantages: ${debugData.boardAdvantages}`;
            copyToClipboard(summary, setCopiedSummary);
          }}
          className="absolute top-2 right-2 px-2 py-1 text-xs bg-blue-500 hover:bg-blue-600 text-white rounded"
        >
          {copiedSummary ? "✓ Copied!" : "Copy"}
        </button>
        <div className="text-sm font-mono space-y-2">
          <div>
            <strong>Season Phase:</strong> {debugData.season.currentPhase}
          </div>
          <div>
            <strong>Season Week:</strong> {debugData.season.currentWeek}
          </div>
          <div>
            <strong>Season Status:</strong> {debugData.season.status}
          </div>
          <hr className="my-2" />
          <div>
            <strong>Season Players:</strong> {debugData.seasonPlayers}
          </div>
          <div>
            <strong>Player Inventory (Advantages):</strong>{" "}
            {debugData.playerInventory}
          </div>
          <div>
            <strong>Draft Prompts:</strong> {debugData.draftPrompts}
          </div>
          <div>
            <strong>Draft State:</strong> {debugData.draftState}
          </div>
          <div>
            <strong>Draft Selections:</strong> {debugData.draftSelections}
          </div>
          <div>
            <strong>Roster Entries:</strong> {debugData.rosterEntries}
          </div>
          <div>
            <strong>Challenge Board:</strong> {debugData.challengeBoard}
          </div>
          <div>
            <strong>Board Challenges:</strong> {debugData.boardChallenges}
          </div>
          <div>
            <strong>Challenge Selections:</strong>{" "}
            {debugData.challengeSelections}
          </div>
          <div>
            <strong>Challenge Reveals:</strong> {debugData.challengeReveals}
          </div>
          <div>
            <strong>Advantage Board:</strong> {debugData.advantageBoard}
          </div>
          <div>
            <strong>Board Advantages:</strong> {debugData.boardAdvantages}
          </div>
        </div>
      </div>
      <details className="rounded-lg bg-white p-4 border border-gray-200 relative">
        <div className="absolute top-2 right-2">
          <button
            onClick={(e) => {
              e.preventDefault();
              copyToClipboard(
                JSON.stringify(debugData, null, 2),
                setCopiedJson
              );
            }}
            className="px-2 py-1 text-xs bg-blue-500 hover:bg-blue-600 text-white rounded"
          >
            {copiedJson ? "✓ Copied!" : "Copy"}
          </button>
        </div>
        <summary className="font-semibold cursor-pointer text-gray-900 pr-20">
          Full JSON Data
        </summary>
        <pre className="text-xs mt-3 overflow-x-auto max-h-64 overflow-y-auto">
          {JSON.stringify(debugData, null, 2)}
        </pre>
      </details>
    </div>
  );
}

