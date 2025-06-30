const { createStoreEmbeddings } = require('./gitFileEmbeddings');
 
(async () => {
  try {
    console.log('🔄 Starting to create and store embeddings for GitHub files...');
    await createStoreEmbeddings();
    console.log('✅ Successfully created and stored embeddings for all GitHub files.');
  } catch (error) {
    console.error('❌ Error during embedding creation:', error);
  }
})();
// This script is designed to create and store embeddings for files in GitHub repositories.