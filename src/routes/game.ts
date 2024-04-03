import { mlbApi } from "../constants/constants";
import express, { NextFunction, Request, Response } from "express";
import axios from "axios";
const router = express.Router();

// list status of today's games
router.get("/list", (req: Request, res: Response, next: NextFunction) => {
    // make a string of the current date in the format MM/DD/YYYY
    const today_date = new Date().toLocaleDateString("en-US");
    // fetch today's games
    let apiString = `${mlbApi.url}/api/v1/schedule/?sportId=1&date=${today_date}`;

    axios.get(apiString)
        // the query will return a list of today's games
        .then((response) => {
            // return a promise to get the individual information of each game today
            return Promise.all(response.data.dates[0].games.map(game => {
                return axios.get(`${mlbApi.url}${game.link}`);
            }));
        })
        // after all of the games have responded, get information on relevant players
        .then((gameResponses) => {
            let playersToQuery: any = [];
            gameResponses.forEach(gameResponse => {
                const game = gameResponse.data;
                // if the game is scheduled, fetch information on...
                if (game.gameData.status.abstractGameState === "Preview") {
                    // 1. probable pitchers
                    if (game.gameData.probablePitchers.hasOwnProperty("away")) {
                        playersToQuery.push(game.gameData.probablePitchers.away.link);
                    }
                    if (game.gameData.probablePitchers.hasOwnProperty("home")) {
                        playersToQuery.push(game.gameData.probablePitchers.home.link);
                    }
                }

                // if the game is live, fetch information on...
                else if (game.gameData.status.abstractGameState === "Live") {
                    // 1. current pitchers
                    playersToQuery.push(game.liveData.linescore.offense.pitcher.link);
                    playersToQuery.push(game.liveData.linescore.defense.pitcher.link);
                    // 2. current runners
                    const bases = {
                        "first": false,
                        "second": false,
                        "third": false
                    };
                    Object.keys(bases).forEach(baseName => {
                        if (game.liveData.linescore.offense.hasOwnProperty(baseName)) {
                            playersToQuery.push(game.liveData.linescore.offense[baseName].link);
                        }
                    });

                }

                // if the game is final, fetch information on...
                else if (game.gameData.status.abstractGameState === "Final") {
                    // 1. winning/losing pitcher
                    if (game.liveData.hasOwnProperty("decisions")) {
                        playersToQuery.push(game.liveData.decisions.winner.link);
                        playersToQuery.push(game.liveData.decisions.loser.link);
                    }
                }
            });

            // return a promise to get the individual information of each game today
            return Promise.all([
                Promise.resolve(gameResponses),
                Promise.all(playersToQuery.map(playerLink => {
                    return axios.get(`${mlbApi.url}${playerLink}`);
                }))
            ]);
        })
        // build objects with their information
        .then(([gameResponses, playerResponses]) => {
            let playerInfo = {
                "-1": { "name": "TBD", "number": -1 }
            };
            playerResponses.forEach(playerResponse => {
                const player = playerResponse.data.people[0];
                playerInfo[player.id] = { "name": player.fullName, "number": player.primaryNumber };
            });

            res.json(gameResponses
                .map(gameResponse => {
                    const game = gameResponse.data;
                    // for every game, fetch information on...
                    const gameObj = {
                        // 1. game state
                        // 2. start time
                        "state": {
                            "status": {
                                "general": game.gameData.status.abstractGameState,
                                "detailed": game.gameData.status.detailedState,
                                "start_time": {
                                    "display": `${game.gameData.datetime.time} ${game.gameData.datetime.ampm}`,
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
                        gameObj.teams.away["pitcher"] = game.liveData.linescore.isTopInning ? playerInfo[game.liveData.linescore.offense.pitcher.id] : playerInfo[game.liveData.linescore.defense.pitcher.id];
                        gameObj.teams.home["pitcher"] = game.liveData.linescore.isTopInning ? playerInfo[game.liveData.linescore.defense.pitcher.id] : playerInfo[game.liveData.linescore.offense.pitcher.id];
                        // 3. current runners
                        gameObj.state["diamond"] = {
                            "first": false,
                            "second": false,
                            "third": false
                        };
                        Object.keys(gameObj.state["diamond"]).forEach(baseName => {
                            if (game.liveData.linescore.offense.hasOwnProperty(baseName)) {
                                gameObj.state["diamond"][baseName] = playerInfo[game.liveData.linescore.offense[baseName].id];
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
                })
            );
        })
        .catch((err) => {
            next(err);
        });
});

export default router;
