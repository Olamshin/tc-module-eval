import { EvaluationStatus, ModuleKindResult } from './index';

export type S010RuntimeKind = 'java' | 'stripes-react' | 'node' | 'mixed' | 'unknown';
export type S010Requirement = 'required' | 'optional' | 'conditional' | 'unresolved';
export type S010Scenario = 'configuration-absent' | 'startup-unavailable' | 'runtime-unavailable';
export type S010Proof = 'clear-fail-fast' | 'controlled-degradation' | 'uncontrolled-failure' | 'unresolved';
export type S010BoundedFailure = 'proven' | 'not-applicable' | 'unknown';
export type S010Readiness = 'preserved' | 'not-preserved' | 'not-applicable' | 'unknown';
export type S010Coverage = 'complete' | 'incomplete' | 'unsupported';

export interface S010SourceReference {
  path: string;
  line?: number;
  detail: string;
}

export interface S010Diagnostic {
  code: string;
  message: string;
  material: boolean;
  path?: string;
}

export interface S010ScenarioEvidence {
  id: string;
  dependencyId: string;
  requirement: S010Requirement;
  scenario: S010Scenario;
  proof: S010Proof;
  sourceReferences: S010SourceReference[];
  boundedFailure: S010BoundedFailure;
  readiness: S010Readiness;
  rationale?: string;
}

export interface S010Evidence {
  moduleKind: ModuleKindResult;
  runtimeKind: S010RuntimeKind;
  discoveryCoverage: S010Coverage;
  semanticCoverage: S010Coverage;
  scenarios: S010ScenarioEvidence[];
  diagnostics: S010Diagnostic[];
}

export type S010FindingOutcome = 'satisfactory' | 'violation' | 'unresolved';

export interface S010Finding {
  id: string;
  dependencyId: string;
  scenario?: S010Scenario;
  outcome: S010FindingOutcome;
  rationale: string;
  evidence: S010SourceReference[];
  statusDetermining: boolean;
}

export interface S010Analysis {
  criterionId: 'S010';
  status: EvaluationStatus;
  summary: string;
  evidence: S010Evidence;
  findings: S010Finding[];
  diagnostics: S010Diagnostic[];
  agentReviewUnavailableReason?: string;
  /** The FOLIO library source prepared for the agent review; absent when the review was not attempted or the module declares no FOLIO library. */
  agentReviewLibrarySources?: S010LibrarySources;
}

export interface S010LibrarySources {
  /** Why no library source was read at all, such as remote lookups being off. */
  notReadReason?: string;
  libraries: S010LibrarySource[];
}

/** A FOLIO library the module depends on, and whether its released source was read for the agent review. */
export interface S010LibrarySource {
  coordinate: string;
  version?: string;
  /** The build file that declares the dependency. */
  sourcePath: string;
  /** Where its files are in the review workspace and citations, when read. */
  root?: string;
  fileCount?: number;
  /** Text files of the jar left out by a limit or an unsafe entry; its source is then incomplete. */
  omittedFileCount?: number;
  /** Why its source was not read. */
  problem?: string;
  record?: import('./remote-evidence').RemoteEvidenceRecord;
}
