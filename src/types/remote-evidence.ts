export interface RemoteEvidenceAttempt {
  url: string;
  status?: number;
}

/** One remote read, as recorded for the report. Credentials are never recorded. */
export interface RemoteEvidenceRecord {
  url: string;
  /** Where the response finally came from, when a redirect changed it. */
  finalUrl?: string;
  fetchedAt: string;
  status?: number;
  sha256?: string;
  bytes?: number;
  /** Every HTTP request made for this read (redirect hops and the retry); omitted when there was one. */
  attempts?: RemoteEvidenceAttempt[];
  /** Why no usable response was returned. */
  error?: string;
}

export type RemoteFailureReason =
  | 'not-allowed'
  | 'http-status'
  | 'rate-limited'
  | 'redirect-limit'
  | 'timeout'
  | 'too-large'
  | 'invalid-json'
  | 'network'
  | 'invalid-credentials'
  | 'budget-requests'
  | 'budget-bytes'
  | 'budget-time';

export type RemoteJsonResult =
  | { ok: true; json: unknown; record: RemoteEvidenceRecord }
  | { ok: false; reason: RemoteFailureReason; status?: number; record: RemoteEvidenceRecord };

export type RemoteBytesResult =
  | { ok: true; bytes: Buffer; record: RemoteEvidenceRecord }
  | { ok: false; reason: RemoteFailureReason; status?: number; record: RemoteEvidenceRecord };

/** The bounded, read-only transport every remote lookup goes through (see src/utils/remote-evidence.ts). */
export interface RemoteLookups {
  getJson(url: string): Promise<RemoteJsonResult>;
  getBytes(url: string): Promise<RemoteBytesResult>;
  /** A transport with the same fetch and credentials but its own budgets and records, so its reads cannot use up this one's. */
  withLimits(limits: Partial<{ maxRequests: number; maxTotalBytes: number; maxDurationMs: number }>): RemoteLookups;
  /** Every request made in this evaluation, in the order they were started. */
  readonly records: readonly RemoteEvidenceRecord[];
}
