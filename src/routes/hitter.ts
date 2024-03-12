import { mlbApi } from "../constants/constants";
import express, { NextFunction, Request, Response } from "express";
// import axios from "axios";
import fs from "fs";
import path from "path";
import { getAPIResponse } from "../util/apiRequest";
import { customRound } from "../util/math";
const router = express.Router();

// get stats for all hitters in a given season
router.get("/list/:season_year", (req: Request, res: Response, next: NextFunction) => {
    // fetch all hitters in a given season
    let apiString = `${mlbApi.url}/api/v1/stats?stats=season&playerPool=all&group=hitting&season=${req.params.season_year}&limit=1000`;
    let playersObj = {};
    getAPIResponse(apiString)
        .then((players) => {
            players.forEach((player) => {
                player.stat["singles"] = player.stat["hits"] - player.stat["doubles"] - player.stat["triples"] - player.stat["homeRuns"];
                playersObj[player.player.id] = player;
            });
            fs.writeFile(path.join(__dirname, "..", "cache", "data", `hitter-data-${req.params.season_year}.json`),
                JSON.stringify(playersObj),
                {
                    flag: "w"
                },
                () => {
                    res.json(playersObj);
                }
            );
        })
        // .then((players) => {
        //     let playersPromises = players
        //         // for each player, create a qualityStarts stat of 0, and for anyone who started at least 1 game, promise to find their QS totals
        //         .filter((player) => {
        //             player.stat["qualityStarts"] = 0;
        //             playersObj[player.player.id] = player;
        //             return player.stat.gamesStarted;
        //         })
        //         // find the starts for each player who started at least 1 game
        //         .map((player) => {
        //             return axios.get(
        //                 `${mlbApi.url}/api/v1/people?personIds=${player.player.id}&hydrate=stats(group=[pitching],type=[gameLog],sitCodes=[sp],season=${req.params.season_year})&fields=people,id,fullName,stats,splits,stat,gamesStarted,inningsPitched,earnedRuns`
        //             );
        //         });

        //     // pass the start promise to the next then block
        //     return Promise.all(playersPromises);
        // })
        // .then((playersGamesResponses) => {
        //     // loop over each player to find their QS totals
        //     playersGamesResponses.forEach((response) => {
        //         response.data.people.forEach((player) => {
        //             // count a QS if the starter went at least 6 IP and had 3 or fewer ER
        //             let qs = player.stats[0].splits.filter((appearance) => {
        //                 return (
        //                     appearance.stat.gamesStarted === 1 &&
        //                     parseInt(appearance.stat.inningsPitched, 10) >= 6 &&
        //                     appearance.stat.earnedRuns <= 3
        //                 );
        //             }).length;

        //             // save the stat
        //             playersObj[player.id].stat["qualityStarts"] = qs;
        //         });
        //     });
        //     res.json(playersObj);
        // })
        .catch((err) => {
            next(err);
        });
});

// calculate points for all hitters in a given season
router.get("/list/:season_year/points", (req: Request, res: Response, next: NextFunction) => {
    // TODO: replace this with a query string
    const pointSystem = {
        "atBats": -0.2,
        "hits": 1,
        "runs": 1,
        "singles": 1,
        "doubles": 2,
        "triples": 3,
        "homeRuns": 4,
        "rbi": 1,
        "baseOnBalls": 1,
        "strikeOuts": -1,
        "stolenBases": 2,
        "caughtStealing": 1
    };

    // fetch all hitters in a given season
    let playersBuffer = fs.readFileSync(
        path.join(__dirname, "..", "cache", "data", `hitter-data-${req.params.season_year}.json`),
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
            Object.keys(pointSystem).forEach(category => {
                points += customRound(pointSystem[category] * playersJSON[playerID].stat[category], 2);
            });
            playersPoints[playersJSON[playerID].player.fullName + ", " + playersJSON[playerID].team.name] = points;
            playersPointsArr.push({
                "name": playersJSON[playerID].player.fullName,
                "team": playersJSON[playerID].team.name,
                "points": points
            });
        });
    res.json(playersPointsArr.sort((a, b) => { return b.points - a.points }));
    // getAPIResponse(apiString)
    //     .then((players) => {
    //         players.forEach((player) => {
    //             playersObj[player.player.id] = player;
    //         });
    //         fs.writeFile(path.join(__dirname, "..", "cache", "data", `hitter-data-${req.params.season_year}.json`),
    //             JSON.stringify(playersObj),
    //             {
    //                 flag: "w"
    //             },
    //             () => {
    //                 res.json(playersObj);
    //             }
    //         );
    //     })
    //     .catch((err) => {
    //         next(err);
    //     });
});

// list information about a given hitter in a given season
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
