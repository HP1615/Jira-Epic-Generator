require('dotenv').config();
const axios = require('axios');
const path = require('path');
const { QdrantClient } = require("@qdrant/js-client-rest");
const { OpenAI } = require("openai");
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
 
const GITHUB_API_BASE_URL = process.env.GITHUB_API_BASE_URL
const GITHUB_REPO_OWNER = process.env.GITHUB_REPO_OWNER
const GITHUB_ACCESS_TOKEN = process.env.GITHUB_ACCESS_TOKEN;
 
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
    "MyCableTv React": "MYCABLETVREACT"
};
 
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
 
async function getOpenAIEmbedding(text) {
  const response = await openai.embeddings.create({
    model: "text-embedding-3-large", // 3072-dim
    input: text
  });
  return response.data[0].embedding;
}
 
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
 
async function storeEmbeddingsInQdrant(QDRANT_COLLECTION_NAME, baseName, pathStr, source = "github") {
  try {
    const points = [];
    try {
      const embedding = await getOpenAIEmbedding(baseName);
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
 
async function searchSimilarFiles(queryText, QDRANT_COLLECTION_NAME, limit = 3) {
  try {
    const embedding = await getOpenAIEmbedding(queryText);
    const paddedEmbedding = embedding.length < 3072
      ? [...embedding, ...new Array(3072 - embedding.length).fill(0)]
      : embedding.slice(0, 3072);
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
 
async function fetchGitHubFilesRecursive(repoName, branch = 'develop') {
  const apiUrl = `${GITHUB_API_BASE_URL}/repos/${GITHUB_REPO_OWNER}/${repoName}/git/trees/${branch}?recursive=1`;
  const headers = {
    'Accept': 'application/vnd.github+json',
    'Authorization': `Bearer ${GITHUB_ACCESS_TOKEN}`
  };
  const response = await axios.get(apiUrl, { headers });
  console.log("response", response.data);
 
  if (!response.data.tree) throw new Error('No tree found in response');
  return response.data.tree
    .filter(item => item.type === 'blob')
    .map(item => ({
      path: item.path,
      basename: path.basename(item.path, path.extname(item.path))
    }));
}
 
/**
 * Fetch the content of a single file from GitHub.
 */
async function fetchGitHubFileContent(repoName, filePath, branch = 'develop') {
  // Remove common build/deployment and root prefixes from filePath
  let cleanPath = filePath;
  // Remove known build/deployment folders
  cleanPath = cleanPath.replace(/^MyCableTVNew\/MyCableTV\/MyCableTV\//, '');
  cleanPath = cleanPath.replace(/^obj\/Release\/Package\/PackageTmp\//, '');
  // Remove any leading slashes
  cleanPath = cleanPath.replace(/^\/+/, '');
  // Log the final path for debugging
  console.log('[fetchGitHubFileContent] Cleaned file path:', cleanPath);
  console.log("repoName", GITHUB_API_BASE_URL, GITHUB_REPO_OWNER, repoName,branch);
 
  const apiUrl = `${GITHUB_API_BASE_URL}/repos/${GITHUB_REPO_OWNER}/${repoName}/contents/${cleanPath}?ref=${branch}`;
  const headers = { Authorization: `Bearer ${GITHUB_ACCESS_TOKEN}` };
  try {
    console.log("apiUrl", apiUrl);
   
    const response = await axios.get(apiUrl, { headers });
    console.log("response", response.data);
   
    return response.data; // Raw file content
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
  console.log(`🔄 Fetching files from ${repoName} on branch ${branch}:`, fileNames);
 
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
  console.log("working......");
 
  const uniqueRepoNames = [...new Set(Object.values(PANELNAME_TO_REPO))];
  let count = 0;
  for (const repoName of uniqueRepoNames) {
    console.log(`🔄 Processing repo: ${repoName}`);
    const QDRANT_COLLECTION_NAME = `${repoName}_files`;
    await setupQdrantCollection(QDRANT_COLLECTION_NAME);
    const files = await fetchGitHubFilesRecursive(repoName);
    console.log(`📂 Found ${files.length} files in ${repoName}.`);
    for (const file of files) {
      console.log(`Storing embedding for file: ${file.basename} at path: ${file.path}`);
      await storeEmbeddingsInQdrant(QDRANT_COLLECTION_NAME, file.basename, file.path, "github");
      console.log(`✅ Stored embedding for file: ${file.basename} at path: ${file.path}`);
    }
    console.log(`✅ Completed processing for repo: ${repoName}`);
    count++;
  }
  console.log(`🔄 Processed ${count} repos successfully.`);
}
 
module.exports = {
  searchSimilarFiles,
  setupQdrantCollection,
  storeEmbeddingsInQdrant,
  fetchGitHubFilesRecursive,
  createStoreEmbeddings,
  fetchGitHubFiles // <-- added export
};