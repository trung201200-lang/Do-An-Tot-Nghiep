const config = require('./config');
function validateVector(vector) {
  if (!Array.isArray(vector) || vector.length !== config.DIMENSION || !vector.every(value => typeof value === 'number' && Number.isFinite(value))) throw new Error('Vector sai dimension hoặc có số không hữu hạn.');
  const norm = Math.hypot(...vector);
  if (Math.abs(norm - 1) > 1e-5) throw new Error('Vector chưa được chuẩn hóa L2.');
  return norm;
}
async function loadEmbedder() {
  const { AutoTokenizer, AutoModel, env } = await import('@huggingface/transformers');
  env.cacheDir = config.CACHE_DIR;
  env.allowLocalModels = false;
  const options = { revision: config.REVISION };
  const tokenizer = await AutoTokenizer.from_pretrained(config.MODEL, options);
  const model = await AutoModel.from_pretrained(config.MODEL, { ...options, dtype: config.DTYPE, device: 'cpu' });
  const tokenize = text => tokenizer(text, { truncation: false, padding: false });
  return {
    countTokens(text) { return tokenize(text).input_ids.dims[1]; },
    async embed(text) {
      const inputs = tokenize(text);
      const length = inputs.input_ids.dims[1];
      if (length > config.MAX_TOKENS) throw new Error('Input vượt giới hạn token; từ chối cắt ngầm.');
      const output = await model(inputs);
      const hidden = output.last_hidden_state;
      if (!hidden || hidden.dims.length !== 3 || hidden.dims[0] !== 1 || hidden.dims[1] !== length || hidden.dims[2] !== config.DIMENSION) throw new Error('Tensor model không đúng dạng.');
      const vector = Array(config.DIMENSION).fill(0);
      let active = 0;
      for (let token = 0; token < length; token++) {
        if (!Number(inputs.attention_mask.data[token])) continue;
        active++;
        for (let dim = 0; dim < vector.length; dim++) vector[dim] += hidden.data[token * vector.length + dim];
      }
      if (!active) throw new Error('Không có token hợp lệ.');
      for (let dim = 0; dim < vector.length; dim++) vector[dim] /= active;
      const norm = Math.hypot(...vector);
      if (!Number.isFinite(norm) || norm === 0) throw new Error('Model trả vector không hợp lệ.');
      const normalized = vector.map(value => value / norm);
      validateVector(normalized);
      return normalized;
    },
    dispose() { return model.dispose(); },
  };
}
module.exports = { loadEmbedder, validateVector };
