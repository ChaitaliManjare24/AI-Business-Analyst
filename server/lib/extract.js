'use strict';
/** Upload validation and text extraction (PDF + plain text). */
const path = require('node:path');
const pdfParse = require('pdf-parse/lib/pdf-parse.js');

const MAX_BYTES = 8 * 1024 * 1024; // 8 MB
const TEXT_EXT = new Set(['.txt', '.md', '.markdown', '.csv', '.log', '.rtf']);

class UploadError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

const decodeEntities = (s) => s
  .replace(/&nbsp;/g, ' ')
  .replace(/&amp;/g, '&')
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"');

function cleanExtracted(text) {
  return String(text || '')
    .replace(/\u0000/g, ' ')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function extractText(file) {
  if (!file || !file.buffer?.length) throw new UploadError('No file was received. Please choose a document and try again.');
  if (file.size > MAX_BYTES) throw new UploadError('That file is larger than 8 MB. Please upload a smaller document.', 413);

  const ext = path.extname(file.originalname || '').toLowerCase();
  const mime = file.mimetype || '';

  if (ext === '.pdf' || mime === 'application/pdf') {
    if (!file.buffer.subarray(0, 5).equals(Buffer.from('%PDF-'))) {
      throw new UploadError('That file is not a valid PDF. It may be corrupted or renamed.');
    }
    try {
      // Copy into an exact-size typed array: multer returns pooled Buffers whose
      // backing ArrayBuffer is larger than the file, which breaks pdf.js xref parsing.
      const bytes = new Uint8Array(file.buffer);
      const data = await pdfParse(bytes, { max: 0 });
      const text = cleanExtracted(decodeEntities(data.text || ''));
      if (text.length < 20) {
        throw new UploadError('This PDF contains no extractable text. Scanned images need OCR before upload.', 422);
      }
      return { text, pages: data.numpages, kind: 'pdf' };
    } catch (err) {
      if (err instanceof UploadError) throw err;
      if (/password|encrypt/i.test(err.message || '')) {
        throw new UploadError('This PDF is password-protected. Remove the password and upload it again.', 422);
      }
      throw new UploadError('We could not read that PDF — it may be corrupted or image-only. Try exporting it as text and uploading again.', 422);
    }
  }

  if (TEXT_EXT.has(ext) || mime.startsWith('text/')) {
    const text = cleanExtracted(decodeEntities(file.buffer.toString('utf8')));
    if (text.length < 20) throw new UploadError('The file appears to be empty or too short to summarise.');
    return { text, pages: null, kind: 'text' };
  }

  throw new UploadError(`Unsupported file type "${ext || mime || 'unknown'}". Upload a PDF, TXT, MD or CSV file.`, 415);
}

module.exports = { extractText, UploadError, MAX_BYTES };
