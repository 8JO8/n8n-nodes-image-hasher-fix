import type {
  IExecuteFunctions,
  INodeExecutionData,
  INodeType,
  INodeTypeDescription,
} from 'n8n-workflow';

import { tmpName } from 'tmp-promise';
import { promises as fs } from 'fs';
import * as path from 'path';

import imghash from 'imghash';

type HashMethod = 'phash' | 'dhash' | 'ahash';

function extFromMime(mime?: string): string | undefined {
  if (!mime) return undefined;
  if (mime === 'image/jpeg') return 'jpg';
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  if (mime === 'image/gif') return 'gif';
  if (mime === 'image/bmp') return 'bmp';
  if (mime === 'image/tiff') return 'tiff';
  return undefined;
}

function extFromFileName(name?: string): string | undefined {
  if (!name) return undefined;
  const ext = path.extname(name).replace('.', '').toLowerCase();
  return ext || undefined;
}

export class ImageHasher implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'Image Hasher',
    name: 'imageHasher',
    icon: 'file:ImageHasher.svg',
    group: ['transform'],
    version: 1,
    description: 'Compute perceptual hash (pHash/dHash/aHash) for an image binary property',
    defaults: {
      name: 'Image Hasher',
    },
    inputs: ['main'],
    outputs: ['main'],
    properties: [
      {
        displayName: 'Binary Property',
        name: 'binaryProperty',
        type: 'string',
        default: 'data',
        required: true,
        description: 'Name of the binary property that contains the image',
      },
      {
        displayName: 'Method',
        name: 'method',
        type: 'options',
        options: [
          { name: 'pHash', value: 'phash' },
          { name: 'dHash', value: 'dhash' },
          { name: 'aHash', value: 'ahash' },
        ],
        default: 'phash',
        description: 'Perceptual hashing algorithm',
      },
      {
        displayName: 'Hash Size',
        name: 'hashSize',
        type: 'options',
        options: [
          { name: '8 (64 bits)', value: 8 },
          { name: '16 (256 bits)', value: 16 },
          { name: '32 (1024 bits)', value: 32 },
        ],
        default: 16,
        description: 'Larger sizes are slower but can be more discriminative',
      },
      {
        displayName: 'Output Field',
        name: 'outputField',
        type: 'string',
        default: 'phash',
        description: 'JSON field name to store the resulting hash',
      },
    ],
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData();
    const binaryProperty = this.getNodeParameter('binaryProperty', 0) as string;
    const method = this.getNodeParameter('method', 0) as HashMethod;
    const hashSize = this.getNodeParameter('hashSize', 0) as number;
    const outputField = this.getNodeParameter('outputField', 0) as string;

    const returnItems: INodeExecutionData[] = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];

      const bin = item.binary?.[binaryProperty];
      if (!bin) {
        throw new Error(
          `Item ${i}: binary property "${binaryProperty}" not found. Available: ${Object.keys(item.binary ?? {}).join(', ')}`
        );
      }

      // n8n stores binary.data as base64 by default
      const encoding = (bin as any).encoding ?? 'base64';
      const data = (bin as any).data as string | undefined;
      if (!data) {
        throw new Error(`Item ${i}: binary.${binaryProperty}.data is missing`);
      }

      const buffer = Buffer.from(data, encoding);

      // Determine extension for a temp file
      const ext =
        extFromFileName(bin.fileName) ??
        (bin as any).fileExtension ??
        extFromMime(bin.mimeType) ??
        'img';

      const tmpPath = await tmpName({ postfix: `.${ext}` });

      try {
        await fs.writeFile(tmpPath, buffer);

        // imghash.hash(filePath, bits, method)
        const hash = await imghash.hash(tmpPath, hashSize, method);

        returnItems.push({
          json: {
            ...(item.json ?? {}),
            [outputField]: hash,
            hashMethod: method,
            hashSize,
            mimeType: bin.mimeType,
            fileName: bin.fileName,
          },
          binary: item.binary,
        });
      } finally {
        // Best-effort cleanup
        try {
          await fs.unlink(tmpPath);
        } catch {}
      }
    }

    return [returnItems];
  }
}