import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "@bahce-shop/shared";

export class S3Service {
  private readonly client = new S3Client({
    region: "us-east-1",
    endpoint: env.S3_ENDPOINT,
    forcePathStyle: true,
    credentials: {
      accessKeyId: env.S3_ACCESS_KEY,
      secretAccessKey: env.S3_SECRET_KEY,
    },
  });

  async generateUploadUrl(key: string, contentType: string) {
    const command = new PutObjectCommand({
      Bucket: env.S3_BUCKET,
      Key: key,
      ContentType: contentType,
    });

    return getSignedUrl(this.client, command, {
      expiresIn: 15 * 60,
    });
  }

  async download(key: string) {
    const output = await this.client.send(
      new GetObjectCommand({
        Bucket: env.S3_BUCKET,
        Key: key,
      }),
    );

    if (!output.Body) {
      throw new Error(`S3 object has no body: ${key}`);
    }

    return Buffer.from(await output.Body.transformToByteArray());
  }

  async upload(key: string, body: Buffer, contentType: string) {
    await this.client.send(
      new PutObjectCommand({
        Bucket: env.S3_BUCKET,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );

    return this.publicUrl(key);
  }

  publicUrl(key: string) {
    const baseUrl = env.S3_PUBLIC_BASE_URL ?? `${env.S3_ENDPOINT}/${env.S3_BUCKET}`;
    return `${baseUrl.replace(/\/$/, "")}/${key}`;
  }
}
