import { PuppeteerNodeLaunchOptions } from "puppeteer";
import { Cluster } from "puppeteer-cluster";

import { Options, ScreenshotParams } from "./types";
import { makeScreenshot } from "./screenshot";
import { Screenshot } from "./models/Screenshot";

export async function launchCluster(puppeteerArgs : PuppeteerNodeLaunchOptions) {
  return await Cluster.launch({
    concurrency: Cluster.CONCURRENCY_CONTEXT,
    maxConcurrency: 2,
    puppeteerOptions: { ...puppeteerArgs, headless: true },
  });
}

export async function nodeHtmlToImage(options: Options) {
  const {
    html,
    encoding,
    transparent,
    content,
    output,
    selector,
    type,
    quality,
    puppeteerArgs = {},
    cluster = await launchCluster(puppeteerArgs),
    autoClose = true,
    exitOnErr = true
  } = options;

  const shouldBatch = Array.isArray(content);
  const contents = shouldBatch ? content : [{ ...content, output, selector }];

  try {
    const screenshots: Array<Screenshot> = await Promise.all(
      contents.map((content) => {
        const { output, selector: contentSelector, ...pageContent } = content;
        return cluster.execute(
          {
            html,
            encoding,
            transparent,
            output,
            content: pageContent,
            selector: contentSelector ? contentSelector : selector,
            type,
            quality,
          },
          async ({ page, data }) => {
            const screenshot = await makeScreenshot(page, {
              ...options,
              screenshot: new Screenshot(data),
            });
            return screenshot;
          }
        );
      })
    );
    await cluster.idle();
    if(autoClose) {
      await cluster.close();
    }

    return shouldBatch
      ? screenshots.map(({ buffer }) => buffer)
      : screenshots[0].buffer;
  } catch (err) {
    if(autoClose) {
      await cluster.close();
    }
    
    if(exitOnErr) {
      console.error(err);
      process.exit(1);
    }

    throw err
  }
}
