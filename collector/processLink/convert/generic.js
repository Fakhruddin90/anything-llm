const { v4 } = require("uuid");
const { writeToServerDocuments } = require("../../utils/files");
const { tokenizeString } = require("../../utils/tokenizer");
const { default: slugify } = require("slugify");

async function scrapeGenericUrl(link) {
  console.log(`-- Working URL ${link} --`);
  const content = await getPageContent(link);

  if (!content.length) {
    console.error(`Resulting URL content was empty at ${link}.`);
    return {
      success: false,
      reason: `No URL content found at ${link}.`,
      documents: [],
    };
  }

  const url = new URL(link);
  const filename = (url.host + "-" + url.pathname).replace(".", "_");

  const data = {
    id: v4(),
    url: "file://" + slugify(filename) + ".html",
    title: slugify(filename) + ".html",
    docAuthor: "no author found",
    description: "No description found.",
    docSource: "URL link uploaded by the user.",
    chunkSource: slugify(link) + ".html",
    published: new Date().toLocaleString(),
    wordCount: content.split(" ").length,
    pageContent: content,
    token_count_estimate: tokenizeString(content).length,
  };

  const document = writeToServerDocuments(
    data,
    `url-${slugify(filename)}-${data.id}`
  );
  console.log(`[SUCCESS]: URL ${link} converted & ready for embedding.\n`);
  return { success: true, reason: null, documents: [document] };
}

// Instead of puppeteer, on desktop we do IPC calls via PostMessage to the parent port
// and waiting for a valid response back via the requestID. This ensures we only close the listener
// that we were waiting for and not squash messages that may be ongoing at the same time.
// Note: Because we rely on collector to have a parent process (AKA be spawned from main) if
// you run the collector via yarn dev:collector, this call will always fail.
async function getPageContent(link) {
  try {
    const requestUuid = v4();
    let requestHandler = null;
    process.parentPort.postMessage({
      message: "process-link",
      params: { reqId: requestUuid, link },
    });

    const fetchPageContent = new Promise((resolve) => {
      requestHandler = ({ data }) => {
        const { reqId, pageContent } = data;
        if (reqId === requestUuid) resolve(pageContent);
      };

      process?.parentPort?.on("message", requestHandler);
      setTimeout(() => {
        resolve("");
      }, 60_000);
    });

    const pageContents = await fetchPageContent.then((res) => res);
    if (!!pageContents && !!requestHandler) {
      console.log(`Cleaning up request handler for request ID.`);
      process.parentPort.removeListener("message", requestHandler);
      requestHandler = null;
    }

    return pageContents;
  } catch (error) {
    console.error("getPageContent failed!", error);
  }
  return null;
}

module.exports = {
  scrapeGenericUrl,
};
