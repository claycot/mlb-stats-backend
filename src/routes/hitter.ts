import { mlbApi } from "../constants/constants";
import express, { NextFunction, Request, Response } from "express";
// import axios from "axios";
import fs from "fs";
import path from "path";
import { getPlayerAPIResponse } from "../util/apiRequest";
import { customRound } from "../util/math";
const router = express.Router();

// get stats for all hitters in a given season
router.get("/list/:season_year", (req: Request, res: Response, next: NextFunction) => {
    // fetch all hitters in a given season
    let apiString = `${mlbApi.url}/api/v1/stats?stats=season&playerPool=all&group=hitting&season=${req.params.season_year}&limit=1000`;
    let playersObj = {};
    getPlayerAPIResponse(apiString)
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
        .catch((err) => {
            next(err);
        });
});

// calculate points for all hitters in a given season
router.get("/list/:season_year/points", (req: Request, res: Response, next: NextFunction) => {
    // TODO: replace this with a query string
    const pointSystem = {
        // "atBats": -0.2,
        // "hits": 1,
        "runs": 1,
        "singles": 1,
        "doubles": 2,
        "triples": 3,
        "homeRuns": 4,
        "rbi": 1,
        "baseOnBalls": 1,
        "strikeOuts": -1,
        "stolenBases": 1,
        // "caughtStealing": 1
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
});

// list information about a given hitter in a given season
router.get("/player", (req: Request, res: Response, next: NextFunction) => {
    let apiString = `${mlbApi.url}/api/v1/people?personIds=605151,592450&hydrate=stats(group=[pitching],type=[gameLog],sitCodes=[sp],season=2023)&fields=people,id,fullName,stats,splits,stat,inningsPitched,earnedRuns`;
    getPlayerAPIResponse(apiString)
        .then((splits) => {
            res.json(splits);
        })
        .catch((err) => {
            next(err);
        });
});

export default router;
