const path = require('node:path');
module.exports = Object.freeze({
  CHUNK_SIZE: 800,
  CHUNK_OVERLAP: 120,
  MAX_TOKENS: 512,
  DIMENSION: 384,
  MODEL: 'Xenova/multilingual-e5-small',
  REVISION: '761b726dd34fb83930e26aab4e9ac3899aa1fa78',
  DTYPE: 'q8',
  CACHE_DIR: path.resolve(__dirname, '../../.cache/rag'),
});
