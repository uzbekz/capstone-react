import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import crypto from "crypto";

const region = process.env.AWS_REGION;
const bucket = process.env.S3_BUCKET_NAME;

function getS3Client() {
  if (!region || !bucket) {
    throw new Error("AWS_REGION and S3_BUCKET_NAME must be set for S3 uploads");
  }

  return new S3Client({ region });
}

function normalizeFileName(name = "upload") {
  return name.replace(/[^a-zA-Z0-9._-]/g, "-");
}

export function buildProductImageUrl(key) {
  if (!key) return null;
  return `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
}

export async function uploadProductImage(file, productId = "draft") {
  if (!file) return null;

  const client = getS3Client();
  const safeName = normalizeFileName(file.originalname || "upload");
  const key = `products/${productId}/${Date.now()}-${crypto.randomBytes(6).toString("hex")}-${safeName}`;

  await client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: file.buffer,
    ContentType: file.mimetype || "application/octet-stream"
  }));

  return {
    key,
    url: buildProductImageUrl(key)
  };
}

export async function deleteProductImage(key) {
  if (!key) return;

  const client = getS3Client();
  await client.send(new DeleteObjectCommand({
    Bucket: bucket,
    Key: key
  }));
}
