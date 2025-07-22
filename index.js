import { ETwitterStreamEvent, TweetStream, TwitterApi, ETwitterApiError } from 'twitter-api-v2';

import dotenv from 'dotenv';
import fs from 'fs';

// Module import
import { LinkToDir, SShotPromise } from './Modules/WebScraper.js'
import { AppIdToLink, AppIdToName, UpdateAppData, RetrieveData, DisconnectUser, UpdateAppDepotData } from './Modules/SteamScraper.js'

dotenv.config();

const limit = 60
const Hashtags = "\n\n#FNAF #HelpWanted2"
let dailyTweets = 0

export const HW2_PACKAGES = "./Data/HW2_PACKAGES.json"
export const HW2_BRANCHES = "./Data/HW2_BRANCHES.json"

export const HW2_BranchFilter = JSON.parse(fs.readFileSync("./Data/HW2_BRANCHFILTER.json", "utf-8")).filter
export const HW2_BranchNameParser = JSON.parse(fs.readFileSync("./Data/HW2_NAMEPARSER.json", "utf-8"))
export const HW2_BranchesInCount = JSON.parse(fs.readFileSync("./Data/HW2_BRANCHES.json", "utf-8")).branches

// Utils
export function getTimeUnit(milliseconds) {
    const units = [
        { name: "ms", multiplier: 1 },
        { name: "s", multiplier: 1000 },
        { name: "min", multiplier: 1000 * 60 },
        { name: "h", multiplier: 1000 * 60 * 60 },
        { name: "d", multiplier: 1000 * 60 * 60 * 24 }
    ];

    let result = "";
    let value = 0;

    // Iterate through the time units
    for (let i = units.length - 1; i >= 0; i--) {
        const unit = units[i];
        if (milliseconds >= unit.multiplier) {
            // If the milliseconds value is greater than or equal to the current unit's multiplier,
            // set the result to the value of the milliseconds divided by the multiplier, rounded to 2 decimal places,
            // and set the value to the current unit's multiplier
            result = (milliseconds / unit.multiplier).toFixed(2) + " " + unit.name;
            value = unit.multiplier;
            break;
        }
    }

    return { result, value };
}

export function reverseNameParser(readableName, mapping) {
    for (const nonReadableName in mapping) {
        if (mapping.hasOwnProperty(nonReadableName)) {
            if (mapping[nonReadableName] === readableName) {
                return nonReadableName;
            }
        }
    }

    return null;
}

async function TweetForGameChanges(Data, TwitterClient) {
    //
    let dlc = false

    if (Object.keys(Data).length > 0) {
        // Handle the screenshot here
        console.log("Screenshot captured");

        let Header = "📁 Help Wanted 2 Steam Branch Update.\n"
        let Message = ""
        let ThreadMessage = ""

        let usedBranches = {}

        for (const branch in Data) {
            let AvoidingBranch = false

            if (!HW2_BranchFilter.includes(branch.toLowerCase())) {
                AvoidingBranch = true
                console.log("Avoiding update for branch : " + branch.toLowerCase())
            }

            if (branch && !AvoidingBranch) {
                let branchData = (Data[branch])[1]
                let branchSubName = "Shipment"

                if ((Data[branch])[1].hasOwnProperty("Dev")) {
                    const branchPredictions = getClosestDate((Data[branch])[1].Dev, (Data[branch])[1].Ship)

                    branchData = branchPredictions.date
                    branchSubName = branchPredictions.isDevDateChosen && "Dev" || "Shipment"

                } else {
                    branchData = (Data[branch])[1].Ship
                }

                const diff = Math.round(Date.now() - new Date(branchData))
                const timeUnit = getTimeUnit(diff).result
                let branchName = branch

                if (branch.toLowerCase() == "dlc") {
                    dlc = true
                    branchName = "HW2 DLC"
                }

                usedBranches[branchName] = branchName
                Message += "\n👉 " + branchName + " " + branchSubName + " branch updated " + timeUnit.toString() + " ago on: " + (branchData) + ((Data[branch])[1].ChangeID && " (change number: " + (Data[branch])[1].ChangeID + ")" || "")
            }
        }

        try {
            if (dailyTweets < limit && Message && Message != "") {
                if (dlc) {
                    return console.log("DLC Change detected in GameChanges function, passing to PastePin Package Handler...")
                } else {
                    const url = dlc ? process.env.STMDBDLCURL : process.env.STMDBURL
                    await SShotPromise(url) // only get screenshot when change is detected
                        .then(async () => {

                            const TweetContent = Header + Message + Hashtags
                            
                            const Upload = await TwitterClient.v1.uploadMedia(LinkToDir[dlc == false ? url : process.env.STMDBDLCURL])

                            const { data: createdTweet } = await TwitterClient.v2.tweet(TweetContent, {
                                media: {
                                    media_ids: [Upload]
                                }
                            })
                            dailyTweets += 1
                            
                            try {
                                ThreadMessage = "Check for yourself: " + url

                                console.log(TweetContent + "\n" + ThreadMessage)

                                await TwitterClient.v2.reply(ThreadMessage, createdTweet.id)
                            } catch (t_err) {
                                console.log("Error : " + t_err)
                            }

                        })
                        .catch((error) => {
                            // Handle any errors that occurred during the process
                            console.error("Error:", error);
                        });
                }
            }
        } catch (err) {
            console.error("Error while tweeting! Message : " + err)
        }

    }
    console.log((limit - dailyTweets).toString(), " tweets left after: BranchUpdateDetection.")
}

