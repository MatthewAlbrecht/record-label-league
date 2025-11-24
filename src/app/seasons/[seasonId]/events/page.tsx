'use client';

import { useParams } from 'next/navigation';
import { useQuery } from 'convex/react';
import { api } from 'convex/_generated/api';
import type { Id } from 'convex/_generated/dataModel';
import { Card } from '~/components/ui/card';
import { Loader2, Clock, User } from 'lucide-react';
import { getPhaseLabel } from '~/lib/enum-utils';

function getEventDescription(event: any): string {
  const { type, payload } = event;

  switch (type) {
    case 'DRAFT_PICK':
      return `${payload.player} drafted "${payload.artist}" for the prompt "${payload.prompt}"`;
    case 'PROMPT_SELECTED':
      return `${payload.player} selected the prompt "${payload.prompt}"`;
    case 'PHASE_ADVANCED':
      return `Season phase advanced from ${payload.from} to ${payload.to}`;
    case 'ADVANTAGE_ASSIGNED':
      return `${payload.player} was assigned the advantage "${payload.advantage}"`;
    case 'CHALLENGE_SELECTED':
      return `${payload.player} selected a challenge for week ${payload.week}`;
    default:
      return `Event: ${type}`;
  }
}

function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export default function EventsPage() {
  const params = useParams();
  const seasonId = (params?.seasonId as string) || '';

  const result = useQuery(api.events.getSeasonEvents, {
    seasonId: seasonId as Id<'seasons'>,
    limit: 100,
    offset: 0,
  });

  if (!result) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  const { events } = result;

  return (
    <div className="container mx-auto py-8 px-4">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-2">Event Log</h1>
        <p className="text-gray-600">
          Timeline of all game actions and events
        </p>
      </div>

      {/* Events List */}
      <div className="space-y-4">
        {events.length === 0 ? (
          <Card className="p-6 text-center">
            <Clock className="w-12 h-12 mx-auto mb-4 text-gray-400" />
            <p className="text-gray-600">No events yet</p>
          </Card>
        ) : (
          events.map((event, index) => (
            <Card key={event._id} className="p-6 hover:shadow-md transition-shadow">
              <div className="flex gap-4">
                {/* Timeline marker */}
                <div className="flex flex-col items-center">
                  <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center">
                    <Clock className="w-6 h-6 text-blue-600" />
                  </div>
                  {index < events.length - 1 && (
                    <div className="w-0.5 h-12 bg-gray-300 mt-2" />
                  )}
                </div>

                {/* Event details */}
                <div className="flex-1 pt-1">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <p className="font-semibold text-lg mb-1">
                        {getEventDescription(event)}
                      </p>
                      <p className="text-sm text-gray-600">
                        <span className="font-medium">Event:</span> {event.type} •{' '}
                        <span className="font-medium">Phase:</span> {getPhaseLabel(event.currentPhase)} •{' '}
                        <span className="font-medium">Week:</span> {event.weekNumber}
                      </p>
                    </div>

                    {/* Timestamp and actor */}
                    <div className="text-right flex-shrink-0">
                      <p className="text-xs text-gray-500 mb-2">
                        {formatTimestamp(event.createdAt)}
                      </p>
                      {event.actor ? (
                        <div className="flex items-center justify-end gap-1 text-xs text-gray-600">
                          <User className="w-3 h-3" />
                          <span>{event.actor.displayName}</span>
                        </div>
                      ) : (
                        <p className="text-xs text-gray-500 italic">System</p>
                      )}
                    </div>
                  </div>

                  {/* Payload details (if not empty) */}
                  {Object.keys(event.payload).length > 0 && (
                    <details className="mt-3 cursor-pointer">
                      <summary className="text-xs text-gray-500 hover:text-gray-700">
                        View details
                      </summary>
                      <pre className="mt-2 bg-gray-50 p-3 rounded text-xs overflow-auto max-h-48">
                        {JSON.stringify(event.payload, null, 2)}
                      </pre>
                    </details>
                  )}
                </div>
              </div>
            </Card>
          ))
        )}
      </div>

      {/* Pagination info */}
      {events.length > 0 && (
        <p className="text-sm text-gray-600 text-center mt-6">
          Showing {events.length} event{events.length !== 1 ? 's' : ''}
        </p>
      )}
    </div>
  );
}

