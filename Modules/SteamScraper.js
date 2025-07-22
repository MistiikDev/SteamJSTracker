// Libs
import SteamUser from 'steam-user'
import fs from 'fs'
import { diff } from 'json-diff';
import { PasteClient, Publicity, ExpireDate } from "pastebin-api";

import puppeteer from "puppeteer-extra";
import axios from 'axios';
import StealthPlugin from 'puppeteer-extra-plugin-stealth'

puppeteer.use(StealthPlugin())
let user = new SteamUser();
const client = new PasteClient("FXO996-IHObLNl16seBrh_-_tLy60B3Q");

let canPublishForDev = true;

export const AppIdToLink = {
    [2287520]: process.env.STMDBURL,
    [2662750]: process.env.STMDBITPURL,
    [2609630]: process.env.STMDBDLCURL
}

export const AppIdToName = {
    [2287520]: "Help Wanted 2",
    [2662750]: "Into The Pit",
    [2609630]: "Help Wanted 2 DLC"
}

function TraverseArray(InitialArray, CurrentSafety, path = []) {
    if (CurrentSafety > 10) { 
        return [];
    } else {
        CurrentSafety += 1;
        const changes = [];

        for (const key in InitialArray) {
            const newPath = [...path, key];

            if (key.includes("__added")) {
                changes.push({ type: "Added", key: key, value: InitialArray[key], path: newPath.join(' > ') });

            } else if (key.includes("__deleted")) {
                changes.push({ type: "Removed", key: key, value: InitialArray[key], path: newPath.join(' > ') });

            } else if (InitialArray[key].hasOwnProperty("__old") && InitialArray[key].hasOwnProperty("__new")) {
                changes.push({ type: "Modified", key: key, value: InitialArray[key], path: newPath.join(' > ') });

            } else {
                if (typeof InitialArray[key] === "object") {
                    const subChanges = TraverseArray(InitialArray[key], CurrentSafety, newPath);
                    if (subChanges) {
                        changes.push(...subChanges);
                    }
                }
            }
        }

        return changes;
    }
}

