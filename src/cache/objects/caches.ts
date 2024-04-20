import Cache from "../interfaces/Cache";
import { getGames } from "../../routes/game";

export const caches = {};

caches["game-data-today"] = new Cache("game-data-today", () => getGames(new Date().toLocaleDateString("en-US")));