import { createChannel } from "better-sse";
import _ from "lodash";

// this channel will keep track of game updates, and then send them as an event with game ID on change
const game = createChannel();

let count = 0;

// arrays of game IDs in each status
interface GamesByStatus {
    Preview: number[],
    Live: number[],
    Final: number[]
}

let games: GamesByStatus = {
    "Preview": [],
    "Live": [],
    "Final": [],
};

// // polling rules to MLB API:
// for any games that haven't started, poll the game endpoint every 30 mins (pitcher changes, delays, etc.)
// for any games in progress, poll the game endpoint every 30 seconds (batters, outs, etc.)
// for any games final, poll the game endpoint every 60-120 mins (win/loss changes?)
export const intervalMapSec = {
    "Preview": 60 * 30, // 30 minutes
    "Live":  30, // 30 seconds
    "Final": 60 * 60, // 60 minutes
};

// if are games in preview, refresh their status
if (games.Preview.length) {
    setInterval(() => {
        game.broadcast(count++, "tick");
    }, intervalMapSec.Preview * 1000);
}

// if are games in live, refresh their status
if (games.Live.length) {
    setInterval(() => {
        game.broadcast(count++, "tick");
    }, intervalMapSec.Live * 1000);
}

// if are games in final, refresh their status
if (games.Final.length) {
    setInterval(() => {
        game.broadcast(count++, "tick");
    }, intervalMapSec.Final * 1000);
}

const broadcastSessionCount = () => {
    game.broadcast(game.sessionCount, "session-count");
};

game
    .on("session-registered", broadcastSessionCount)
    .on("session-deregistered", broadcastSessionCount);

export { game };