export async function RetrieveData(APP_ID, DEPOT_ID, PackageDir, BranchesDir, BranchesInCount, BranchNameParser) {
    const data = fs.readFileSync(PackageDir, 'utf8');
    const AppName = AppIdToName[APP_ID]

    let APP_ID_RESPONSE = await axios.get("https://api.steamcmd.net/v1/info/" + APP_ID + "?pretty=true")
    let DEPOT_ID_RESPONSE = await axios.get("https://api.steamcmd.net/v1/info/" + DEPOT_ID + "?pretty=true")

    let appInfo = APP_ID_RESPONSE.data.data[APP_ID]
    let DLCInfo = DEPOT_ID_RESPONSE.data.data[DEPOT_ID]

    let dlcChangeDate = DLCInfo._change_number
    let depots = appInfo.depots;

    let MainChanges = []
    let NewBranches = []
    let OldBranches = []

    const ParsedData = {}

    let initialData = await JSON.parse(data);
    let DataDuplicate = initialData;

    let DLCJson = initialData["DLC"];
    let MainJSON = initialData["Main"];

    // new branches
    for (const branch in depots.branches) {
        // first register branches
        const parsedBranch = BranchNameParser[branch] != undefined ? BranchNameParser[branch] : branch;
        const branchType = branch.toLowerCase().includes("development") ? "Dev" : "Ship";

        if (!ParsedData[parsedBranch]) {
            ParsedData[parsedBranch] = {};
        }

        ParsedData[parsedBranch][branchType] = new Date(depots.branches[branch].timeupdated * 1000 || 0).toUTCString();

        // Detect new branches
        if (!BranchesInCount.includes(branch)) {
            console.log("New branch : " + branch.toString())

            NewBranches[branch] = branch
            BranchesInCount.push(branch)

            console.log("Branch added : " + parsedBranch.toString())
        }
    }

    // old branches
    for (const branch of BranchesInCount) {
        if (!(depots.branches).hasOwnProperty(branch)) {
            const parsedBranch = BranchNameParser[branch] != undefined ? BranchNameParser[branch] : branch; // Get new name
            const index = BranchesInCount.indexOf(branch);

            if (index > -1) { // might not exist (preferable just in case)
                OldBranches[branch] = branch
                BranchesInCount.splice(index, 1);

                try {
                    delete DataDuplicate["Main"][parsedBranch] // Delete data we dont need anymore
                } catch (error) {
                    console.log("Error during clean off : ", error)
                }
            }

            console.log("Branch removed : " + parsedBranch.toString())
        }
    }

    // branch updates
    if (DLCJson["ChangeID"] != dlcChangeDate) {
        DataDuplicate["DLC"]["LastRecordedChange"] = (new Date(Date.now()).toUTCString())
        DataDuplicate["DLC"]["ChangeID"] = dlcChangeDate

        MainChanges["DLC"] = ["DLC", {
            Ship: DataDuplicate["DLC"]["LastRecordedChange"],
            ChangeID: dlcChangeDate
        }]
    }

    for (const key in ParsedData) {
        const branch = ParsedData[key]
        // Update for shipped depots

        if (branch == "Development") {
            if (canPublishForDev) {
                canPublishForDev = false;

                setTimeout(() => { canPublishForDev = true }, 1000 * 60 * 60 * 3)
            }
        }

        if ((branch == "Development" && canPublishForDev) || branch != "Development") {
            if (branch["Ship"] && branch["Ship"] != "" && MainJSON[key] != undefined) {
                if ((branch["Ship"]) != MainJSON[key]["Ship"]) {
                    MainChanges[key] = [key, branch]
                }
            }

            if (branch["Dev"] && branch["Dev"] != "" && MainJSON[key] != undefined) {
                if (branch["Dev"] != MainJSON[key]["Dev"]) {
                    MainChanges[key] = [key, branch]
                }
            }

            // Override data to be written
            if (DataDuplicate["Main"][key] == undefined) {
                DataDuplicate["Main"][key] = {}
            }

            DataDuplicate["Main"][key]["Ship"] = ParsedData[key]["Ship"];
            DataDuplicate["Main"][key]["Dev"] = ParsedData[key]["Dev"];
        }
    }

    let Override = JSON.stringify(DataDuplicate, null, "\t");
    let BranchOverride = JSON.stringify({ "branches": BranchesInCount }, null, "\t")

    try {
        fs.writeFileSync(PackageDir, Override);
        fs.writeFileSync(BranchesDir, BranchOverride)

        console.log(`APPID : ${APP_ID} check successful, data overwritten. ${AppName ? "(" + AppName + ")" : ""}`);
    }
    catch (error) {
        console.error(error);
    }

    const returnedData = [MainChanges, [NewBranches, OldBranches]]; // [branch_updates, [branch_added_removed]] 

    return returnedData
}

