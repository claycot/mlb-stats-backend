import { mlbApi } from "../constants/constants";
import express, { NextFunction, Request, Response } from "express";
import axios from "axios";
import { caches, gameCaches } from "../cache/objects/caches";
import { createSession } from "better-sse";
import { game, intervalMapSec } from "../channels/game";
import Cache from "../cache/interfaces/Cache";
const router = express.Router();

// subscribe to get sent a game ID when information changes
router.get("/sse", async (req: Request, res: Response, next: NextFunction) => {
    // create a session for the user
    const session = await createSession(req, res);

    // join the game channel
    game.register(session);
});

// list the games that are occurring today, by ID
router.get("/list", (req: Request, res: Response, next: NextFunction) => {
    // if the games are cached daily, we can do this
    // res.json(Object.keys(gameCaches));

    // otherwise, let's poll the MLB API
    // if date isn't provided, make a string of the current date in the format MM/DD/YYYY
    let gameDate: string | undefined = req.params.date;

    getGamesByDate(gameDate).then(games => {
        res.json({
            metadata: {
                timestamp: games.date
            },
            data: games.games.reduce((acc, game) => {
                if (!acc.hasOwnProperty(game.status)) {
                    acc[game.status] = [];
                }
                acc[game.status].push(game.id);
                return acc
            }, {})
        });
    });
});

// get information on one or more games, by ID
router.get("/info", async (req: Request, res: Response, next: NextFunction) => {
    // the IDs are numbers represented as strings, which is ok because objects turn int keys to strings anyway
    const gameIDs: string[] = (req.query.ids! as string).split(",");

    // for each provided game ID, return information
    const games = await Promise.allSettled(
        gameIDs.map(id => {
            // if we haven't seen this game but it exists, create its cache entry
            if (!gameCaches.hasOwnProperty(id)) {
                gameCaches[id] = new Cache(`game-data-${id}`, 30, () => getGameInfo(id));
            }

            // return the game cache contents
            return gameCaches[id].read();
        })
    );

    // return games
    res.json(games);

    // update interval for all games read
    games.forEach(game => {
        if (game.status === "fulfilled") {
            gameCaches[game.value.data.id].setMaxAge(intervalMapSec[game.value.data.state.status.general]);
        }
    });
});

