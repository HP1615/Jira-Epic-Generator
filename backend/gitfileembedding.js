require('dotenv').config({ path: '../.env' });
const axios = require('axios');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const path = require('path');
const { QdrantClient } = require("@qdrant/js-client-rest");

// Initialize Gemini AI with the API key
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
let GITHUB_REPO;

// Qdrant client
const qdrantClient = new QdrantClient({
  url: process.env.QDRANT_URL,
  apiKey: process.env.QDRANT_API_KEY
});

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function stringHashCode(str) {
  let hash = 0, i, chr;
  if (str.length === 0) return hash;
  for (i = 0; i < str.length; i++) {
    chr   = str.charCodeAt(i);
    hash  = ((hash << 5) - hash) + chr;
    hash |= 0;
  }
  return Math.abs(hash);
}

// Load credentials from .env file
const GITHUB_API_BASE_URL = process.env.GITHUB_API_BASE_URL || "https://api.github.com";
const GITHUB_REPO_OWNER = process.env.GITHUB_REPO_OWNER || "ReliablesoftTech";
const GITHUB_ACCESS_TOKEN = process.env.GITHUB_ACCESS_TOKEN;

// Mapping panelName to repo name
const PANELNAME_TO_REPO = {
    "LCO Panel": "OnnetWeb-OnNetSinglePlay",
    "Admin Panel": "OnnetWeb-AdminPanelConsole",
    "MyCableTv Web": "MycableTVWithPayTV",
    "MyCableTv AndroidApp": "MycableTVWithPayTV",
    "MyCableTv iOS App": "MycableTVWithPayTV",
    "PayTvSelfCare Web": "MycableTVWithPayTV",
    "PayTvSelfCare Android Native": "MycableTVWithPayTV",
    "PayTvSelfCare iOS Native": "MycableTVWithPayTV",
    "Collection App": "Collection-Application-New",
    "LCO Android App": "LcoAppNew",
    "MyCableTV React": "MYCABLETVREACT"
};

/**
 * Create or ensure Qdrant collection exists.
 */
async function setupQdrantCollection(QDRANT_COLLECTION_NAME) {
  try {
    const collections = await qdrantClient.getCollections();
    const exists = collections.collections.some(c => c.name === QDRANT_COLLECTION_NAME);
    if (!exists) {
      await qdrantClient.createCollection(QDRANT_COLLECTION_NAME, {
        vectors: {
          default: {
            size: 3072,
            distance: "Cosine",
          },
        },
      });
      console.log(`🟢 Qdrant collection "${QDRANT_COLLECTION_NAME}" created with size 3072.`);
    } else {
      console.log(`🔵 Qdrant collection "${QDRANT_COLLECTION_NAME}" already exists.`);
    }
  } catch (err) {
    console.error("❌ Qdrant setup error:", err.message);
    throw err;
  }
}

/** 
 * Store embeddings in Qdrant.
 */
async function storeEmbeddingsInQdrant(ai, QDRANT_COLLECTION_NAME, baseName, pathStr, source = "github") {
  try {
    const points = [];
    try {
      const model = ai.getGenerativeModel({ model: 'gemini-embedding-exp-03-07' });
      const result = await model.embedContent({
        content: { parts: [{ text: baseName }] },
        taskType: "retrieval_document",
      });

      const embedding = result.embedding?.values || [];
      const paddedEmbedding = embedding.length < 3072
        ? [...embedding, ...new Array(3072 - embedding.length).fill(0)]
        : embedding.slice(0, 3072);

      points.push({
        id: stringHashCode(`${source}-${baseName}`) || Date.now(),
        vector: { default: paddedEmbedding },
        payload: { baseName, path: pathStr, source },
      });

      await sleep(1100);
    } catch (embedError) {
      console.error(`❌ Error generating embedding for ${baseName}:`, embedError.message);
    }

    // Batch upserts to avoid Qdrant payload limit
    const BATCH_SIZE = 100;
    for (let i = 0; i < points.length; i += BATCH_SIZE) {
      const batch = points.slice(i, i + BATCH_SIZE);
      await qdrantClient.upsert(QDRANT_COLLECTION_NAME, {
        wait: true,
        points: batch,
        vector_name: "default",
      });
      console.log(`✅ Stored batch ${i / BATCH_SIZE + 1} (${batch.length} embeddings) in Qdrant.`);
    }
  } catch (err) {
    console.error("❌ Qdrant upsert error:", err.message);
    throw err;
  }
}

/**
 * Search Qdrant for similar files.
 */
async function searchSimilarFiles(ai, queryText, QDRANT_COLLECTION_NAME, limit = 3) {
  console.log("queryText", queryText);
  
  try {
    const model = ai.getGenerativeModel({ model: 'gemini-embedding-exp-03-07' });
    const result = await model.embedContent({
      content: { parts: [{ text: queryText }] },
      taskType: "retrieval_query",
    });

    const queryEmbedding = result?.embedding?.values || [];
    const paddedEmbedding = queryEmbedding.length < 3072
      ? [...queryEmbedding, ...new Array(3072 - queryEmbedding.length).fill(0)]
      : queryEmbedding.slice(0, 3072);

    const results = await qdrantClient.search(QDRANT_COLLECTION_NAME, {
      vector: {
        name: "default",
        vector: paddedEmbedding
      },
      limit,
      with_payload: true,
    });

    return results.map(r => r.payload?.path).filter(Boolean);
  } catch (err) {
    console.error("❌ Qdrant search error:", err);
    return [];
  }
}