export async function UpdateAppData(APP_ID, CURRENT_DATA_PATH) {
    const AppName = AppIdToName[APP_ID]

    let CurrentData = JSON.parse(fs.readFileSync(CURRENT_DATA_PATH, 'utf-8')); // Parse Old Data to compare
    let response = await axios.get("https://api.steamcmd.net/v1/info/" + APP_ID + "?pretty=true"); // Get new Data from steam

    let APP_ID_DATA = response.data.data;

    let difference = diff(CurrentData, APP_ID_DATA);
    let stringData = ''
    let formatedStrings = {}

    // Loop through all the differences and format into a nice string for each of the app ids
    for (let appId in difference) {
        const changes = difference[appId]; // Index changes for current AppID

        // Format app ID (contains status on diff (added or removed))
        let appIdStatus = ""
        if (appId.includes("__added")) {
            appId = appId.replace("__added", "")
            appIdStatus = "New"
        } else if (appId.includes("__deleted")) {
            appId = appId.replace("__deleted", "")
            appIdStatus = "Deleted"
        }

        formatedStrings[appId] = `${(appIdStatus != "" ? `(${appIdStatus}) ` : "") + appId}:` // Title the current change with app id (XXXX: ...)

        let AppChanges = TraverseArray(changes, 0);

        if (AppChanges) {
            for (const changeData of AppChanges) {
                let changeType = changeData.type;
                let changeKeyName = changeData.key;
                let changeValue = changeData.value;
                let changeKeyAbsolutePath = changeData.path;
        
                changeKeyAbsolutePath = changeKeyAbsolutePath.replace("__added", "");
                changeKeyAbsolutePath = changeKeyAbsolutePath.replace("__deleted", "");
                changeKeyName = changeKeyName.replace("__added", "");
                changeKeyName = changeKeyName.replace("__deleted", "");
        
                let newChange = "";
        
                if (changeType == "Added") {
                    if (typeof(changeValue) == "object") { 
                        changeValue = JSON.stringify(changeValue, null, "\t\t\t");
                    }
                    newChange += `    - ADDED ${changeKeyAbsolutePath}:\n          ↪  ${changeValue}`;
                
                } else if (changeType == "Removed") {
                    if (typeof(changeValue) == "object") { 
                        changeValue = JSON.stringify(changeValue, null, "\t\t\t");
                    }
                    newChange += `    - REMOVED ${changeKeyAbsolutePath}:\n          ↪  ${changeValue}`;
                
                } else if (changeType == "Modified") {
                    newChange += `    - MODIFIED ${changeKeyAbsolutePath}:\n          ↪  ${changeValue.__old} -> ${changeValue.__new}`;
                }
        
                if (newChange != changeKeyAbsolutePath + "\n") {
                    formatedStrings[appId] = formatedStrings[appId] + "\n" + newChange;
                }
            }
        }
    }

    // Format all app ids changes into one string
    for (const dataString in formatedStrings) {
        stringData = stringData + formatedStrings[dataString] + "\n\n"
    }

    // Update current data
    try {
        fs.writeFileSync(CURRENT_DATA_PATH, JSON.stringify(APP_ID_DATA, null, "\t"));
        console.log(`APPID : ${APP_ID} check successful, data overwritten. ${AppName ? "(" + AppName + ")" : ""}`)
    } catch (err) {
        console.log("Error while saving app data files :", err)
    }
    
    if (difference && stringData && stringData != '') {
        console.log(stringData)

        const pasteBin = await client.createPaste({
            code: stringData,
            expireDate: ExpireDate.Never,
            format: "javascript",
            name: `FNAFTracker [${Math.floor(Math.random() * 20)}]: detection for ${APP_ID} ${AppName ? "(" + AppName + ")" : ""}`,
            publicity: Publicity.Public,
        });

		console.log(pasteBin);

        if (pasteBin != null) {
            return [pasteBin, stringData, APP_ID]
        }
    }
    
    return [null, "", APP_ID]
}

