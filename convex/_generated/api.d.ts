/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";
import type * as actions_presentation from "../actions/presentation.js";
import type * as actions_spotify from "../actions/spotify.js";
import type * as admin from "../admin.js";
import type * as advantages from "../advantages.js";
import type * as auth from "../auth.js";
import type * as challenges from "../challenges.js";
import type * as dashboard from "../dashboard.js";
import type * as drafts from "../drafts.js";
import type * as events from "../events.js";
import type * as inventory from "../inventory.js";
import type * as leagues from "../leagues.js";
import type * as playlists from "../playlists.js";
import type * as pool from "../pool.js";
import type * as presentation from "../presentation.js";
import type * as rosterEvolution from "../rosterEvolution.js";
import type * as rosterEvolutionSettings from "../rosterEvolutionSettings.js";
import type * as seasons from "../seasons.js";
import type * as todos from "../todos.js";
import type * as users from "../users.js";
import type * as voting from "../voting.js";

/**
 * A utility for referencing Convex functions in your app's API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
declare const fullApi: ApiFromModules<{
  "actions/presentation": typeof actions_presentation;
  "actions/spotify": typeof actions_spotify;
  admin: typeof admin;
  advantages: typeof advantages;
  auth: typeof auth;
  challenges: typeof challenges;
  dashboard: typeof dashboard;
  drafts: typeof drafts;
  events: typeof events;
  inventory: typeof inventory;
  leagues: typeof leagues;
  playlists: typeof playlists;
  pool: typeof pool;
  presentation: typeof presentation;
  rosterEvolution: typeof rosterEvolution;
  rosterEvolutionSettings: typeof rosterEvolutionSettings;
  seasons: typeof seasons;
  todos: typeof todos;
  users: typeof users;
  voting: typeof voting;
}>;
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;