/**
 * Fetch all file paths in a GitHub repository recursively.
 * Only returns code files (.js, .aspx, .aspx.cs, etc.), ignores .css, .html, images, etc.
 */
async function fetchGitHubFilesRecursive(branch = 'develop') {
  const apiUrl = `${GITHUB_API_BASE_URL}/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO}/git/trees/${branch}?recursive=1`;
  const headers = {
    'Accept': 'application/vnd.github+json',
    'Authorization': `Bearer ${GITHUB_ACCESS_TOKEN}`
  };

  const response = await axios.get(apiUrl, { headers });
  if (!response.data.tree) throw new Error('No tree found in response');

  // Only include code files (.js, .aspx, .aspx.cs, etc.), exclude css, html, images, etc.
  const CODE_FILE_REGEX = /\.(js|ts|jsx|tsx|py|java|php|cs|cpp|c|go|rb|swift|kt|rs|scala|sh|pl|json|xml|yml|yaml|md|aspx|aspx\.cs)$/i;
  const EXCLUDE_FILE_REGEX = /\.(css|scss|sass|less|html?|png|jpe?g|gif|svg|bmp|webp|ico|mp3|wav|ogg|mp4|mov|avi|pdf|docx?|xlsx?|pptx?)$/i;

  return response.data.tree
    .filter(item =>
      item.type === 'blob' &&
      (
        CODE_FILE_REGEX.test(item.path) ||
        item.path.endsWith('.aspx') ||
        item.path.endsWith('.aspx.cs')
      ) &&
      !EXCLUDE_FILE_REGEX.test(item.path)
    )
    .map(item => ({
      path: item.path,
      basename: path.basename(item.path, path.extname(item.path))
    }));
}

/**
 * Fetch the content of a single file from GitHub.
 */
async function fetchGitHubFileContent(repoName, filePath, branch = 'develop') {
  let cleanPath = filePath.replace(/^\/+/, '');
  const apiUrl = `${GITHUB_API_BASE_URL}/repos/${GITHUB_REPO_OWNER}/${repoName}/contents/${cleanPath}?ref=${branch}`;
  const headers = { Authorization: `Bearer ${GITHUB_ACCESS_TOKEN}` };
  try {
    const response = await axios.get(apiUrl, { headers });
    if (response.data && response.data.content) {
      // Decode base64 content
      return Buffer.from(response.data.content, 'base64').toString('utf-8');
    }
    return '[Binary or non-text file]';
  } catch (err) {
    console.error(`[fetchGitHubFileContent] Error fetching ${cleanPath}:`, err.response?.status, err.response?.statusText);
    return null;
  }
}

/**
 * Fetch and summarize multiple GitHub files.
 * @param {string[]} fileNames - Array of file paths.
 * @param {string} repoName - Repository name.
 * @param {string} branch - Branch name (default: 'develop').
 * @returns {object} - { plainEnglishDescription }
 */
async function fetchGitHubFiles(fileNames, repoName, branch = 'develop') {
  let plainEnglishDescription = '';
  for (const filePath of fileNames) {
    const content = await fetchGitHubFileContent(repoName, filePath, branch);
    if (content) {
      plainEnglishDescription += `\n--- File: ${filePath} ---\n`;
      plainEnglishDescription += typeof content === 'string' ? content.slice(0, 1000) : '[Binary or non-text file]';
    } else {
      plainEnglishDescription += `\n--- File: ${filePath} ---\n[Could not fetch file or file not found]`;
    }
  }
  return { plainEnglishDescription };
}

async function createStoreEmbeddings() {
  const uniqueRepoNames = [...new Set(Object.values(PANELNAME_TO_REPO))];
  let count = 0;
  for (const repoName of uniqueRepoNames) {
    console.log(`🔄 Processing repo: ${repoName}`);
    GITHUB_REPO = repoName;
    const QDRANT_COLLECTION_NAME = `${repoName}_files`;
    console.log(`🔧 Using Qdrant collection: ${QDRANT_COLLECTION_NAME}`);
    await setupQdrantCollection(QDRANT_COLLECTION_NAME);
    const files = await fetchGitHubFilesRecursive();
    console.log(`📂 Found ${files.length} files in ${repoName}.`);
    for (const file of files) {
      console.log(`Storing embedding for file: ${file.basename} at path: ${file.path}`);
      await storeEmbeddingsInQdrant(genAI, QDRANT_COLLECTION_NAME, file.basename, file.path, "github");
      console.log(`✅ Stored embedding for file: ${file.basename} at path: ${file.path}`);
    }
    console.log(`✅ Completed processing for repo: ${repoName}`);
    count++;
  }
  console.log(`🔄 Processed ${count} repos successfully.`);
}

module.exports = {
  searchSimilarFiles: (queryText, QDRANT_COLLECTION_NAME, limit = 3) => searchSimilarFiles(genAI, queryText, QDRANT_COLLECTION_NAME, limit),
  setupQdrantCollection,
  storeEmbeddingsInQdrant: (QDRANT_COLLECTION_NAME, baseName, path, source = "github") => storeEmbeddingsInQdrant(genAI, QDRANT_COLLECTION_NAME, baseName, path, source),
  fetchGitHubFilesRecursive,
  createStoreEmbeddings,
  fetchGitHubFiles,
  PANELNAME_TO_REPO
};