async function TweetForBranchAddedRemoved(Data, TwitterClient) {
    //
    if ((Data[0] && Data[1]) && (Object.keys(Data[0]).length > 0 || Object.keys(Data[1]).length > 0)) {
        let Header = "📁 Help Wanted 2 Steam Branch Update.\n"
        let Message = ""
        let ThreadMessage = ""

        if (Object.keys(Data[0]).length > 0) {
            for (const newBranch in Data[0]) {
                Message += "\n👉 " + newBranch.toString() + " branch added on " + new Date().toUTCString()
            }
        }

        if (Object.keys(Data[1]).length > 0) {
            for (const oldBranch in Data[1]) {
                Message += "\n👉 " + oldBranch.toString() + " branch removed on " + new Date().toUTCString()
            }
        }

        try {
            if (dailyTweets < limit && Message && Message != "") {
                const url = process.env.STMDBURL
                await SShotPromise(url)// only get screenshot when change is detected
                    .then(async () => {
                        const TweetContent = Header + Message + Hashtags

                        // Handle the screenshot here
                        
                        const Upload = await TwitterClient.v1.uploadMedia(LinkToDir[url])

                        await TwitterClient.v2.tweet(TweetContent, {
                            media: {
                                media_ids: [Upload]
                            }
                        })

                        dailyTweets += 1
                        
                        try {
                            ThreadMessage = "Check for yourself: " + url

                            console.log(TweetContent + "\n" + ThreadMessage)

                            await TwitterClient.v2.reply(ThreadMessage, createdTweet.id)
                        } catch (t_err) {
                            console.log("Error : " + t_err)
                        }

                    })

                    .catch((error) => {
                        // Handle any errors that occurred during the process
                        console.error("Error:", error);
                    });
            }
        } catch {
            console.error("Error while tweeting! Message : " + Message)
        }
    }

    console.log((limit - dailyTweets).toString(), " tweets left after: BranchRemovalDetection.")
}

async function TweetForPackageUpdate(GameName, ReturnedData, TwitterClient) {
    const pasteBin = ReturnedData[0]
    const changeString = ReturnedData[1]
    const ApplicationID = ReturnedData[2]

    if (pasteBin && changeString && changeString != "") {
        const Header = "📁 " + GameName + " Changes Detected.\n"
        const Message = "All details can be found here : " + pasteBin
        const TweetContent = Header + Message + Hashtags

        const url = AppIdToLink[ApplicationID]
        console.log(TweetContent)

        if (url) {
            await SShotPromise(url).then(async () => {
                const Upload = await TwitterClient.v1.uploadMedia(LinkToDir[url])

                await TwitterClient.v2.tweet(TweetContent, {
                    media: {
                        media_ids: [Upload]
                    }
                 })
            })
        } else {
            await TwitterClient.v2.tweet(TweetContent + Hashtags)
        }

        dailyTweets += 1
    }

    console.log((limit - dailyTweets).toString(), " tweets left after: Package Update Check.")
}

/*
    Common Functions
*/

async function FNAFLoop(tweetClient) {
    console.log("---------------------- FNAF ---------------------- ")
    console.log("Checking...")

    const HW2_CHANGES = await RetrieveData(2287520, 2609630, HW2_PACKAGES, HW2_BRANCHES, HW2_BranchesInCount, HW2_BranchNameParser)
    const ITP_Changes = await UpdateAppData(2662750, './Data/ITP/ITP_DATA.json', process.env.PASTEBIN_KEY)
    const HW2_DLC_Changes = await UpdateAppData(2609630, './Data/HW2_DLC_DATA.json', process.env.PASTEBIN_KEY)
    //const HW2_DEPOT_Changes = await UpdateAppDepotData(2287520, 2609630, './Data/HW2/HW2_DEPOTS.json');

    setTimeout(async () => {
        try {
            //await TweetForGameChanges(HW2_CHANGES[0],tweetClient)
            //await TweetForBranchAddedRemoved(HW2_CHANGES[1],tweetClient)

            //await TweetForPackageUpdate("Into The Pit Package", ITP_Changes,tweetClient)
            //await TweetForPackageUpdate("Help Wanted 2 DLC Package", HW2_DLC_Changes, tweetClient)

            console.log("--------------------------------------------------")
        } catch (err) {
            console.error(err)
        }
    }, 1000) // Fire 1 s after loop ( no tweet spammin ))
}

/*
    Initialization
*/

async function InitializeBot() {
    console.log("Initializing bot")

    const twitterClient = new TwitterApi({
        appKey: process.env.CONSUMER_KEY ?? '',
        appSecret: process.env.CONSUMER_SECRET ?? '',
        accessToken: process.env.ACCESS_TOKEN ?? '',
        accessSecret: process.env.ACCESS_TOKEN_SECRET ?? '',
    });

    const tweetClient = twitterClient.readWrite;

    console.log("Successfully logged into Twitter!")

    setInterval(async function () {
        try {
            await FNAFLoop();
        } catch (error) {
            console.log("New error during check: ", error)
        }
    }, 1000 * 60 * 5);

    await FNAFLoop();
}

process.on('beforeExit', async () => {
    console.log("Disconnecting user...")

    await DisconnectUser();

    // Disconnect stream 
    if (TwitterStream != null) {
        TwitterStream.close()
    }
})

InitializeBot();