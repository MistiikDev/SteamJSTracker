import * as fs from 'fs';
import puppeteer from 'puppeteer';

const MEME_LIST_SELECTOR = `#base-left`
const MEME_BOX_SELECTOR = `${MEME_LIST_SELECTOR} > div:nth-child(1)`;
const MEME_TITLE_SELECTOR = `${MEME_LIST_SELECTOR} > h2 `;
const MEME_SRC_SELECTOR = `${MEME_LIST_SELECTOR} > h2 > a`;
const MEME_AUTHOR_SELECTOR = `${MEME_LIST_SELECTOR} > div.base-info > div.base-author > a`;
const NEXT_PAGE_SELECTOR_DISABLED = "base-left > div.pager > button";
const NEXT_PAGE_SELECTOR = "base-left > div.pager > a";

const wait = (time) => new Promise((resolve) => setTimeout(resolve, time));

const GetMemeList = async (page) => {
    return page.evaluate(
      (boxSelector, titleSelector, srcSelector) => {
        const memeList = [...document.querySelectorAll(boxSelector)];
        console.log(memeList)
        return memeList.map(($el) => {
          const title = $el

          title.querySelector(titleSelector)
          title.innerText.replace(/[^a-z0-9]/gi, "_")
          title.innerText.toLowerCase();

          const href = $el

          href.querySelector(srcSelector)
          href.getAttribute("src")
          

          const hrefSplit = href.split("/");
          const imageId = hrefSplit[hrefSplit.length - 1];
          const imageUrl = "https://i.imgflip.com/" + imageId;
  
          return {
            title,
            imageId,
            imageUrl,
          };
        });
      },
      MEME_BOX_SELECTOR,
      MEME_TITLE_SELECTOR,
      MEME_SRC_SELECTOR
    );
  };

export async function GetMemeListFromIMGFlip(url, selector) {
    // Gets a request object for any url (web scrapping is often blocked) 

    const browser = await puppeteer.launch();
    const page = await browser.newPage()

    await page.goto( url )

    console.log(await GetMemeList(page))

    await browser.close();
}

export const md_name = "Media Downloader"
export const md_description = "Retrieves media from web sources, and downloads them to be tweeted and deleted after 1 minute (Storage issues on server)."