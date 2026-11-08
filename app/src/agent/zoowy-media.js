const dns = require('node:dns/promises');
const https = require('node:https');
const { BlockList, isIP } = require('node:net');
const { crc32 } = require('node:zlib');
const { runWithSignal } = require('./turn-cancel');

const MAX_IMAGE_BYTES = 1024 * 1024;
const MAX_IMAGE_DIMENSION = 4096;
const MAX_IMAGE_PIXELS = 8_000_000;
const PNG_SIGNATURE = Buffer.from('89504e470d0a1a0a', 'hex');
const JPEG_SIGNATURE = Buffer.from('ffd8', 'hex');
const SOURCE_BYTES = 256 * 1024;
const SOURCE_CHARS = 4500;
const SOURCE_TIMEOUT_MS = 5000;

class MediaError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

function checkDimensions(width, height) {
  if (!width || !height || width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION || width * height > MAX_IMAGE_PIXELS) {
    throw new MediaError('图片长宽各不得超过 4096 像素，总像素不得超过 800 万', 413);
  }
}

function stripPngMetadata(bytes) {
  if (!bytes.subarray(0, 8).equals(PNG_SIGNATURE)) return null;
  const parts = [PNG_SIGNATURE];
  let offset = 8;
  let imageDataBytes = 0;
  let hasImageData = false;
  let imageDataEnded = false;
  let hasTransparency = false;
  let colorType;
  let paletteSize = 0;
  for (let count = 0; count < 4096 && offset + 12 <= bytes.length; count += 1) {
    const length = bytes.readUInt32BE(offset);
    const end = offset + length + 12;
    if (end > bytes.length) return null;
    const type = bytes.toString('latin1', offset + 4, offset + 8);
    if (!/^[a-zA-Z]{4}$/.test(type)) return null;
    if (crc32(bytes.subarray(offset + 4, end - 4)) !== bytes.readUInt32BE(end - 4)) return null;
    const data = offset + 8;
    if (hasImageData && type !== 'IDAT') imageDataEnded = true;
    if (type === 'IHDR') {
      if (count !== 0 || length !== 13) return null;
      checkDimensions(bytes.readUInt32BE(data), bytes.readUInt32BE(data + 4));
      colorType = bytes[data + 9];
      const depths = { 0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16] };
      if (!depths[colorType]?.includes(bytes[data + 8]) || bytes[data + 10] || bytes[data + 11] || bytes[data + 12] > 1) return null;
    } else if (count === 0) return null;
    else if (type === 'PLTE') {
      if (paletteSize || hasImageData || colorType === 0 || colorType === 4 || length < 3 || length > 768 || length % 3) return null;
      paletteSize = length / 3;
    } else if (type === 'IDAT') {
      if (imageDataEnded || (colorType === 3 && !paletteSize)) return null;
      hasImageData = true;
      imageDataBytes += length;
    } else if (type === 'IEND') {
      if (!imageDataBytes || length !== 0 || end !== bytes.length) return null;
      return Buffer.concat([...parts, bytes.subarray(offset, end)]);
    } else if (type === 'tRNS') {
      if (hasTransparency || hasImageData || colorType === 4 || colorType === 6) return null;
      if ((colorType === 0 && length !== 2) || (colorType === 2 && length !== 6)
        || (colorType === 3 && (!length || length > paletteSize))) return null;
      hasTransparency = true;
    } else {
      if (type[0] === type[0].toUpperCase()) return null;
      offset = end;
      continue;
    }
    parts.push(bytes.subarray(offset, end));
    offset = end;
  }
  return null;
}

