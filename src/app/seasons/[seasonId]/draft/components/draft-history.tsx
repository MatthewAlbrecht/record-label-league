'use client';

import { Card } from '~/components/ui/card';
import { Badge } from '~/components/ui/badge';

interface DraftHistoryProps {
  history: any[];
  rosters: any[];
}

export default function DraftHistory({ history, rosters }: DraftHistoryProps) {
  // Build a combined timeline of both category selections and artist picks
  const timeline: any[] = [];

  // Add all category selections
  history.forEach((selection: any) => {
    timeline.push({
      type: 'category',
      round: selection.round,
      player: selection.player?.user?.displayName,
      text: selection.prompt?.text,
      createdAt: selection.createdAt,
    });
  });

  // Add all artist picks from rosters
  rosters.forEach((roster: any) => {
    roster.artists.forEach((artist: any) => {
      timeline.push({
        type: 'artist',
        round: artist.rosterEntry.acquiredAtRound,
        player: roster.player?.user?.displayName,
        text: artist.name,
        prompt: artist.prompt?.text,
        createdAt: artist.rosterEntry.createdAt || 0,
      });
    });
  });

  // Sort chronologically
  const sortedTimeline = timeline.sort((a, b) => {
    if (a.round !== b.round) {
      return a.round - b.round;
    }
    return a.createdAt - b.createdAt;
  });

  // Pre-calculate artist pick numbers to avoid double-counting between views
  const artistPickNumbers = new Map<number, number>();
  let pickCounter = 0;
  sortedTimeline.forEach((item: any, idx) => {
    if (item.type === 'artist') {
      pickCounter++;
      artistPickNumbers.set(idx, pickCounter);
    }
  });

  return (
    <Card className="p-6">
      <h3 className="font-bold text-lg mb-4">Draft History - Timeline</h3>

      {sortedTimeline.length === 0 ? (
        <p className="text-gray-500 italic text-center py-8">No picks yet</p>
      ) : (
        <>
          {/* Desktop Table View */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-gray-300 bg-gray-50">
                  <th className="text-left py-3 px-3 font-semibold w-12">#</th>
                  <th className="text-left py-3 px-3 font-semibold w-16">Round</th>
                  <th className="text-left py-3 px-3 font-semibold w-32">Player</th>
                  <th className="text-left py-3 px-3 font-semibold">Selection</th>
                </tr>
              </thead>
              <tbody>
                {sortedTimeline.map((item: any, idx) => {
                  const isArtistPick = item.type === 'artist';
                  const displayNumber = isArtistPick ? artistPickNumbers.get(idx) : '-';

                  return (
                    <tr
                      key={idx}
                      className={`border-b border-gray-200 transition-colors ${
                        isArtistPick ? 'hover:bg-green-50 bg-green-50' : 'hover:bg-blue-50'
                      }`}
                    >
                      <td className="py-3 px-3 whitespace-nowrap">
                        {isArtistPick ? (
                          <Badge className="bg-green-600 text-center justify-center inline-flex">
                            {displayNumber}
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="text-center justify-center inline-flex">
                            {displayNumber}
                          </Badge>
                        )}
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap">
                        <Badge variant="outline">R{item.round}</Badge>
                      </td>
                      <td className="py-3 px-3 font-medium whitespace-nowrap">
                        {item.player}
                      </td>
                      <td className="py-3 px-3 italic text-gray-700">
                        {isArtistPick ? (
                          <strong>{item.text}</strong>
                        ) : (
                          `"${item.text}"`
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Block View */}
          <div className="md:hidden space-y-3">
            {sortedTimeline.map((item: any, idx) => {
              const isArtistPick = item.type === 'artist';
              const displayNumber = isArtistPick ? artistPickNumbers.get(idx) : '-';

              return (
                <div
                  key={idx}
                  className={`p-4 rounded-lg border-2 transition-colors ${
                    isArtistPick ? 'bg-green-50 border-green-200' : 'bg-blue-50 border-blue-200'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3 mb-2">
                    {isArtistPick ? (
                      <Badge className="bg-green-600">{displayNumber}</Badge>
                    ) : (
                      <Badge variant="secondary">-</Badge>
                    )}
                    <Badge variant="outline">R{item.round}</Badge>
                  </div>
                  <div className="mb-2">
                    <p className="font-semibold text-sm">{item.player}</p>
                  </div>
                  <div className="text-sm">
                    {isArtistPick ? (
                      <p className="font-bold">{item.text}</p>
                    ) : (
                      <p className="italic">"{item.text}"</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      <div className="text-sm text-gray-600 mt-4 pt-4 border-t">
        <strong>Total artist picks:</strong> {artistPickNumbers.size}
      </div>
    </Card>
  );
}