export async function UpdateAppDepotData(APP_ID, DLC_DEPOT_ID, CURRENT_DATA_PATH) {
    const AppName = AppIdToName[DLC_DEPOT_ID]

    let CurrentData = JSON.parse(fs.readFileSync(CURRENT_DATA_PATH, 'utf-8')); // Parse Old Data to compare
    let response = await axios.get("https://api.steamcmd.net/v1/info/" + APP_ID + "?pretty=true"); // Get new Data from steam

    let APP_ID_RESPONSE = response.data.data;

    let APP_ID_DATA = APP_ID_RESPONSE[APP_ID]
    let DLC_DEPOT_DATA = APP_ID_DATA.depots;

    const difference = diff(CurrentData, DLC_DEPOT_DATA)

    let stringData = ''
    let formatedStrings = {}

    if (difference) {
        // For now only one depot, but code may be adapted to other structures later.
        for (let depot_id in difference) {
            if (depot_id != DLC_DEPOT_ID) {
                continue // not interested
            }
            let changes = difference[depot_id]

            // Format Depot ID (contains status on diff (added or removed)) if so, remove from identifier and register a new variable to keep track
            let depotIdStatus = ""

            if (depot_id.includes("__added")) {
                depot_id = depot_id.replace("__added", "")
                depotIdStatus = "New"
            } else if (depot_id.includes("__deleted")) {
                depot_id = depot_id.replace("__deleted", "")
                depotIdStatus = "Deleted"
            }

            formatedStrings[depot_id] = `${(depotIdStatus != "" ? `(${depotIdStatus}) ` : "") + depot_id}:` // Title the current change with depot id (Added / Removed / Nothing) XXXX: ...

            let DepotChanges = TraverseArray(changes, 0);

            if (DepotChanges) {
                for (const changeData of DepotChanges) {
                    let changeType = changeData.type;
                    let changeKeyName = changeData.key;
                    let changeValue = changeData.value;
                    let changeKeyAbsolutePath = changeData.path;
            
                    changeKeyAbsolutePath = changeKeyAbsolutePath.replace("__added", "");
                    changeKeyAbsolutePath = changeKeyAbsolutePath.replace("__deleted", "");
                    changeKeyName = changeKeyName.replace("__added", "");
                    changeKeyName = changeKeyName.replace("__deleted", "");
            
                    let newChange = "";
            
                    if (changeType == "Added") {
                        if (typeof(changeValue) == "object") { 
                            changeValue = JSON.stringify(changeValue, null, "\t\t\t");
                        }
                        newChange += `    - ADDED ${changeKeyAbsolutePath}:\n          ↪  ${changeValue}`;
                    
                    } else if (changeType == "Removed") {
                        if (typeof(changeValue) == "object") { 
                            changeValue = JSON.stringify(changeValue, null, "\t\t\t");
                        }
                        newChange += `    - REMOVED ${changeKeyAbsolutePath}:\n          ↪  ${changeValue}`;
                    
                    } else if (changeType == "Modified") {
                        newChange += `    - MODIFIED ${changeKeyAbsolutePath}:\n          ↪  ${changeValue.__old} -> ${changeValue.__new}`;
                    }
            
                    if (newChange != changeKeyAbsolutePath + "\n") {
                        formatedStrings[depot_id] = formatedStrings[depot_id] + "\n" + newChange;
                    }
                }
            }
        }
    }


    // Format all app ids changes into one string
    for (const dataString in formatedStrings) {
        stringData = stringData + formatedStrings[dataString] + "\n\n"
    }

    // Update current data
    try {
        fs.writeFileSync(CURRENT_DATA_PATH, JSON.stringify(DLC_DEPOT_DATA, null, "\t"));
        console.log(`DEPOT ID : ${DLC_DEPOT_ID} check successful, data overwritten. ${AppName ? "(" + AppName + ")" : ""}`)
    } catch (err) {
        console.log("Error while saving app data files :", err)
    }
    
    
    if (difference && stringData && stringData != '') {
        console.log(stringData)
        
        const pasteBin = await client.createPaste({
            code: stringData,
            expireDate: ExpireDate.Never,
            format: "javascript",
            name: `TEST FNAFTracker [${Math.floor(Math.random() * 20)}]: detection for ${DLC_DEPOT_ID} ${AppName ? "(" + AppName + ")" : ""}`,
            publicity: Publicity.Public,
        });
        
        
        console.log(pasteBin)

        if (pasteBin != null) {
            return [pasteBin, stringData, DLC_DEPOT_ID]
        }
    }
    
    return [null, "", DLC_DEPOT_ID]
}

export async function DisconnectUser() {
    if (user) {
        user.logOff();
    }
}

export const ss_name = "SteamSDKScrapper"
export const ss_description = "Scraps Steam API for SB Packages, Builds and Depots."