// get information on all of today's games
router.get("/info/initial", (req: Request, res: Response, next: NextFunction) => {
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

export async function getGamesByDate(gameDate?: string) {
    if (gameDate === undefined) {
        // force LA time so that games are tracked until 3 AM ET
        gameDate = new Date().toLocaleDateString("en-US", { timeZone: 'America/Los_Angeles' });
    }

    // create the call string to fetch the given date's games
    let apiString = `${mlbApi.url}/api/v1/schedule/?sportId=1&date=${gameDate}`;

    // the query will return a list of games for the given date
    console.log(`Querying: ${apiString}`);
    const response = await axios.get(apiString);

    // the object returns nested info on the games, flatten the IDs and return
    return {
        date: gameDate,
        games: response.data.dates[0].games.map(game => { return { id: game.gamePk, link: game.link, status: game.status.abstractGameState }; })
    };
}

// get information on a single game
async function getGameInfo(id: string) {
    // TODO: make this dynamic since the link is provided elsewhere in the API
    const apiLink = `/api/v1.1/game/${id}/feed/live`;

    // query for more information on each game, since the first endpoint only gives general info
    console.log(`Querying: ${mlbApi.url}${apiLink}`);
    const gameResponse = await axios.get(`${mlbApi.url}${apiLink}`);

    // catch if an invalid id was passed
    if (gameResponse.data.gamePk !== parseInt(id, 10)) {
        throw new Error(`Game with ID ${id} does not exist.`);
    }

    // make a list of players involved in the current play (pitchers, batter, runners)
    // if any player is not provided (pitchers) reference a TBD object
    let playerInfo = {
        "-1": { "id": -1, "name": "TBD", "number": -1 }
    };

    // map each player by their ID
    Object.keys(gameResponse.data.gameData.players).forEach(playerID => {
        const player = gameResponse.data.gameData.players[playerID];
        playerInfo[player.id] = {
            "id": player.id,
            "name": player.fullName,
            "number": player.primaryNumber
        };
    });

    // transform game information into scoreboard object
    const game = gameResponse.data;
    // for every game, fetch information on...
    const gameObj = {
        // 1. game state
        // 2. start time
        "id": game.gamePk,
        "state": {
            "status": {
                "general": game.gameData.status.abstractGameState,
                "detailed": game.gameData.status.detailedState,
                "start_time": {
                    "display": new Date(game.gameData.datetime.dateTime).toLocaleTimeString("en-US", { timeZone: "America/New_York", hour12: true, hour: "2-digit", minute: "2-digit" }),
                    // "display": `${game.gameData.datetime.time} ${game.gameData.datetime.ampm}`,
                    ...game.gameData.datetime
                }
            }
        },
        // 3. team names and league
        "teams": {
            "away": {
                "info": {
                    "name": game.gameData.teams.away.name,
                    "abbreviation": game.gameData.teams.away.abbreviation,
                    "league": game.gameData.teams.away.league.name
                }
            },
            "home": {
                "info": {
                    "name": game.gameData.teams.home.name,
                    "abbreviation": game.gameData.teams.home.abbreviation,
                    "league": game.gameData.teams.home.league.name
                }
            }
        }
    };

    // if the game is scheduled, fetch information on...
    if (gameObj.state.status.general === "Preview") {
        // 1. probable pitchers
        gameObj.teams.away["pitcher"] = playerInfo[game.gameData.probablePitchers.hasOwnProperty("away") ? game.gameData.probablePitchers.away.id : -1];
        gameObj.teams.home["pitcher"] = playerInfo[game.gameData.probablePitchers.hasOwnProperty("home") ? game.gameData.probablePitchers.home.id : -1];
    }


    // if the game is live, fetch information on...
    else if (gameObj.state.status.general === "Live") {
        // 1. current inning
        gameObj.state["inning"] = {
            "number": game.liveData.linescore.currentInning,
            "top_bottom": game.liveData.linescore.inningHalf,
        };
        // 2. current pitchers
        gameObj.teams.away["pitcher"] = game.gameData.teams.away.name === game.liveData.linescore.defense.team.name ?
            playerInfo[game.liveData.linescore.defense.pitcher.id] : playerInfo[game.liveData.linescore.offense.pitcher.id];
        gameObj.teams.home["pitcher"] = game.gameData.teams.home.name === game.liveData.linescore.defense.team.name ?
            playerInfo[game.liveData.linescore.defense.pitcher.id] : playerInfo[game.liveData.linescore.offense.pitcher.id];
        // 3. current runners
        gameObj.state["diamond"] = {
            "batter": false,
            "first": false,
            "second": false,
            "third": false
        };
        Object.keys(gameObj.state["diamond"]).forEach(baseName_1 => {
            if (game.liveData.linescore.offense.hasOwnProperty(baseName_1)) {
                // assign the current baserunner
                gameObj.state["diamond"][baseName_1] = playerInfo[game.liveData.linescore.offense[baseName_1].id];

                // add a check for batter because the API will say 
                // 1. they're batting and also on base
                // 2. if there are 3 outs, the team is still at bat but the other team's batter is up
                if ((baseName_1 !== "batter" && gameObj.state["diamond"].batter && (gameObj.state["diamond"].batter.id === game.liveData.linescore.offense[baseName_1].id))
                    || game.liveData.linescore.outs === 3) {
                    gameObj.state["diamond"].batter = false;
                }
            }
        });
        // 4. current outs
        gameObj.state["outs"] = game.liveData.linescore.outs;
        // 5. current score
        gameObj.teams.away["score"] = game.liveData.linescore.teams.away.runs;
        gameObj.teams.home["score"] = game.liveData.linescore.teams.home.runs;

    }


    // if the game is final, fetch information on...
    else if (gameObj.state.status.general === "Final") {
        // 1. final score
        gameObj.teams.away["score"] = game.liveData.linescore.teams.away.runs;
        gameObj.teams.home["score"] = game.liveData.linescore.teams.home.runs;
        // 2. winning/losing pitcher
        if (game.liveData.hasOwnProperty("decisions")) {
            gameObj.teams.away["pitcher"] = gameObj.teams.away["score"] > gameObj.teams.home["score"] ? playerInfo[game.liveData.decisions.winner.id] : playerInfo[game.liveData.decisions.loser.id];
            gameObj.teams.home["pitcher"] = gameObj.teams.home["score"] > gameObj.teams.away["score"] ? playerInfo[game.liveData.decisions.winner.id] : playerInfo[game.liveData.decisions.loser.id];
        }
    }

    return gameObj;
}

export async function getGames(gameDate?: string) {
    // if date isn't provided, make a string of the current date in the format MM/DD/YYYY
    if (gameDate === undefined) {
        // force LA time so that games are tracked until 3 AM ET
        gameDate = new Date().toLocaleDateString("en-US", { timeZone: 'America/Los_Angeles' });
    }

    // keep track of which games were postponed, this will come in handy later...
    let mapPostponed = {};

    // create the call string to fetch the given date's games
    let apiString = `${mlbApi.url}/api/v1/schedule/?sportId=1&date=${gameDate}`;

    // the query will return a list of games for the given date
    console.log(`Querying: ${apiString}`);
    const response = await axios.get(apiString);

    // poll for more information on each game, since the first endpoint only gives general info
    const gameResponses = await Promise.all(response.data.dates[0].games.map(game => {
        // keep track of the game if it was postponed, since the data is unreliable on the game page
        if (game.status.detailedState === "Postponed") {
            mapPostponed[game.gamePk] = true;
        }
        return axios.get(`${mlbApi.url}${game.link}`);
    }));

    // make a list of players involved in the current play (pitchers, batter, runners)
    // if any player is not provided (pitchers) reference a TBD object
    let playerInfo = {
        "-1": { "id": -1, "name": "TBD", "number": -1 }
    };

    // map each player by their ID
    gameResponses.forEach(gameResponse => {
        Object.keys(gameResponse.data.gameData.players).forEach(playerID => {
            const player = gameResponse.data.gameData.players[playerID];
            playerInfo[player.id] = {
                "id": player.id,
                "name": player.fullName,
                "number": player.primaryNumber
            };
        });
    });

    // transform game information into scoreboard object
    const allGames = gameResponses.map(gameResponse => {
        const game_2 = gameResponse.data;
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
            gameObj.teams.away["pitcher"] = game_2.gameData.teams.away.name === game_2.liveData.linescore.defense.team.name ?
                playerInfo[game_2.liveData.linescore.defense.pitcher.id] : playerInfo[game_2.liveData.linescore.offense.pitcher.id];
            gameObj.teams.home["pitcher"] = game_2.gameData.teams.home.name === game_2.liveData.linescore.defense.team.name ?
                playerInfo[game_2.liveData.linescore.defense.pitcher.id] : playerInfo[game_2.liveData.linescore.offense.pitcher.id];
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

            // if (a.state.status.general === "Live") {
            //     return b.state.inning.number - a.state.inning.number;
            // }

            // Within each game, sort by start time (earliest time first)
            if (a.state.status.general && statusOrder.hasOwnProperty(a.state.status.general)) {
                const gameAStart = a.state.status.start_time.dateTime;
                const gameBStart = b.state.status.start_time.dateTime;
                return gameAStart - gameBStart;
            }

            return 0;
        });

    // transform the game array into a map from game ID to game data
    return allGames.reduce((acc, obj) => {
        acc[obj.id] = obj;
        // delete acc[obj.id].id; // Remove the id property from the copied object
        return acc;
    }, {});
}

export default router;
