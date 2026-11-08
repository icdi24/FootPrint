const { randomBytes, createCipheriv, createDecipheriv } = require('node:crypto');
const { DEFAULT_MODEL, DEEPSEEK_MODELS } = require('../ai');

class DeepSeekSettingsError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function encryptionKey() {
  const encoded = (process.env.DEEPSEEK_CREDENTIAL_KEY || '').trim();
  if (!/^[A-Za-z0-9+/]{43}=$/.test(encoded)) {
    throw new DeepSeekSettingsError(503, '服务器尚未配置 DeepSeek 凭据加密密钥');
  }
  return Buffer.from(encoded, 'base64');
}

function aad(userId, model) {
  return Buffer.from(`zoowy-deepseek-v1:${userId}:${model}`, 'utf8');
}

async function modelSettings(db, userId) {
  const row = await db.get('SELECT model FROM zoowy_model_settings WHERE user_id = ?', [userId]);
  return { configured: Boolean(row), model: row?.model || DEFAULT_MODEL };
}

async function saveDeepSeekSettings(db, userId, input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)
      || Object.keys(input).some((key) => key !== 'apiKey' && key !== 'model')) {
    throw new DeepSeekSettingsError(400, '只接受 DeepSeek API Key 和模型');
  }
  const apiKey = typeof input.apiKey === 'string' ? input.apiKey.trim() : '';
  const model = input.model ?? DEFAULT_MODEL;
  if (!/^[!-~]{1,512}$/.test(apiKey)) {
    throw new DeepSeekSettingsError(400, '请填写有效的 DeepSeek API Key');
  }
  if (!DEEPSEEK_MODELS.includes(model)) {
    throw new DeepSeekSettingsError(400, '请选择受支持的 DeepSeek 模型');
  }

  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), nonce);
  cipher.setAAD(aad(userId, model));
  const ciphertext = Buffer.concat([cipher.update(apiKey, 'utf8'), cipher.final()]);
  const encryptedKey = Buffer.concat([nonce, cipher.getAuthTag(), ciphertext]).toString('base64');
  await db.run(
    `INSERT INTO zoowy_model_settings (user_id, model, encrypted_key) VALUES (?, ?, ?)
     ON CONFLICT (user_id) DO UPDATE SET model = EXCLUDED.model, encrypted_key = EXCLUDED.encrypted_key`,
    [userId, model, encryptedKey]
  );
  return { configured: true, model };
}

async function deleteDeepSeekSettings(db, userId) {
  await db.run('DELETE FROM zoowy_model_settings WHERE user_id = ?', [userId]);
  return { configured: false, model: DEFAULT_MODEL };
}

async function loadDeepSeekSettings(db, userId) {
  const row = await db.get('SELECT model, encrypted_key FROM zoowy_model_settings WHERE user_id = ?', [userId]);
  if (!row) return null;
  const key = encryptionKey();
  try {
    const stored = Buffer.from(row.encrypted_key, 'base64');
    const decipher = createDecipheriv('aes-256-gcm', key, stored.subarray(0, 12));
    decipher.setAAD(aad(userId, row.model));
    decipher.setAuthTag(stored.subarray(12, 28));
    const apiKey = Buffer.concat([decipher.update(stored.subarray(28)), decipher.final()]).toString('utf8');
    return { apiKey, model: row.model };
  } catch {
    throw new DeepSeekSettingsError(503, '无法读取 DeepSeek 凭据，请重新配置 API Key');
  }
}

module.exports = {
  DeepSeekSettingsError, modelSettings, saveDeepSeekSettings, deleteDeepSeekSettings, loadDeepSeekSettings,
};
