"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const constants_1 = require("../constants/constants");
const express_1 = __importDefault(require("express"));
// import axios from "axios";
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const apiRequest_1 = require("../util/apiRequest");
const math_1 = require("../util/math");
const router = express_1.default.Router();
// get stats for all hitters in a given season
router.get("/list/:season_year", (req, res, next) => {
    // fetch all hitters in a given season
    let apiString = `${constants_1.mlbApi.url}/api/v1/stats?stats=season&playerPool=all&group=hitting&season=${req.params.season_year}&limit=1000`;
    let playersObj = {};
    (0, apiRequest_1.getPlayerAPIResponse)(apiString)
        .then((players) => {
        players.forEach((player) => {
            player.stat["singles"] = player.stat["hits"] - player.stat["doubles"] - player.stat["triples"] - player.stat["homeRuns"];
            playersObj[player.player.id] = player;
        });
        fs_1.default.writeFile(path_1.default.join(__dirname, "..", "cache", "data", `hitter-data-${req.params.season_year}.json`), JSON.stringify(playersObj), {
            flag: "w"
        }, () => {
            res.json(playersObj);
        });
    })
        .catch((err) => {
        next(err);
    });
});
// calculate points for all hitters in a given season
router.get("/list/:season_year/points", (req, res, next) => {
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
    let playersBuffer = fs_1.default.readFileSync(path_1.default.join(__dirname, "..", "cache", "data", `hitter-data-${req.params.season_year}.json`), {
        flag: "r"
    });
    let playersJSON = JSON.parse(playersBuffer.toString());
    let playersPoints = {};
    let playersPointsArr = [];
    Object.keys(playersJSON)
        .forEach(playerID => {
        let points = 0;
        Object.keys(pointSystem).forEach(category => {
            points += (0, math_1.customRound)(pointSystem[category] * playersJSON[playerID].stat[category], 2);
        });
        playersPoints[playersJSON[playerID].player.fullName + ", " + playersJSON[playerID].team.name] = points;
        playersPointsArr.push({
            "name": playersJSON[playerID].player.fullName,
            "team": playersJSON[playerID].team.name,
            "points": points
        });
    });
    res.json(playersPointsArr.sort((a, b) => { return b.points - a.points; }));
});
// list information about a given hitter in a given season
router.get("/player", (req, res, next) => {
    let apiString = `${constants_1.mlbApi.url}/api/v1/people?personIds=605151,592450&hydrate=stats(group=[pitching],type=[gameLog],sitCodes=[sp],season=2023)&fields=people,id,fullName,stats,splits,stat,inningsPitched,earnedRuns`;
    (0, apiRequest_1.getPlayerAPIResponse)(apiString)
        .then((splits) => {
        res.json(splits);
    })
        .catch((err) => {
        next(err);
    });
});
exports.default = router;
