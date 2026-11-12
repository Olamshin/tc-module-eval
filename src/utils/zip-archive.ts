import { inflateRawSync } from 'zlib';

export interface ZipTextFile {
  path: string;
  content: string;
}

export interface ZipReadLimits {
  maxFiles: number;
  maxFileBytes: number;
  maxTotalBytes: number;
}

export interface ZipReadResult {
  files: ZipTextFile[];
  /** Entries left out, with why: an unsafe path or link, binary content, a size limit, or an unsupported format. */
  omitted: Array<{ path: string; reason: string }>;
}

const END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const CENTRAL_DIRECTORY_ENTRY = 0x02014b50;
const LOCAL_FILE_HEADER = 0x04034b50;
const SYMLINK_MODE = 0o120000;
const FILE_TYPE_MASK = 0o170000;
const BINARY_PROBE_BYTES = 8 * 1024;

/**
 * The text files of a ZIP archive (such as a sources jar), read in memory without writing to disk. Entries are
 * returned only under safe relative paths; links, binary files and entries beyond the limits are omitted.
 * Throws when the archive itself cannot be read.
 */
export function readZipTextFiles(archive: Buffer, limits: ZipReadLimits): ZipReadResult {
  const end = findEndOfCentralDirectory(archive);
  const entryCount = archive.readUInt16LE(end + 10);
  const directoryOffset = archive.readUInt32LE(end + 16);
  if (entryCount === 0xffff || directoryOffset === 0xffffffff) throw new Error('ZIP64 archives are not supported.');

  const entries = [];
  let offset = directoryOffset;
  for (let index = 0; index < entryCount; index += 1) {
    need(archive, offset, 46);
    if (archive.readUInt32LE(offset) !== CENTRAL_DIRECTORY_ENTRY) throw new Error('The archive directory is corrupt.');
    const flags = archive.readUInt16LE(offset + 8);
    const method = archive.readUInt16LE(offset + 10);
    const compressedSize = archive.readUInt32LE(offset + 20);
    const size = archive.readUInt32LE(offset + 24);
    const nameLength = archive.readUInt16LE(offset + 28);
    const extraLength = archive.readUInt16LE(offset + 30);
    const commentLength = archive.readUInt16LE(offset + 32);
    const mode = archive.readUInt32LE(offset + 38) >>> 16;
    const localOffset = archive.readUInt32LE(offset + 42);
    need(archive, offset + 46, nameLength);
    const name = archive.toString('utf8', offset + 46, offset + 46 + nameLength);
    offset += 46 + nameLength + extraLength + commentLength;
    if (!name.endsWith('/')) entries.push({ name, flags, method, compressedSize, size, mode, localOffset });
  }
  // A file whose path is also another entry's folder, or a repeated name, cannot be written beside the others.
  const folders = new Set(entries.flatMap(({ name }) => name.split('/').slice(0, -1).map((_, depth, parts) => parts.slice(0, depth + 1).join('/'))));
  const seen = new Set<string>();

  const files: ZipTextFile[] = [];
  const omitted: ZipReadResult['omitted'] = [];
  let totalBytes = 0;
  for (const { name, flags, method, compressedSize, size, mode, localOffset } of entries) {
    const omit = (reason: string) => omitted.push({ path: name, reason });
    if (!isSafeRelativePath(name)) { omit('unsafe path'); continue; }
    if (seen.has(name) || folders.has(name)) { omit('conflicting path'); continue; }
    seen.add(name);
    if ((mode & FILE_TYPE_MASK) === SYMLINK_MODE) { omit('link'); continue; }
    if (flags & 1) { omit('encrypted'); continue; }
    if (method !== 0 && method !== 8) { omit(`compression method ${method}`); continue; }
    if (size > limits.maxFileBytes) { omit('larger than the file limit'); continue; }
    if (files.length >= limits.maxFiles || totalBytes + size > limits.maxTotalBytes) { omit('beyond the archive limits'); continue; }

    need(archive, localOffset, 30);
    if (archive.readUInt32LE(localOffset) !== LOCAL_FILE_HEADER) throw new Error('The archive is corrupt.');
    const dataOffset = localOffset + 30 + archive.readUInt16LE(localOffset + 26) + archive.readUInt16LE(localOffset + 28);
    need(archive, dataOffset, compressedSize);
    const data = archive.subarray(dataOffset, dataOffset + compressedSize);
    let content: Buffer;
    try {
      // maxOutputLength stops an entry that inflates past its declared size.
      content = method === 0 ? data : inflateRawSync(data, { maxOutputLength: Math.max(size, 1) });
    } catch {
      throw new Error(`The archive entry ${name} could not be decompressed.`);
    }
    if (content.length !== size) throw new Error(`The archive entry ${name} does not match its declared size.`);
    if (content.subarray(0, BINARY_PROBE_BYTES).includes(0)) { omit('binary'); continue; }
    // Invalid UTF-8 decodes to longer replacement characters, so the limits apply to the text returned.
    const text = content.toString('utf8');
    const bytes = Buffer.byteLength(text);
    if (bytes > limits.maxFileBytes) { omit('larger than the file limit'); continue; }
    if (totalBytes + bytes > limits.maxTotalBytes) { omit('beyond the archive limits'); continue; }
    totalBytes += bytes;
    files.push({ path: name, content: text });
  }
  return { files, omitted };
}

function findEndOfCentralDirectory(archive: Buffer): number {
  // The record is 22 bytes plus a comment of at most 65,535 bytes, at the end of the archive.
  for (let offset = archive.length - 22; offset >= Math.max(0, archive.length - 22 - 0xffff); offset -= 1) {
    // The record's own comment length must reach the end, so a signature inside an archive comment is not taken for it.
    if (archive.readUInt32LE(offset) === END_OF_CENTRAL_DIRECTORY && offset + 22 + archive.readUInt16LE(offset + 20) === archive.length) return offset;
  }
  throw new Error('Not a ZIP archive.');
}

function need(archive: Buffer, offset: number, length: number): void {
  if (offset < 0 || offset + length > archive.length) throw new Error('The archive is truncated or corrupt.');
}

function isSafeRelativePath(name: string): boolean {
  return name.length > 0 && !name.startsWith('/') && !/[\\:\0]/.test(name)
    && name.split('/').every(segment => segment !== '' && segment !== '.' && segment !== '..');
}
