import puppeteer from "puppeteer-extra";
import fs from 'fs';
import html_compare from 'html-compare'
import dotenv from 'dotenv';

import StealthPlugin from 'puppeteer-extra-plugin-stealth'
import ua_anonymizer from 'puppeteer-extra-plugin-anonymize-ua'

puppeteer.use(StealthPlugin()).use(ua_anonymizer())

dotenv.config();

var wait = (ms) => {
    const start = Date.now();
    let now = start;
    while (now - start < ms) {
      now = Date.now();
    }
}

const MapToIgnore = [
    "comp-ksmhryup",
    "comp-ksmhsj58",
    "j7pOnl",
    "comp-ktozltvh",
    "youtube",
    "MazNVa comp-ksmhryup wixui-image",
    "ProgressBar",
    "MusicPlayer",
    "VideoPlayer",
    "script",
    "gif",
    "iframe",
    "loadlate",
    "curators",
    "recommended_block",
    "progress_bar",
    "review",
]

export const LinkToDir = {
    [process.env.SITEURL]: "./Medias/bin/webScraperMedias/sbtvscreenShot.png",
    [process.env.STMDBURL]: "./Medias/bin/webScraperMedias/steamdbscreenShot.png",
    [process.env.STMDBDLCURL]: "./Medias/bin/webScraperMedias/steamdbruinscreenShot.png",
    [process.env.STMDBITPURL]: "./Medias/bin/webScraperMedias/itpscreenShot.png"
}

export async function SShotPromise(url) {
    return new Promise(async (resolve, reject) => {
        try {
            console.log(url + " screenshot...");

            const browser = await puppeteer.launch({
                headless: 'new'
            });

            const page = await browser.newPage();

            await page.setExtraHTTPHeaders({
                'Accept-Language': 'en'
            });

            let screenShot = null;

            await page.goto(url, { waitUntil: ['load', 'domcontentloaded'] });
            await page.setViewport({ width: 1860, height: 950 });

            if (url == process.env.MOVIEURL) {
                await page.waitForSelector('#onetrust-accept-btn-handler', { visible: true });
                await page.click('#onetrust-accept-btn-handler');
            }

            //const screenShotOptions = (url == process.env.STMDBURL || url == process.env.STMDBDLCURL) ? { path: LinkToDir[url], clip: (url == process.env.STMDBDLCURL ? { x: 360, y: 520, width: 1100, height: 720 } : { x: 450, y: 500, width: 1100, height: 720 }) } : { path: LinkToDir[url] };
            const screenShotOptions = { path: LinkToDir[url], clip: { x: 450, y: 430, width: 1100, height: 720 } }
            wait(1000)

            screenShot = await page.screenshot(screenShotOptions);

            await page.close();
            await browser.close();

            resolve(screenShot);

        } catch (error) {
            console.log(error);

            return reject(error)
        }
    });
}

export async function GetHTMLChange(url, selector, filepath, writeFile) {
    console.log(url + " being checked...\n-> Overwriting file: " + (filepath).toString())

    const browser = await puppeteer.launch()
    const page = await browser.newPage()

    await page.setExtraHTTPHeaders({
        'Accept-Language': 'en'
    });

    let screenShot = null

    await page.goto(url, { waitUntil: ['load', 'domcontentloaded'] });

    if (!writeFile) {
        const data = await page.$$eval("#" + selector, tds => tds.map((td) => {
            return td.innerHTML;
        }))
        fs.writeFileSync(filepath, data.join("\r\n"), (error) => {
            if (error) { console.error(error); }
        })
    }

    await page.setViewport({ width: 1860, height: 950 });

    if (url == process.env.MOVIEURL) {
        await page.waitForSelector('#onetrust-accept-btn-handler', { visible: true });
        await page.click('#onetrust-accept-btn-handler');
    }

    const screenShotOptions = (url == process.env.STMDBURL || url == process.env.STMDBDLCURL) && { path: LinkToDir[url], clip: { x: 450, y: 550, width: 1100, height: 720 } } || { path: LinkToDir[url], }

    setTimeout(async () => {
        screenShot = await page.screenshot(
            screenShotOptions
        )
        await page.close(), browser.close()
        return screenShot
    }, 1000)

    return screenShot
}

export async function CheckSite(url, selector, StaticTextDir, CompareTextDir) {
    let differences = []

    if (fs.existsSync(StaticTextDir)) {
        const pageShot = await GetHTMLChange(url, selector, CompareTextDir)

        const OldPage = fs.readFileSync(StaticTextDir, 'utf-8')
        const NewPage = fs.readFileSync(CompareTextDir, 'utf-8')
        const oldTime = Date.now()

        const ModificationListener = html_compare.compare(OldPage.toString(), NewPage.toString(), { ignore: MapToIgnore })

        if (ModificationListener.different) {
            differences["added"] = []
            differences["removed"] = []
            differences["changed"] = []

            ModificationListener.changes.map(function (change) {
                let counter = 0

                MapToIgnore.forEach(value => {
                    if (!change.message.toString().toLowerCase().match(value.toString().toLowerCase())) {
                        counter += 1
                    }
                })

                if (!change.message.toString().toLowerCase().match("<div></div>")) {
                    if (counter >= MapToIgnore.length) {
                        differences[change.type].push(change.message)
                    }
                }

            });

            for (const type in differences) {
                if (type.length < 5) {
                    differences[type] = []
                }
            }
        }

        const currentTime = Date.now()

        console.log("Took: " + ((currentTime - oldTime) / 1000).toString() + " seconds to process.")
        console.log(differences)

        if (differences.length == 0) {
            console.log("Nothing has changed.")
        }

        fs.writeFileSync(CompareTextDir, "", (error) => {
            if (error) { console.error(error) }
        })

        fs.writeFileSync(StaticTextDir, NewPage, (error) => {
            if (error) { console.error(error) }
        })

    }

    return differences
}


export const ws_name = "WebScraper";
export const ws_description = "Scraps SBTV to get HTML Data, further code will check history of html, detect changes and tweet whenever one is detected."