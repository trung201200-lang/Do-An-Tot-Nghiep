require('./env');

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('Cần cấu hình JWT_SECRET có ít nhất 32 ký tự trong backend/.env.');
  }
  return secret;
}

module.exports = { getJwtSecret };