function stripJpegMetadata(bytes) {
  if (!bytes.subarray(0, 2).equals(JPEG_SIGNATURE)) return null;
  const parts = [JPEG_SIGNATURE];
  let offset = 2;
  let hasFrame = false;
  let scans = 0;
  let inScan = false;
  for (let count = 0; count < 4096 && offset < bytes.length; count += 1) {
    if (inScan) {
      const start = offset;
      while (offset < bytes.length) {
        offset = bytes.indexOf(0xff, offset);
        if (offset < 0) return null;
        let markerOffset = offset + 1;
        while (bytes[markerOffset] === 0xff) markerOffset += 1;
        const marker = bytes[markerOffset];
        if (marker === 0x00 || (marker >= 0xd0 && marker <= 0xd7)) {
          offset = markerOffset + 1;
          continue;
        }
        parts.push(bytes.subarray(start, offset));
        inScan = false;
        break;
      }
      if (inScan) return null;
    }
    const start = offset;
    if (bytes[offset] !== 0xff) return null;
    while (bytes[offset] === 0xff) offset += 1;
    const marker = bytes[offset++];
    if (marker === 0xd9) {
      return scans > 0 && offset === bytes.length ? Buffer.concat([...parts, bytes.subarray(start, offset)]) : null;
    }
    if (offset + 2 > bytes.length) return null;
    const length = bytes.readUInt16BE(offset);
    const end = offset + length;
    if (length < 2 || end > bytes.length) return null;
    if ((marker >= 0xe0 && marker <= 0xef) || marker === 0xfe) {
      offset = end;
      continue;
    }
    if ([0xc0, 0xc1, 0xc2].includes(marker)) {
      if (hasFrame || length < 8 || bytes[offset + 2] !== 8) return null;
      const components = bytes[offset + 7];
      if (![1, 3].includes(components) || length !== 8 + components * 3) return null;
      checkDimensions(bytes.readUInt16BE(offset + 5), bytes.readUInt16BE(offset + 3));
      hasFrame = true;
    } else if (marker === 0xda) {
      if (!hasFrame || length < 8 || ++scans > 64) return null;
      inScan = true;
    } else if (![0xc4, 0xdb, 0xdd].includes(marker)) return null;
    parts.push(bytes.subarray(start, end));
    offset = end;
  }
  return null;
}

function parseChatImage(dataUrl) {
  if (typeof dataUrl !== 'string') throw new MediaError('请上传 PNG 或 JPEG 图片');
  if (dataUrl.length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4 + 32) throw new MediaError('图片不得超过 1 MiB', 413);
  const match = /^data:(image\/(?:jpeg|png));base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl);
  if (!match) throw new MediaError('请上传 PNG 或 JPEG 图片');
  const [, mime, encoded] = match;
  const bytes = Buffer.from(encoded, 'base64');
  if (bytes.length > MAX_IMAGE_BYTES) throw new MediaError('图片不得超过 1 MiB', 413);
  if (bytes.toString('base64') !== encoded) throw new MediaError('图片编码无效');
  const payload = mime === 'image/png' ? stripPngMetadata(bytes) : stripJpegMetadata(bytes);
  if (!payload) throw new MediaError('图片格式不符或已损坏，请换一张 PNG 或 JPEG 图片');
  return { mime, payload };
}

async function saveChatImage(db, userId, dataUrl) {
  const { mime, payload } = parseChatImage(dataUrl);
  const info = await db.run('INSERT INTO zoowy_attachments (user_id, mime, payload) VALUES (?, ?, ?) RETURNING id', [userId, mime, payload]);
  return Number(info.id);
}

async function loadChatImage(db, userId, attachmentId) {
  if (!Number.isSafeInteger(attachmentId) || attachmentId < 1 || attachmentId > 2147483647) return null;
  const row = await db.get('SELECT mime, payload FROM zoowy_attachments WHERE id = ? AND user_id = ?', [attachmentId, userId]);
  if (!row) return null;
  return { dataUrl: `data:${row.mime};base64,${row.payload.toString('base64')}` };
}

const blocked = new BlockList();
for (const [address, bits] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24],
  ['192.88.99.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24],
  ['203.0.113.0', 24], ['224.0.0.0', 3],
]) blocked.addSubnet(address, bits, 'ipv4');
for (const [address, bits] of [['2001::', 23], ['2001:db8::', 32], ['2002::', 16], ['3fff::', 20]]) {
  blocked.addSubnet(address, bits, 'ipv6');
}
const globalIpv6 = new BlockList();
globalIpv6.addSubnet('2000::', 3, 'ipv6');

function isPublicAddress(address) {
  const family = isIP(address);
  if (family === 4) return !blocked.check(address, 'ipv4');
  if (family === 6) return globalIpv6.check(address, 'ipv6') && !blocked.check(address, 'ipv6');
  return false;
}

function findPublicLink(message) {
  if (typeof message !== 'string') return null;
  const match = /https:\/\/[^\s<>"'，。；、！？（）]+/i.exec(message);
  if (!match) return null;
  const candidate = match[0].replace(/[),.;!?}]+$/, '');
  if (/^https:\/\/\[[^\]]+\]$/i.test(candidate)) return candidate;
  return candidate.replace(/\]+$/, '');
}

function decodeEntities(text) {
  const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
  return text.replace(/&(#(?:x[\da-f]{1,6}|\d{1,7})|amp|lt|gt|quot|apos|nbsp);/gi, (_, entity) => {
    if (entity[0] !== '#') return named[entity.toLowerCase()];
    const hex = entity[1].toLowerCase() === 'x';
    const codePoint = Number.parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10);
    return codePoint > 0 && codePoint <= 0x10ffff && (codePoint < 0xd800 || codePoint > 0xdfff)
      ? String.fromCodePoint(codePoint) : ' ';
  });
}

