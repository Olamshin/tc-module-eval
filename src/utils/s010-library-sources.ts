import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { RemoteLookups, S009DependencyEvidence, S010LibrarySource, S010LibrarySources } from '../types';
import { MAX_FILE_BYTES } from './agent-review-repository';
import type { CommittedSourceSnapshot } from './committed-source';
import type { CriterionAgentReviewFile } from './criterion-agent-review';
import { collectS009DependencyEvidence } from './s009-dependency-evidence';
import { errorMessage } from './type-guards';
import { readZipTextFiles, ZipReadResult } from './zip-archive';

/** Where library source is placed in the review workspace, beside the repository's own paths. */
export const S010_LIBRARY_SOURCES_ROOT = 'folio-library-sources';

const RELEASES = 'https://repository.folio.org/repository/maven-releases';
const MiB = 1024 * 1024;
const MAX_LIBRARIES = 12;
// Its own budget, so library downloads never use up the remote lookups of other criteria.
const DOWNLOAD_LIMITS = { maxRequests: 2 * MAX_LIBRARIES, maxTotalBytes: 12 * MiB, maxDurationMs: 60_000 };
const MAX_UNPACKED_BYTES = 32 * MiB;
const MAX_FILES_PER_LIBRARY = 2_000;
const RELEASE_VERSION = /^[0-9][0-9A-Za-z.-]*$/;
const BUILD_FILE = /(?:^|\/)(?:pom\.xml|build\.gradle(?:\.kts)?)$/;
const COORDINATE_PART = /^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*$/;

export interface S010LibrarySourceFiles {
  sources: S010LibrarySources;
  files: CriterionAgentReviewFile[];
}

/**
 * The released source of each FOLIO library the module declares as a production dependency, at the version the
 * build files of the committed snapshot the agent reviews set (S009's dependency evidence), read from FOLIO's Maven
 * releases repository. A library whose version is not a release version set in the repository is skipped rather
 * than guessed.
 */
export async function collectS010LibrarySources(
  snapshot: CommittedSourceSnapshot,
  lookups: RemoteLookups | undefined
): Promise<S010LibrarySourceFiles> {
  const evidence = await committedDependencies(snapshot);
  const declared = new Map<string, S010LibrarySource>();
  for (const observation of evidence.observations) {
    if (observation.ecosystem !== 'maven' || observation.locality) continue;
    const library: S010LibrarySource = {
      coordinate: observation.coordinate,
      ...(observation.declaredVersion ? { version: observation.declaredVersion } : {}),
      sourcePath: observation.sourcePath
    };
    const key = `${library.coordinate}@${library.version ?? ''}`;
    if (!declared.has(key)) declared.set(key, library);
  }
  const libraries = [...declared.values()].sort((left, right) =>
    left.coordinate.localeCompare(right.coordinate) || (left.version ?? '').localeCompare(right.version ?? ''));
  if (!libraries.length) return { sources: { libraries }, files: [] };
  if (!lookups) {
    return { sources: { notReadReason: 'remote lookups are off (--allow-remote-lookups)', libraries }, files: [] };
  }

  const downloads = lookups.withLimits(DOWNLOAD_LIMITS);
  const files: CriterionAgentReviewFile[] = [];
  let unpacked = 0;
  let fetched = 0;
  for (const library of libraries) {
    const [groupId, artifactId] = library.coordinate.split(':');
    const version = library.version;
    const problem = !COORDINATE_PART.test(groupId) || !COORDINATE_PART.test(artifactId)
      ? `${library.coordinate} is not a plain Maven coordinate` : versionProblem(version);
    if (problem || !version) {
      library.problem = problem;
      continue;
    }
    if (fetched >= MAX_LIBRARIES) {
      library.problem = `the review reads at most ${MAX_LIBRARIES} libraries`;
      continue;
    }
    fetched += 1;
    const result = await downloads.getBytes(`${RELEASES}/${groupId.replace(/\./g, '/')}/${artifactId}/${version}/${artifactId}-${version}-sources.jar`);
    library.record = result.record;
    if (!result.ok) {
      library.problem = `the sources jar could not be read: ${result.record.error ?? result.reason}`;
      continue;
    }
    let archive: ZipReadResult;
    try {
      archive = readZipTextFiles(result.bytes, {
        maxFiles: MAX_FILES_PER_LIBRARY,
        maxFileBytes: MAX_FILE_BYTES,
        maxTotalBytes: MAX_UNPACKED_BYTES - unpacked
      });
    } catch (error) {
      library.problem = `the sources jar could not be read: ${errorMessage(error)}`;
      continue;
    }
    library.root = `${S010_LIBRARY_SOURCES_ROOT}/${groupId}/${artifactId}/${version}`;
    library.fileCount = archive.files.length;
    const omitted = archive.omitted.filter(entry => entry.reason !== 'binary').length;
    if (omitted) library.omittedFileCount = omitted;
    for (const file of archive.files) {
      unpacked += Buffer.byteLength(file.content);
      files.push({ repoRelativePath: `${library.root}/${file.path}`, content: file.content });
    }
  }
  return { sources: { libraries }, files };
}

// The working tree can differ from the committed revision the agent reads, so the build files are taken from the snapshot.
async function committedDependencies(snapshot: CommittedSourceSnapshot): Promise<S009DependencyEvidence> {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 's010-build-files-'));
  try {
    for (const file of snapshot.files.filter(candidate => BUILD_FILE.test(candidate.path))) {
      const target = path.join(root, file.path);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, file.content);
    }
    return await collectS009DependencyEvidence(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function versionProblem(version: string | undefined): string | undefined {
  if (!version) return 'the repository\'s build files do not set its version (a parent POM or BOM outside the repository may)';
  if (version.includes('$')) return `${version} is set by a variable the tool does not resolve`;
  if (/SNAPSHOT$/i.test(version)) return `${version} is a snapshot, and only released source is read`;
  if (!RELEASE_VERSION.test(version)) return `${version} is not a single release version`;
  return undefined;
}
