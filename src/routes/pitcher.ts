import { mlbApi } from "../constants/constants";
import express, { NextFunction, Request, Response } from "express";
import axios from "axios";
import { getAPIResponse } from "../util/apiRequest";
const router = express.Router();

// get stats for all pitchers in a given season
router.get("/list/:season_year", (req: Request, res: Response, next: NextFunction) => {
    let apiString = `${mlbApi.url}/api/v1/stats?stats=season&playerPool=all&group=pitching&season=${req.params.season_year}&limit=1000`;
    let playersObj = {};
    getAPIResponse(apiString)
        .then((players) => {
            // res.json(players);
            let playersPromises = players
                .filter((player) => {
                    player.stat["qualityStarts"] = 0;
                    playersObj[player.player.id] = player;
                    return player.stat.gamesStarted;
                })
                .map((player) => {
                    return axios.get(
                        `${mlbApi.url}/api/v1/people?personIds=${player.player.id}&hydrate=stats(group=[pitching],type=[gameLog],sitCodes=[sp],season=${req.params.season_year})&fields=people,id,fullName,stats,splits,stat,gamesStarted,inningsPitched,earnedRuns`
                    );
                });
            return Promise.all(playersPromises);
        })
        .then((playersGamesResponses) => {
            playersGamesResponses.forEach((response) => {
                response.data.people.forEach((player) => {
                    let qs = player.stats[0].splits.filter((appearance) => {
                        return (
                            appearance.stat.gamesStarted === 1 &&
                            parseInt(appearance.stat.inningsPitched, 10) >=
                            6 &&
                            appearance.stat.earnedRuns <= 3
                        );
                    }).length;
                    playersObj[player.id].stat["qualityStarts"] = qs;
                });
            });
            res.json(playersObj);
            // res.json(Object.keys(playersObj).map(playerID => {
            //     return {
            //         "id": playerID,
            //         "name": playersObj[playerID].player.fullName,
            //         "qs": playersObj[playerID].stat.qualityStarts
            //     };
            // }).sort((a, b) => { return b.qs - a.qs; }));
        })
        .catch((err) => {
            next(err);
        });
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