function visibleSourceText(raw, isHtml) {
  if (!isHtml) return raw.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim();
  const parts = [];
  let hiddenTag = null;
  for (const [token] of raw.matchAll(/<!--[\s\S]*?(?:-->|$)|<![^<>]*>|<\/?[a-z][^<>]*>|[^<]+|</gi)) {
    if (token.startsWith('<')) {
      const tag = /^<(\/?)([a-z\d-]+)/i.exec(token);
      if (!tag) continue;
      const name = tag[2].toLowerCase();
      if (hiddenTag) {
        if (tag[1] && name === hiddenTag) hiddenTag = null;
      } else if (!tag[1] && ['script', 'style', 'noscript', 'template'].includes(name)) {
        hiddenTag = name;
      } else if (['article', 'p', 'div', 'li', 'br', 'h1', 'h2', 'h3', 'tr'].includes(name)) parts.push('\n');
    } else if (!hiddenTag) parts.push(token);
  }
  return decodeEntities(parts.join('')).replace(/[^\S\n]+/g, ' ').replace(/\n\s*\n+/g, '\n\n').trim();
}

function fetchSource(url, address, signal) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, {
      method: 'GET', agent: false, signal,
      lookup: (_host, options, callback) => {
        if (options.all) callback(null, [address]);
        else callback(null, address.address, address.family);
      },
      headers: { Accept: 'text/html, text/plain', 'Accept-Encoding': 'identity', 'User-Agent': 'FootPrint-zoowy/1.0' },
    }, (res) => {
      res.on('error', reject);
      const type = String(res.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
      const encoding = res.headers['content-encoding'];
      if (res.statusCode < 200 || res.statusCode >= 300 || !['text/html', 'text/plain'].includes(type) || (encoding && encoding !== 'identity')) {
        res.destroy();
        reject(new MediaError('链接未返回可读取的静态文本页面', 422));
        return;
      }
      const parts = [];
      let total = 0;
      res.on('data', (chunk) => {
        total += chunk.length;
        if (total <= SOURCE_BYTES) parts.push(chunk);
        else {
          res.destroy();
          reject(new MediaError('网页内容超过读取上限', 413));
        }
      });
      res.on('end', () => resolve({ bytes: Buffer.concat(parts), isHtml: type === 'text/html', typeHeader: res.headers['content-type'] }));
    });
    req.on('error', reject);
    req.end();
  });
}

async function readPublicSource(value, { signal: callerSignal } = {}) {
  if (callerSignal?.aborted) throw new MediaError('本轮已停止', 409);
  let url;
  try { url = new URL(value); } catch { throw new MediaError('链接格式不正确'); }
  if (url.protocol !== 'https:' || url.port || url.username || url.password) throw new MediaError('只读取不含凭据、使用标准 HTTPS 端口的公网链接');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const deadline = AbortSignal.timeout(SOURCE_TIMEOUT_MS);
  const signal = callerSignal ? AbortSignal.any([callerSignal, deadline]) : deadline;
  try {
    const family = isIP(host);
    const addresses = family ? [{ address: host, family }] : await runWithSignal(signal, () => dns.lookup(host, { all: true }));
    if (!addresses.length || addresses.some(({ address }) => !isPublicAddress(address))) throw new MediaError('链接未解析到允许的公网地址');
    const selected = addresses.find(({ family: version }) => version === 4) || addresses[0];
    const { bytes, isHtml, typeHeader } = await runWithSignal(signal, () => fetchSource(url, selected, signal));
    signal.throwIfAborted();
    const charset = /charset\s*=\s*["']?([^;\s"']+)/i.exec(typeHeader)?.[1] || 'utf-8';
    let decoded;
    try { decoded = new TextDecoder(charset).decode(bytes); } catch { throw new MediaError('网页编码不受支持', 422); }
    const text = visibleSourceText(decoded, isHtml);
    if (!text) throw new MediaError('网页没有可读取的文字', 422);
    return { url: url.href, text: text.slice(0, SOURCE_CHARS), truncated: text.length > SOURCE_CHARS };
  } catch (error) {
    if (callerSignal?.aborted) throw new MediaError('本轮已停止', 409);
    if (deadline.aborted) throw new MediaError('链接读取超时', 504);
    if (error instanceof MediaError) throw error;
    throw new MediaError('无法读取该公网链接', 422);
  }
}

module.exports = { MediaError, parseChatImage, saveChatImage, loadChatImage, findPublicLink, readPublicSource };
