import axios from "axios";
import { response } from "express";

export function getAPIResponse(requestUrl: string) {
    let responseSplits: any = [];

    return axios
        .get(encodeURI(requestUrl))
        .then((response: any) => {
            responseSplits = response.data.stats[0].splits;
            // if we have too many results from the API, batch the remaining results and send them off
            if (
                response.data.stats[0].totalSplits >
                response.data.stats[0].splits.length
            ) {
                let batchRequests: Promise<any>[] = [];
                for (
                    let batchStart = response.data.stats[0].splits.length;
                    batchStart < response.data.stats[0].totalSplits;
                    batchStart += response.data.stats[0].splits.length
                ) {
                    batchRequests.push(
                        axios.get(
                            encodeURI(`${requestUrl}&offset=${batchStart}`)
                        )
                    );
                }
                return Promise.all(batchRequests);
            } else {
                return [];
            }
        })
        .then((resArray) => {
            resArray.forEach((batchedResponse) => {
                responseSplits = responseSplits.concat(
                    batchedResponse.data.stats[0].splits
                );
            });
        })
        .then(() => {
            return responseSplits;
        })
        .catch((err) => {
            throw new Error(err);
        });
}
