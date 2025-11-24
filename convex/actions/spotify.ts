'use node';

import { action } from '../_generated/server';
import { v } from 'convex/values';

/**
 * Fetch and validate Spotify playlist data
 */
export const fetchAndValidatePlaylist = action({
  args: {
    spotifyUrl: v.string(),
  },
  handler: async (ctx, args) => {
    const clientId = process.env.SPOTIFY_CLIENT_ID;
    const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      throw new Error(
        'SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET environment variables are required'
      );
    }

    // Get access token
    const credentials = `${clientId}:${clientSecret}`;
    const encodedCredentials = btoa(credentials);

    const tokenResponse = await fetch(
      'https://accounts.spotify.com/api/token',
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${encodedCredentials}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'grant_type=client_credentials',
      }
    );

    if (!tokenResponse.ok) {
      throw new Error(`Spotify auth failed: ${tokenResponse.statusText}`);
    }

    const tokenData = (await tokenResponse.json()) as {
      access_token: string;
      expires_in: number;
    };

    const accessToken = tokenData.access_token;

    // Extract playlist ID from URL
    const playlistIdMatch = args.spotifyUrl.match(
      /playlist[/:]+([a-zA-Z0-9]+)/
    );
    if (!playlistIdMatch || !playlistIdMatch[1]) {
      throw new Error('Invalid Spotify playlist URL');
    }
    const playlistId = playlistIdMatch[1];

    // Fetch playlist metadata
    const playlistResponse = await fetch(
      `https://api.spotify.com/v1/playlists/${playlistId}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!playlistResponse.ok) {
      throw new Error('Failed to fetch playlist from Spotify');
    }

    const playlistData = (await playlistResponse.json()) as {
      name: string;
      images: Array<{ url: string }>;
    };

    // Fetch playlist tracks
    const tracksResponse = await fetch(
      `https://api.spotify.com/v1/playlists/${playlistId}/tracks`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!tracksResponse.ok) {
      throw new Error('Failed to fetch playlist tracks from Spotify');
    }

    const tracksData = (await tracksResponse.json()) as {
      items: Array<{
        track: {
          id: string;
          name: string;
          artists: Array<{ name: string }>;
          album: { images: Array<{ url: string }> };
          duration_ms: number;
        };
      }>;
    };

    const tracks = tracksData.items.map((item, index) => ({
      spotifyTrackId: item.track.id,
      trackName: item.track.name,
      artistNames: item.track.artists.map((a) => a.name),
      albumArt:
        item.track.album.images[0]?.url || playlistData.images[0]?.url || '',
      duration: item.track.duration_ms,
      position: index,
      rawSpotifyData: item.track, // Store raw Spotify track data for future mapping
    }));

    return {
      tracks,
      playlistName: playlistData.name,
    };
  },
});
