import Cache from "../interfaces/Cache";
import { getGames } from "../../routes/games";

export const caches = {};

caches["game-data-today"] = new Cache("game-data-today", 30, () => getGames());

export const gameCaches: Record<string, Cache> = {};