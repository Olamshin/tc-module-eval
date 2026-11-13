import { deflateRawSync } from 'zlib';
import { readZipTextFiles } from '../utils/zip-archive';

interface Entry {
  name: string;
  content?: string | Buffer;
  stored?: boolean;
  mode?: number;
  /** Declare a size other than the content's, as a crafted archive can. */
  declaredSize?: number;
}

/** A ZIP archive as jar tools write one: local headers, then the central directory, then its end record. */
function zip(entries: Entry[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8');
    const content = Buffer.from(entry.content ?? '');
    const data = entry.stored ? content : deflateRawSync(content);
    const size = entry.declaredSize ?? content.length;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(entry.stored ? 0 : 8, 8);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(size, 22);
    local.writeUInt16LE(name.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE((3 << 8) | 20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(entry.stored ? 0 : 8, 10);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(size, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(((entry.mode ?? 0o100644) << 16) >>> 0, 38);
    central.writeUInt32LE(offset, 42);
    locals.push(local, name, data);
    centrals.push(central, name);
    offset += local.length + name.length + data.length;
  }
  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}

const LIMITS = { maxFiles: 10, maxFileBytes: 64, maxTotalBytes: 1024 };

describe('readZipTextFiles', () => {
  it('returns text files under safe relative paths and says why it left out each other entry', () => {
    const archive = zip([
      { name: 'org/folio/A.java', content: 'class A {}' },
      { name: 'application.properties', content: 'db.timeout=5', stored: true },
      { name: 'org/folio/', content: '' },
      { name: '../escape.java', content: 'x' },
      { name: '/absolute.java', content: 'x' },
      { name: 'org/./dot.java', content: 'x' },
      { name: 'org\\windows.java', content: 'x' },
      { name: 'linked.java', content: '/etc/passwd', mode: 0o120777 },
      { name: 'font.woff2', content: Buffer.from([0x77, 0x00, 0x46]) },
      { name: 'large.json', content: 'x'.repeat(65) }
    ]);

    expect(readZipTextFiles(archive, LIMITS)).toEqual({
      files: [
        { path: 'org/folio/A.java', content: 'class A {}' },
        { path: 'application.properties', content: 'db.timeout=5' }
      ],
      omitted: [
        { path: '../escape.java', reason: 'unsafe path' },
        { path: '/absolute.java', reason: 'unsafe path' },
        { path: 'org/./dot.java', reason: 'unsafe path' },
        { path: 'org\\windows.java', reason: 'unsafe path' },
        { path: 'linked.java', reason: 'link' },
        { path: 'font.woff2', reason: 'binary' },
        { path: 'large.json', reason: 'larger than the file limit' }
      ]
    });
  });

  it('leaves out a repeated name and a file whose path is another entry\'s folder', () => {
    const archive = zip([
      { name: 'A.java', content: 'first' },
      { name: 'A.java', content: 'second' },
      { name: 'org', content: 'file' },
      { name: 'org/B.java', content: 'class B {}' }
    ]);

    expect(readZipTextFiles(archive, LIMITS)).toEqual({
      files: [{ path: 'A.java', content: 'first' }, { path: 'org/B.java', content: 'class B {}' }],
      omitted: [{ path: 'A.java', reason: 'conflicting path' }, { path: 'org', reason: 'conflicting path' }]
    });
  });

  it('does not take an end-of-directory signature inside the archive comment for the real one', () => {
    const archive = zip([{ name: 'A.java', content: 'class A {}' }]);
    const comment = Buffer.concat([Buffer.from([0x50, 0x4b, 0x05, 0x06]), Buffer.alloc(18), Buffer.from('notes')]);
    archive.writeUInt16LE(comment.length, archive.length - 2);

    expect(readZipTextFiles(Buffer.concat([archive, comment]), LIMITS).files).toEqual([{ path: 'A.java', content: 'class A {}' }]);
  });

  it('stops at the file count and total size limits', () => {
    const archive = zip(['a', 'b', 'c', 'd'].map(name => ({ name: `${name}.java`, content: 'x'.repeat(40) })));

    expect(readZipTextFiles(archive, { ...LIMITS, maxFiles: 3, maxTotalBytes: 100 })).toEqual({
      files: [{ path: 'a.java', content: 'x'.repeat(40) }, { path: 'b.java', content: 'x'.repeat(40) }],
      omitted: [{ path: 'c.java', reason: 'beyond the archive limits' }, { path: 'd.java', reason: 'beyond the archive limits' }]
    });
  });

  it('applies the limits to decoded text, which invalid UTF-8 makes longer than the entry', () => {
    // Each 0xff byte decodes to U+FFFD, three bytes of UTF-8.
    const invalid = (length: number) => Buffer.alloc(length, 0xff);
    const archive = zip([{ name: 'a.txt', content: invalid(30) }, { name: 'b.txt', content: invalid(20) }]);

    const result = readZipTextFiles(archive, { maxFiles: 10, maxFileBytes: 64, maxTotalBytes: 1024 });

    expect(result.files.map(file => [file.path, Buffer.byteLength(file.content)])).toEqual([['b.txt', 60]]);
    expect(result.omitted).toEqual([{ path: 'a.txt', reason: 'larger than the file limit' }]);
    const total = readZipTextFiles(zip([{ name: 'a.txt', content: invalid(20) }, { name: 'b.txt', content: invalid(20) }]), { maxFiles: 10, maxFileBytes: 64, maxTotalBytes: 100 });
    expect(total.files.map(file => file.path)).toEqual(['a.txt']);
    expect(total.omitted).toEqual([{ path: 'b.txt', reason: 'beyond the archive limits' }]);
  });

  it('refuses an entry that inflates past its declared size instead of inflating it', () => {
    const archive = zip([{ name: 'bomb.java', content: 'x'.repeat(1_000_000), declaredSize: 10 }]);

    expect(() => readZipTextFiles(archive, LIMITS)).toThrow('The archive entry bomb.java could not be decompressed.');
  });

  it('refuses a truncated archive or one that is not a ZIP', () => {
    const archive = zip([{ name: 'A.java', content: 'class A {}' }]);
    const truncated = Buffer.concat([archive.subarray(0, 20), archive.subarray(archive.length - 22)]);

    expect(() => readZipTextFiles(truncated, LIMITS)).toThrow('The archive is truncated or corrupt.');
    expect(() => readZipTextFiles(Buffer.from('<html>Not found</html>'), LIMITS)).toThrow('Not a ZIP archive.');
  });
});
