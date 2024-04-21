import { mlbApi } from "../constants/constants";
import express, { NextFunction, Request, Response } from "express";
import axios from "axios";
import { caches } from "../cache/objects/caches";
const router = express.Router();

// list status of today's games
router.get("/list", (req: Request, res: Response, next: NextFunction) => {


    // caches["game-data-today"].redefine(() => getGames('3/31/2024'));

    // get today's games
    caches["game-data-today"].read()
        .then(({ metadata, data }) => {
            res.json({ metadata, data });
        })
        .catch(err => {
            next(err);
        });
});

export async function getGames(gameDate?: string) {
    // if date isn't provided, make a string of the current date in the format MM/DD/YYYY
    if (gameDate === undefined) {
        gameDate = new Date().toLocaleDateString("en-US", { timeZone: 'America/Los_Angeles' });
    }
    // keep track of which games were postponed, this will come in handy later...
    let mapPostponed = {};

    // create the call string to fetch the given date's games
    let apiString = `${mlbApi.url}/api/v1/schedule/?sportId=1&date=${gameDate}`;

    // the query will return a list of games for the given date
    console.log(`Querying: ${apiString}`);
    const response = await axios.get(apiString);
    const gameResponses = await Promise.all(response.data.dates[0].games.map(game => {
        // keep track of the game if it was postponed, since the data is unreliable on the game page
        if (game.status.detailedState === "Postponed") {
            mapPostponed[game.gamePk] = true;
        }
        return axios.get(`${mlbApi.url}${game.link}`);
    }));
    let playersToQuery: any = [];
    gameResponses.forEach(gameResponse => {
        const game_1 = gameResponse.data;
        // if the game is scheduled, fetch information on...
        if (game_1.gameData.status.abstractGameState === "Preview") {
            // 1. probable pitchers
            if (game_1.gameData.probablePitchers.hasOwnProperty("away")) {
                playersToQuery.push(game_1.gameData.probablePitchers.away.link);
            }
            if (game_1.gameData.probablePitchers.hasOwnProperty("home")) {
                playersToQuery.push(game_1.gameData.probablePitchers.home.link);
            }
        }


        // if the game is live, fetch information on...
        else if (game_1.gameData.status.abstractGameState === "Live") {
            // 1. current pitchers
            playersToQuery.push(game_1.liveData.linescore.offense.pitcher.link);
            playersToQuery.push(game_1.liveData.linescore.defense.pitcher.link);
            // 2. current runners
            const bases = {
                "batter": false,
                "first": false,
                "second": false,
                "third": false
            };
            Object.keys(bases).forEach(baseName => {
                if (game_1.liveData.linescore.offense.hasOwnProperty(baseName)) {
                    playersToQuery.push(game_1.liveData.linescore.offense[baseName].link);
                }
            });

        }


        // if the game is final, fetch information on...
        else if (game_1.gameData.status.abstractGameState === "Final") {
            // 1. winning/losing pitcher
            if (game_1.liveData.hasOwnProperty("decisions")) {
                playersToQuery.push(game_1.liveData.decisions.winner.link);
                playersToQuery.push(game_1.liveData.decisions.loser.link);
            }
        }
    });
    const [gameResponses_1, playerResponses] = await Promise.all([
        Promise.resolve(gameResponses),
        Promise.all(playersToQuery.map(playerLink => {
            return axios.get(`${mlbApi.url}${playerLink}`);
        }))
    ]);
    let playerInfo = {
        "-1": { "id": -1, "name": "TBD", "number": -1 }
    };
    playerResponses.forEach(playerResponse => {
        const player = playerResponse.data.people[0];
        playerInfo[player.id] = { "id": player.id, "name": player.fullName, "number": player.primaryNumber };
    });
    const allGames = gameResponses_1.map(gameResponse_1 => {
        const game_2 = gameResponse_1.data;
        // for every game, fetch information on...
        const gameObj = {
            // 1. game state
            // 2. start time
            "id": game_2.gamePk,
            "state": {
                "status": {
                    "general": game_2.gameData.status.abstractGameState,
                    "detailed": game_2.gameData.status.detailedState,
                    "start_time": {
                        "display": new Date(game_2.gameData.datetime.dateTime).toLocaleTimeString("en-US", { timeZone: "America/New_York", hour12: true, hour: "2-digit", minute: "2-digit" }),
                        // "display": `${game.gameData.datetime.time} ${game.gameData.datetime.ampm}`,
                        ...game_2.gameData.datetime
                    }
                }
            },
            // 3. team names and league
            "teams": {
                "away": {
                    "info": {
                        "name": game_2.gameData.teams.away.name,
                        "abbreviation": game_2.gameData.teams.away.abbreviation,
                        "league": game_2.gameData.teams.away.league.name
                    }
                },
                "home": {
                    "info": {
                        "name": game_2.gameData.teams.home.name,
                        "abbreviation": game_2.gameData.teams.home.abbreviation,
                        "league": game_2.gameData.teams.home.league.name
                    }
                }
            }
        };

        // check if the game is postponed to a later date
        if (mapPostponed.hasOwnProperty(game_2.gamePk)) {
            gameObj.state.status.general = "Final";
            gameObj.state.status.detailed = "Postponed";
            gameObj.teams.away["pitcher"] = -1;
            gameObj.teams.home["pitcher"] = -1;
        }

        // if the game is scheduled, fetch information on...
        if (gameObj.state.status.general === "Preview") {
            // 1. probable pitchers
            gameObj.teams.away["pitcher"] = playerInfo[game_2.gameData.probablePitchers.hasOwnProperty("away") ? game_2.gameData.probablePitchers.away.id : -1];
            gameObj.teams.home["pitcher"] = playerInfo[game_2.gameData.probablePitchers.hasOwnProperty("home") ? game_2.gameData.probablePitchers.home.id : -1];
        }


        // if the game is live, fetch information on...
        else if (gameObj.state.status.general === "Live") {
            // 1. current inning
            gameObj.state["inning"] = {
                "number": game_2.liveData.linescore.currentInning,
                "top_bottom": game_2.liveData.linescore.inningHalf,
            };
            // 2. current pitchers
            gameObj.teams.away["pitcher"] = game_2.liveData.linescore.isTopInning ? playerInfo[game_2.liveData.linescore.offense.pitcher.id] : playerInfo[game_2.liveData.linescore.defense.pitcher.id];
            gameObj.teams.home["pitcher"] = game_2.liveData.linescore.isTopInning ? playerInfo[game_2.liveData.linescore.defense.pitcher.id] : playerInfo[game_2.liveData.linescore.offense.pitcher.id];
            // 3. current runners
            gameObj.state["diamond"] = {
                "batter": false,
                "first": false,
                "second": false,
                "third": false
            };
            Object.keys(gameObj.state["diamond"]).forEach(baseName_1 => {
                if (game_2.liveData.linescore.offense.hasOwnProperty(baseName_1)) {
                    // assign the current baserunner
                    gameObj.state["diamond"][baseName_1] = playerInfo[game_2.liveData.linescore.offense[baseName_1].id];

                    // add a check for batter because the API will say 
                    // 1. they're batting and also on base
                    // 2. if there are 3 outs, the team is still at bat but the other team's batter is up
                    if ((baseName_1 !== "batter" && gameObj.state["diamond"].batter && (gameObj.state["diamond"].batter.id === game_2.liveData.linescore.offense[baseName_1].id))
                        || game_2.liveData.linescore.outs === 3) {
                        gameObj.state["diamond"].batter = false;
                    }
                }
            });
            // 4. current outs
            gameObj.state["outs"] = game_2.liveData.linescore.outs;
            // 5. current score
            gameObj.teams.away["score"] = game_2.liveData.linescore.teams.away.runs;
            gameObj.teams.home["score"] = game_2.liveData.linescore.teams.home.runs;

        }


        // if the game is final, fetch information on...
        else if (gameObj.state.status.general === "Final") {
            // 1. final score
            gameObj.teams.away["score"] = game_2.liveData.linescore.teams.away.runs;
            gameObj.teams.home["score"] = game_2.liveData.linescore.teams.home.runs;
            // 2. winning/losing pitcher
            if (game_2.liveData.hasOwnProperty("decisions")) {
                gameObj.teams.away["pitcher"] = gameObj.teams.away["score"] > gameObj.teams.home["score"] ? playerInfo[game_2.liveData.decisions.winner.id] : playerInfo[game_2.liveData.decisions.loser.id];
                gameObj.teams.home["pitcher"] = gameObj.teams.home["score"] > gameObj.teams.away["score"] ? playerInfo[game_2.liveData.decisions.winner.id] : playerInfo[game_2.liveData.decisions.loser.id];
            }
        }

        return gameObj;
    })
        .sort((a: any, b: any) => {
            // Sorting by status
            const statusOrder = {
                "Live": 0,
                "Final": 1,
                "Preview": 2
            };
            const statusComparison = statusOrder[a.state.status.general] - statusOrder[b.state.status.general];
            if (statusComparison !== 0) {
                return statusComparison;
            }

            // For "Live" games, sort by inning (largest inning first)
            if (a.state.status.general === "Live") {
                return b.state.inning.number - a.state.inning.number;
            }

            const gameAStart = a.state.status.start_time.dateTime;
            const gameBStart = b.state.status.start_time.dateTime;

            // For "Final" games, sort by start time (earliest time first)
            if (a.state.status.general === "Final") {
                return gameAStart - gameBStart;
            }

            // For "Preview" games, sort by start time (earliest time first)
            if (a.state.status.general === "Preview") {
                return gameAStart - gameBStart;
            }

            return 0;
        });
    return allGames;
}

export default router;
