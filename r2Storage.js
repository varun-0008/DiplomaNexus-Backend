/**
 * Cloudflare R2 Storage Helper (S3-Compatible Object Storage)
 * 10 GB Free Storage, Unlimited Bandwidth
 */
const { S3Client, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');

const ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const BUCKET_NAME = process.env.R2_BUCKET_NAME || 'diplomanexus-media';
const PUBLIC_DOMAIN = process.env.R2_PUBLIC_DOMAIN; // e.g. https://pub-xxx.r2.dev or custom domain

let r2Client = null;

if (ACCOUNT_ID && ACCESS_KEY_ID && SECRET_ACCESS_KEY) {
  try {
    r2Client = new S3Client({
      region: 'auto',
      endpoint: `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: ACCESS_KEY_ID,
        secretAccessKey: SECRET_ACCESS_KEY,
      },
    });
    console.log('[R2 Storage] Cloudflare R2 S3 client initialized successfully.');
  } catch (err) {
    console.error('[R2 Storage Error] Failed to initialize R2 client:', err.message);
  }
}

/**
 * Upload a Base64 image/file to Cloudflare R2
 * @param {string} base64Data - Base64 encoded file string
 * @param {string} fileName - Destination filename in R2
 * @param {string} mimeType - e.g. 'image/png', 'image/jpeg'
 * @returns {Promise<string|null>} - Public URL of uploaded object
 */
async function uploadBase64ToR2(base64Data, fileName, mimeType = 'image/png') {
  if (!r2Client) {
    console.warn('[R2 Storage] R2 client not configured. Skipping R2 upload.');
    return null;
  }

  try {
    const cleanBase64 = base64Data.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(cleanBase64, 'base64');

    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: fileName,
      Body: buffer,
      ContentType: mimeType,
    });

    await r2Client.send(command);

    const publicUrl = PUBLIC_DOMAIN 
      ? `${PUBLIC_DOMAIN.replace(/\/$/, '')}/${fileName}`
      : `https://${ACCOUNT_ID}.r2.cloudflarestorage.com/${BUCKET_NAME}/${fileName}`;

    console.log(`[R2 Storage] Successfully uploaded ${fileName} -> ${publicUrl}`);
    return publicUrl;
  } catch (err) {
    console.error(`[R2 Storage Error] Upload failed for ${fileName}:`, err.message);
    return null;
  }
}

module.exports = {
  uploadBase64ToR2
};
