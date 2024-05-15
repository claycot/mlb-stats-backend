// our objective when caching data is to reduce the amount of calls to the MLB API
// each user should be seeing the same data regardless of how many sessions are open
// the data should never be more than 30 seconds old

import { promises as fs } from "fs";
import path from "path";

export default class Cache {
    private fetchData: Function; // function that fetches the cache data, used when the cache has to refresh itself

    private name: string; // name of the cache, for logging
    private fileName: string; // name of the file on disk, for read/write ops

    private data: any = null; // the data! the most important part of the cache
    private date: Date = new Date(); // date when data was generated, this is important because we never want >30 seconds age
    private maxAge: number = 30; // age in seconds when a new read should refresh the cache

    private locked: boolean = false; // lock controls whether or not the data is available to write or modify
    private lockDate: Date = new Date(); // tracks when the lock was created, so it can be unlocked if failure occurs
    private maxLock: number = 15; // duration in seconds that the cache can be locked

    private valid: boolean = false; // boolean to hold data validity
    private maxRetries: number = 25; // maximum number of retries on cache read


    // when the cache is constructed, assign it a name and a function for getting the data
    // note that the data won't actually be ready until refresh() completes
    constructor(name: string, maxAge: number, fetchData: Function) {
        console.log(`[${name}] Cache creation in progress!`);
        this.name = name; // name the cache
        this.fileName = `cache-${name}.json`; // and its name on disk
        this.maxAge = maxAge; // set the number of seconds before the cache refreshes

        this.fetchData = fetchData; // copy the data fetching function to the cache
    }

    // redefine how the data is fetched
    redefine(newFetchData: Function) {
        if (this.isLocked()) {
            throw new Error(`[${this.name}] Cache is locked. Please wait and try again`);
        }
        else {
            this.lock();
            this.fetchData = newFetchData;
            this.invalidate();
            this.unlock();
        }
    }

    // set new max age, useful for when game state changes
    setMaxAge(newMaxAge: number) {
        this.maxAge = newMaxAge;
    }

    // read data from the cache, limiting the number of retries before failure
    read(numRetries: number = 0): Promise<any> {
        // if there is valid data in the cache object, return that
        const validData = this.getValidData();
        if (validData !== false) {
            return Promise.resolve({ "metadata": { "timestamp": this.date }, "data": validData });
        }
        // otherwise, refresh the cache and read on completion
        else if (numRetries <= this.maxRetries) {
            return this.refresh()
                .then(_ => {
                    return this.read(numRetries + 1);
                })
        }
        else {
            throw new Error(`[${this.name}] Failed to read data from cache.`);
        }
    }

    // refresh data into the cache, which means setting it in this.data and saving it in the cache file
    private refresh(): Promise<boolean> {
        // if the cache is locked and their lock lease hasn't run out, someone is modifying it
        if (this.isLocked()) {
            return Promise.reject(false);
            // throw new Error(`[${this.name}] Cache is locked. Please wait and try again.`);
        }
        // otherwise, save the data into the object and mirror it to file
        else {
            // lock the cache first
            this.lock();

            // run the fetchData function and save data into the cache
            return this.fetchData()
                .then(freshData => {
                    // set the data and track the date of the data in the cache
                    this.setData(freshData);

                    // async mirror the data into a file
                    fs.writeFile(path.join(__dirname, "..", "data", this.fileName),
                        JSON.stringify(freshData),
                        {
                            flag: "w"
                        }
                    ).catch(err => {
                        // log file write errors
                        console.error(`[${this.name}] Error saving cache data to file: ${err}`);
                    });

                    // notify the user that the data is ready
                    return true;
                })
                // throw any error cases that may arise
                .catch(err => {
                    throw err;
                })
                // in success or error, unlock the cache if we've made it to this point
                .finally(_ => {
                    this.unlock();
                })
        }
    }

    // // set the arguments for a data fetch, usually just [date]
    // setFetchDataArgs(fetchDataArgs: any[]) {
    //     // lock the cache so nobody is messing with the args
    //     this.lock();

    //     // reject the change if the args don't match the len or data type of the current args
    //     let errMsg: string = "";
    //     if (fetchDataArgs.length !== this.fetchDataArgs.length) {
    //         errMsg = `invalid number of args provided`;
    //     }
    //     for (let i = 0; i < this.fetchDataArgs.length; i++) {
    //         if (typeof fetchDataArgs[i] !== typeof this.fetchDataArgs[i]) {
    //             errMsg = `invalid data provided for arg at index ${i}`;
    //             break;
    //         }
    //     }

    //     // if either test failed, throw an err
    //     if (errMsg !== "") {
    //         this.unlock();
    //         throw (`[${this.name}] Error updating fetchDataArgs, ${errMsg}!`);
    //     }
    //     // if those tests pass, set the args!
    //     else {
    //         this.fetchDataArgs = fetchDataArgs;
    //         this.unlock();
    //         this.invalidate();
    //         return true;
    //     }
    // }

    // // load data into the object from a file
    // load() {
    //     // if the file is locked, don't modify the data
    //     if (this.locked) {
    //         throw new Error("Cache is locked. Please wait and try again.");
    //     }
    //     else {
    //         // lock the cache
    //         this.locked = true;

    //         // read the file
    //         fs.readFile(path.join(__dirname, "..", "data", this.fileName),
    //             // once the file write is finished, handle error or success
    //             (err, data) => {
    //                 if (err) {
    //                     this.locked = false;
    //                     console.log(err);
    //                     throw new Error("Error saving cache data to file.");
    //                 }
    //                 // once the data is saved, unlock the cache and return the new date
    //                 else {
    //                     this.date = new Date();
    //                     this.locked = false;
    //                     return this.date;
    //                 }
    //             }
    //         );
    //     }
    // }

    // compare candidate data with the data in the object
    compare() {

    }

    // retrieve the age of the cache in seconds
    private getAge() {
        return (new Date().valueOf() - this.date.valueOf()) / 1000;
    }

    // lock the cache and record the lock date
    private lock() {
        this.locked = true;
        this.lockDate = new Date();
    }

    // unlock the cache
    private unlock() {
        this.locked = false;
    }

    // retrieve lock status
    private isLocked() {
        // it's locked only if the lock status is true AND the lock lease hasn't expired
        return (
            this.locked &&
            (((new Date().valueOf() - this.lockDate.valueOf()) / 1000) < this.maxLock)
        );
    }

    // set the data in the cache and track its age
    private setData(data: any) {
        this.data = data;
        this.date = new Date();
        this.valid = true;
    }

    // invalidate the cache data, if parameters have changed or the fetch did something bad
    private invalidate() {
        this.valid = false;
    }

    // get valid data from the cache, returning either data or false
    private getValidData() {
        // if there is data in the cache and it's not expired, return it
        if (this.data !== null && this.valid && this.getAge() < this.maxAge) {
            return this.data;
        }
        // otherwise, return false
        else {
            return false;
        }
    }

}