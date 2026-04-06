declare module "sharp" {
  type SharpLike = {
    rotate(): SharpLike;
    jpeg(options?: Record<string, unknown>): SharpLike;
    toBuffer(): Promise<Buffer>;
  };

  export default function sharp(input: Buffer | Uint8Array): SharpLike;
}
