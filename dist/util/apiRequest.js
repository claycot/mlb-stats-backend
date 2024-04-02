"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPlayerAPIResponse = void 0;
const axios_1 = __importDefault(require("axios"));
function getPlayerAPIResponse(requestUrl) {
    let responseSplits = [];
    return axios_1.default
        .get(encodeURI(requestUrl))
        .then((response) => {
        responseSplits = response.data.stats[0].splits;
        // if we have too many results from the API, batch the remaining results and send them off
        if (response.data.stats[0].totalSplits >
            response.data.stats[0].splits.length) {
            let batchRequests = [];
            for (let batchStart = response.data.stats[0].splits.length; batchStart < response.data.stats[0].totalSplits; batchStart += response.data.stats[0].splits.length) {
                batchRequests.push(axios_1.default.get(encodeURI(`${requestUrl}&offset=${batchStart}`)));
            }
            return Promise.all(batchRequests);
        }
        else {
            return [];
        }
    })
        .then((resArray) => {
        resArray.forEach((batchedResponse) => {
            responseSplits = responseSplits.concat(batchedResponse.data.stats[0].splits);
        });
    })
        .then(() => {
        return responseSplits;
    })
        .catch((err) => {
        throw new Error(err);
    });
}
exports.getPlayerAPIResponse = getPlayerAPIResponse;
