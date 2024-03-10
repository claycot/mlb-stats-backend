import { mlbApi } from "../constants/constants";
import express, { NextFunction, Request, Response } from "express";
import { getAPIResponse } from "../util/apiRequest";
const router = express.Router();

// list stats for all pitchers in a given season
router.get("/list", (req: Request, res: Response, next: NextFunction) => {
    let apiString = `${mlbApi.url}/api/v1/stats?stats=season&playerPool=all&group=pitching&season=2023&limit=1000`;
    getAPIResponse(apiString)
        .then((splits) => {
            res.json(splits);
        })
        .catch((err) => {
            next(err);
        });
});

// list information about a given pitcher in a given season
router.get("/player", (req: Request, res: Response, next: NextFunction) => {
    let apiString = `${mlbApi.url}/api/v1/stats?stats=season&playerPool=all&group=pitching&season=2023&limit=1000`;
    getAPIResponse(apiString)
        .then((splits) => {
            res.json(splits);
        })
        .catch((err) => {
            next(err);
        });
});

export default router;
