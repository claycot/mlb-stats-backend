import { mlbApi } from "../constants/constants";
import express, { NextFunction, Request, Response } from "express";
import axios from "axios";
import fs from "fs";
import path from "path";
import { getAPIResponse } from "../util/apiRequest";
import { customRound } from "../util/math";
const router = express.Router();

// get stats for all pitchers in a given season
router.get("/list/:season_year", (req: Request, res: Response, next: NextFunction) => {
    // fetch all pitchers in a given season
    let apiString = `${mlbApi.url}/api/v1/stats?stats=season&playerPool=all&group=pitching&season=${req.params.season_year}&limit=1000`;
    let playersObj = {};
    getAPIResponse(apiString)
        .then((players) => {
            let playersPromises = players
                // for each player, create derived stats of 0, and for anyone who started at least 1 game, promise to find their QS, NH, PG totals
                .filter((player) => {
                    player.stat["qualityStarts"] = 0;
                    player.stat["noHitters"] = 0;
                    player.stat["perfectGames"] = 0;
                    playersObj[player.player.id] = player;
                    return player.stat.gamesStarted;
                })
                // find the starts for each player who started at least 1 game
                .map((player) => {
                    return axios.get(
                        `${mlbApi.url}/api/v1/people?personIds=${player.player.id}&hydrate=stats(group=[pitching],type=[gameLog],sitCodes=[sp],season=${req.params.season_year})&fields=people,id,fullName,stats,splits,stat,gamesStarted,inningsPitched,earnedRuns,completeGames,hits,battersFaced,strikeOuts,groundOuts,airOuts`
                    );
                });

            // pass the start promise to the next then block
            return Promise.all(playersPromises);
        })
        .then((playersGamesResponses) => {
            // loop over each player to find their QS, NH, PG totals
            playersGamesResponses.forEach((response) => {
                response.data.people.forEach((player) => {
                    let qs = 0;
                    let nh = 0;
                    let pg = 0;
                    player.stats[0].splits.forEach((appearance) => {
                        // count a QS if the starter went at least 6 IP and had 3 or fewer ER
                        if (
                            appearance.stat.gamesStarted === 1 &&
                            parseInt(appearance.stat.inningsPitched, 10) >= 6 &&
                            appearance.stat.earnedRuns <= 3
                        ) { qs += 1 };

                        // count a NH if the starter finished the game with 0 hits
                        if (
                            appearance.stat.gamesStarted === 1 &&
                            appearance.stat.completeGames === 1 &&
                            appearance.stat.hits === 0
                        ) {
                            nh += 1;

                            // additionally, count a PG if the starter finished the game with as many outs as batters faced
                            if (
                                appearance.stat.battersFaced === (appearance.stat.strikeOuts + appearance.stat.groundOuts + appearance.stat.airOuts)
                            ) { pg += 1 };
                        };
                    });

                    // save the stats
                    playersObj[player.id].stat["qualityStarts"] = qs;
                    playersObj[player.id].stat["noHitters"] = nh;
                    playersObj[player.id].stat["perfectGames"] = pg;
                });
            });
            fs.writeFile(path.join(__dirname, "..", "cache", "data", `pitcher-data-${req.params.season_year}.json`),
                JSON.stringify(playersObj),
                {
                    flag: "w"
                },
                () => {
                    res.json(playersObj);
                }
            );
        })
        .catch((err) => {
            next(err);
        });
});

// calculate points for all pitchers in a given season
router.get("/list/:season_year/points", (req: Request, res: Response, next: NextFunction) => {
    // TODO: replace this with a query string
    const pointSystem = {
        "inningsPitched": 3,
        "hits": -1,
        "earnedRuns": -2,
        "baseOnBalls": -1,
        "strikeOuts": 1,
        // "pickoffs": 1,
        // "qualityStarts": 3,
        // "completeGames": 10,
        // "noHitters": 10,
        // "perfectGames": 10,
        "wins": 2,
        "losses": -2,
        // "saveOpportunities": 2,
        "saves": 5,
        // "blownSaves": -2,
        "holds": 2
    };

    // fetch all pitchers in a given season
    let playersBuffer = fs.readFileSync(
        path.join(__dirname, "..", "cache", "data", `pitcher-data-${req.params.season_year}.json`),
        {
            flag: "r"
        }
    );
    let playersJSON = JSON.parse(playersBuffer.toString());
    let playersPoints = {};
    let playersPointsArr: any = [];
    Object.keys(playersJSON)
        .forEach(playerID => {
            let points = 0;
            let scoringObj = {};
            Object.keys(pointSystem).forEach(category => {
                // points += customRound(pointSystem[category] * playersJSON[playerID].stat[category], 2);
                points += customRound(pointSystem[category] * playersJSON[playerID].stat[category], 4);
                scoringObj[category] = playersJSON[playerID].stat[category];
            });
            playersPoints[playersJSON[playerID].player.fullName + ", " + playersJSON[playerID].team.name] = points;
            playersPointsArr.push({
                "name": playersJSON[playerID].player.fullName,
                "team": playersJSON[playerID].team.name,
                "points": customRound(points, 2)
            });
        });
    res.json(playersPointsArr.sort((a, b) => { return b.points - a.points }));
});

// list information about a given pitcher in a given season
router.get("/player", (req: Request, res: Response, next: NextFunction) => {
    let apiString = `${mlbApi.url}/api/v1/people?personIds=605151,592450&hydrate=stats(group=[pitching],type=[gameLog],sitCodes=[sp],season=2023)&fields=people,id,fullName,stats,splits,stat,inningsPitched,earnedRuns`;
    getAPIResponse(apiString)
        .then((splits) => {
            res.json(splits);
        })
        .catch((err) => {
            next(err);
        });
});

export default router;
