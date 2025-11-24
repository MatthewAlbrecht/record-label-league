'use client';

import { Card } from '~/components/ui/card';
import { Badge } from '~/components/ui/badge';

interface RosterDisplayProps {
  rosters: any[];
}

export default function RosterDisplay({ rosters }: RosterDisplayProps) {
  return (
    <Card className="p-4">
      <h3 className="font-bold text-lg mb-4">Current Rosters</h3>

      <div className="space-y-4">
        {rosters.map((roster, idx) => (
          <div key={idx} className="border rounded p-3">
            <div className="font-semibold mb-3">
              {roster.player?.labelName || `Player ${idx + 1}`}
            </div>

            {roster.artists.length === 0 ? (
              <p className="text-xs text-gray-500 italic">No artists drafted yet</p>
            ) : (
              <ul className="space-y-1">
                {roster.artists.map((artist: any, artistIdx: number) => (
                  <li key={artistIdx} className="text-sm">
                    {artist.name}
                  </li>
                ))}
              </ul>
            )}

            <div className="text-xs text-gray-600 mt-2">
              {roster.artists.length}/8 artists
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

