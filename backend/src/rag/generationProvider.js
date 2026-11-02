const config = require('./generationConfig');
const { createGeminiClient } = require('./geminiClient');
const { createOllamaClient, readOllamaConfig } = require('./ollamaClient');
const { RagError } = require('./generationSafety');

// Backend configuration only. Never take provider/model/URL from an HTTP body.
function createGenerationProvider({ name = process.env.RAG_PROVIDER, geminiFactory = createGeminiClient, ollamaFactory = createOllamaClient } = {}) {
  const selected = name === undefined ? config.DEFAULT_PROVIDER : name;
  if (!['gemini', 'ollama'].includes(selected)) {
    throw new RagError('GENERATION_PROVIDER_CONFIGURATION', 503, 'Provider generation không hợp lệ.');
  }
  const settings = selected === 'ollama' ? readOllamaConfig() : null;
  let client;
  return Object.freeze({
    name: selected,
    model: settings ? settings.model : config.MODEL,
    async generate(prompt) {
      // Preserve lazy key validation: retrieval fallback never initializes the SDK.
      if (!client) client = settings ? ollamaFactory({ settings }) : geminiFactory();
      return client.generate(prompt);
    },
  });
}

function validateProvider(provider) {
  if (!provider || typeof provider.name !== 'string' || !provider.name.trim()
      || typeof provider.model !== 'string' || !provider.model.trim()
      || typeof provider.generate !== 'function') {
    throw new RagError('GENERATION_PROVIDER_CONFIGURATION', 503, 'Adapter generation không hợp lệ.');
  }
  return provider;
}

module.exports = { createGenerationProvider, validateProvider };
