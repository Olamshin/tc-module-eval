import { CriterionResult, EvaluationStatus, SectionEvaluator, CriterionFunction, ModuleKindResult, EvaluationRun } from '../types';
import { SharedEvaluator } from '../evaluators/shared/shared-evaluator';
import { JavaScriptSharedEvaluator } from '../evaluators/javascript/javascript-shared-evaluator';
import { CompositeLanguageEvaluator } from '../evaluators/base/composite-language-evaluator';
import { BaseSectionEvaluator } from '../evaluators/base/section-evaluator';
import { CatalogSectionEvaluator } from '../evaluators/base/catalog-section-evaluator';
import { setLogger, resetLogger, NoopLogger } from '../utils/logger';
import { createEvaluationRun } from '../utils/evaluation-run';
import { reviewCriterionWithAgent } from '../utils/criterion-agent-review';
import { EVALUATOR_SECRETS, withEvaluatorSecrets } from './helpers/evaluator-secrets';

// Mock fs-extra (needed by SharedEvaluator criteria)
jest.mock('fs-extra', () => ({
  pathExists: jest.fn().mockResolvedValue(false),
  readFile: jest.fn().mockResolvedValue('')
}));

class TestSharedEvaluator extends SharedEvaluator {}

class OverriddenSharedEvaluator extends SharedEvaluator {
  constructor() {
    super();
    this.criterionHandlers.set('S002', this.customS002.bind(this));
  }

  private async customS002(_repoPath: string): Promise<CriterionResult> {
    return this.createResult('S002', EvaluationStatus.PASS, 'Custom override works');
  }
}

class StubSectionEvaluator extends BaseSectionEvaluator {
  readonly sectionName: string;

  constructor(name: string, criteria: Record<string, CriterionFunction>) {
    super();
    this.sectionName = name;
    for (const [id, fn] of Object.entries(criteria)) {
      this.criterionHandlers.set(id, fn);
    }
  }
}

class TestCompositeEvaluator extends CompositeLanguageEvaluator {
  private sections: SectionEvaluator[];

  constructor(sections: SectionEvaluator[]) {
    super();
    this.sections = sections;
  }

  protected getSectionEvaluators(): SectionEvaluator[] {
    return this.sections;
  }

  async canEvaluate(_repoPath: string): Promise<boolean> {
    return true;
  }

  getLanguage(): string {
    return 'TestLang';
  }
}

describe('SharedEvaluator', () => {
  beforeEach(() => {
    setLogger(new NoopLogger());
  });

  afterEach(() => {
    resetLogger();
  });

  it('should return S001-S014 in canonical order', () => {
    const evaluator = new TestSharedEvaluator();
    const ids = evaluator.criteriaIds;

    expect(ids).toEqual([
      'S001', 'S002', 'S003', 'S004', 'S005', 'S006', 'S007',
      'S008', 'S009', 'S010', 'S011', 'S012', 'S013', 'S014'
    ]);
  });

  it('should preserve ordering when a subclass overrides a handler', () => {
    const evaluator = new OverriddenSharedEvaluator();
    const ids = evaluator.criteriaIds;

    // S002 should still be in position 1 (0-indexed), not moved to end
    expect(ids).toEqual([
      'S001', 'S002', 'S003', 'S004', 'S005', 'S006', 'S007',
      'S008', 'S009', 'S010', 'S011', 'S012', 'S013', 'S014'
    ]);
  });

  it('should use the overridden handler implementation', async () => {
    const evaluator = new OverriddenSharedEvaluator();
    const result = await evaluator.evaluateCriterion('S002', '/fake/path');

    expect(result.criterionId).toBe('S002');
    expect(result.status).toBe(EvaluationStatus.PASS);
    expect(result.evidence).toBe('Custom override works');
  });

  it('should automate JavaScript S002 through descriptor artifact evidence', async () => {
    const evaluator = new JavaScriptSharedEvaluator();
    const result = await evaluator.evaluateCriterion('S002', '/fake/path');

    expect(result.criterionId).toBe('S002');
    expect(result.status).toBe(EvaluationStatus.MANUAL);
    expect(result.evidence).toBe('The evaluator could not safely look for the module descriptor. The repository path is not valid: /fake/path. A reviewer needs to check it by hand.');
  });
});

describe('EvaluationRun', () => {
  it('should cache lazy artifacts in one run slot', async () => {
    const run = createEvaluationRun({
      repositoryPath: '/repo',
      language: 'java',
      criteriaFilter: ['S002']
    });
    const producer = jest.fn().mockResolvedValue({
      status: 'missing',
      warnings: [],
      errors: ['not found']
    });

    // Concurrent callers share the in-flight producer rather than each starting one.
    const [first, second] = await Promise.all([
      run.getOrCreateArtifact('moduleDescriptor', producer),
      run.getOrCreateArtifact('moduleDescriptor', producer)
    ]);
    const third = await run.getOrCreateArtifact('moduleDescriptor', producer);

    expect(first).toBe(second);
    expect(third).toBe(first);
    expect(run.artifacts.moduleDescriptor).toBe(first);
    expect(producer).toHaveBeenCalledTimes(1);
  });

  it('should retry an artifact whose producer failed', async () => {
    const run = createEvaluationRun({ repositoryPath: '/repo', language: 'java' });
    const moduleKind: ModuleKindResult = { kind: 'library', evidence: [], warnings: [] };
    const producer = jest.fn()
      .mockRejectedValueOnce(new Error('transient'))
      .mockResolvedValue(moduleKind);

    const failed = await Promise.allSettled([
      run.getOrCreateArtifact('moduleKind', producer),
      run.getOrCreateArtifact('moduleKind', producer)
    ]);

    expect(failed.map(result => result.status)).toEqual(['rejected', 'rejected']);
    expect(run.artifacts.moduleKind).toBeUndefined();
    await expect(run.getOrCreateArtifact('moduleKind', producer)).resolves.toBe(moduleKind);
    expect(producer).toHaveBeenCalledTimes(2);
  });
});

describe('BaseSectionEvaluator', () => {
  beforeEach(() => {
    setLogger(new NoopLogger());
  });

  afterEach(() => {
    resetLogger();
  });

  it('should filter criteria when criteriaFilter is provided', async () => {
    const evaluator = new StubSectionEvaluator('Test', {
      'X001': async () => ({ criterionId: 'X001', status: EvaluationStatus.PASS, evidence: 'ok' }),
      'X002': async () => ({ criterionId: 'X002', status: EvaluationStatus.PASS, evidence: 'ok' }),
      'X003': async () => ({ criterionId: 'X003', status: EvaluationStatus.PASS, evidence: 'ok' }),
    });

    const results = await evaluator.evaluate('/fake/path', ['X001', 'X003']);

    expect(results).toHaveLength(2);
    expect(results[0].criterionId).toBe('X001');
    expect(results[1].criterionId).toBe('X003');
  });

  it('should return empty results when criteriaFilter matches nothing', async () => {
    const evaluator = new StubSectionEvaluator('Test', {
      'X001': async () => ({ criterionId: 'X001', status: EvaluationStatus.PASS, evidence: 'ok' }),
    });

    const results = await evaluator.evaluate('/fake/path', ['Z999']);

    expect(results).toHaveLength(0);
  });

  it('should throw when evaluateCriterion is called with unknown criterion ID', async () => {
    const evaluator = new StubSectionEvaluator('Test', {
      'X001': async () => ({ criterionId: 'X001', status: EvaluationStatus.PASS, evidence: 'ok' }),
    });

    await expect(evaluator.evaluateCriterion('UNKNOWN', '/fake/path'))
      .rejects.toThrow('Criterion UNKNOWN is not handled by Test evaluator');
  });

  it('should return MANUAL result when an individual handler throws during evaluate', async () => {
    const evaluator = new StubSectionEvaluator('Test', {
      'X001': async () => ({ criterionId: 'X001', status: EvaluationStatus.PASS, evidence: 'ok' }),
      'X002': async () => { throw new Error(`Handler exploded at http://localhost:8080/health with ${EVALUATOR_SECRETS.SONAR_TOKEN}`); },
      'X003': async () => ({ criterionId: 'X003', status: EvaluationStatus.PASS, evidence: 'ok' }),
    });

    const results = await withEvaluatorSecrets(() => evaluator.evaluate('/fake/path'));

    expect(results).toHaveLength(3);
    expect(results[0].status).toBe(EvaluationStatus.PASS);
    expect(results[1].criterionId).toBe('X002');
    expect(results[1].status).toBe(EvaluationStatus.MANUAL);
    expect(results[1].evidence).toBe('Evaluation failed: Handler exploded at http://localhost:8080/health with [REDACTED_SONAR_TOKEN]');
    expect(results[2].status).toBe(EvaluationStatus.PASS);
  });
});

describe('Criterion scheduling', () => {
  beforeEach(() => {
    setLogger(new NoopLogger());
  });

  afterEach(() => {
    resetLogger();
  });

  /** Lets every callback of already-settled promises run, including the section loop's. */
  const settle = () => new Promise(resolve => setImmediate(resolve));
  const rows = (results: CriterionResult[]) => results.map(result => [result.criterionId, result.status, result.evidence]);
  const pass = (criterionId: string): CriterionResult => ({ criterionId, status: EvaluationStatus.PASS, evidence: `${criterionId} done` });
  const manual = (criterionId: string, evidence: string): CriterionResult => ({ criterionId, status: EvaluationStatus.MANUAL, evidence });

  /** Criterion steps that record an event and then wait until the test opens or fails them. */
  function controlledSteps() {
    const events: string[] = [];
    const gates = new Map<string, { promise: Promise<void>; resolve: () => void; reject: (error: Error) => void }>();
    const gate = (name: string) => {
      let entry = gates.get(name);
      if (!entry) {
        let resolve!: () => void;
        let reject!: (error: Error) => void;
        const promise = new Promise<void>((onResolve, onReject) => {
          resolve = onResolve;
          reject = onReject;
        });
        entry = { promise, resolve, reject };
        gates.set(name, entry);
      }
      return entry;
    };
    const step = async (name: string) => {
      events.push(name);
      await gate(name).promise;
    };
    return {
      events,
      step,
      open: async (name: string) => {
        gate(name).resolve();
        await settle();
      },
      fail: async (name: string) => {
        gate(name).reject(new Error(`${name} failed`));
        await settle();
      },
      later: (name: string) => gate(name).promise,
      review: (run: EvaluationRun | undefined, criterionId: string) => run!.runAgentReview(async () => {
        await step(`${criterionId} review`);
        return `${criterionId} reviewed`;
      })
    };
  }

  it('should start the next criterion only after one completes, fails or skips its review', async () => {
    const { events, step, open, fail } = controlledSteps();
    const evaluator = new StubSectionEvaluator('Test', {
      X001: async () => {
        await step('X001 analysis');
        return pass('X001');
      },
      X002: async () => {
        await step('X002 analysis');
        return pass('X002');
      },
      X003: async (_repoPath, evaluationRun) => {
        const skipped = await reviewCriterionWithAgent({
          criterionId: 'X003',
          status: EvaluationStatus.MANUAL,
          hasReviewMaterial: true,
          evaluationRun: evaluationRun!,
          review: async () => { throw new Error('X003 review should not run'); }
        });
        await step('X003 after skipped review');
        return manual('X003', skipped.unavailableReason!);
      },
      X004: async () => {
        await step('X004 analysis');
        return pass('X004');
      }
    });

    const evaluation = evaluator.evaluate('/repo', undefined, createEvaluationRun({ repositoryPath: '/repo', language: 'java' }));
    await settle();
    expect(events).toEqual(['X001 analysis']);
    await open('X001 analysis');
    expect(events).toEqual(['X001 analysis', 'X002 analysis']);
    await fail('X002 analysis');
    expect(events).toEqual(['X001 analysis', 'X002 analysis', 'X003 after skipped review']);
    await open('X003 after skipped review');
    expect(events).toEqual(['X001 analysis', 'X002 analysis', 'X003 after skipped review', 'X004 analysis']);
    await open('X004 analysis');

    expect(rows(await evaluation)).toEqual([
      ['X001', EvaluationStatus.PASS, 'X001 done'],
      ['X002', EvaluationStatus.MANUAL, 'Evaluation failed: X002 analysis failed'],
      ['X003', EvaluationStatus.MANUAL, 'agent review is disabled or unconfigured'],
      ['X004', EvaluationStatus.PASS, 'X004 done']
    ]);
  });

  it('should start later criteria while reviews wait, run three reviews at once in FIFO order and keep result order', async () => {
    const { events, open, fail, review } = controlledSteps();
    const reviewed = (criterionId: string): CriterionFunction => async (_repoPath, evaluationRun) => {
      events.push(`${criterionId} start`);
      return manual(criterionId, await review(evaluationRun, criterionId));
    };
    const evaluator = new StubSectionEvaluator('Test', {
      X001: reviewed('X001'),
      X002: reviewed('X002'),
      X003: reviewed('X003'),
      X004: reviewed('X004'),
      X005: reviewed('X005')
    });

    const evaluation = evaluator.evaluate('/repo', undefined, createEvaluationRun({ repositoryPath: '/repo', language: 'java' }));
    await settle();
    expect(events).toEqual([
      'X001 start', 'X001 review', 'X002 start', 'X002 review', 'X003 start', 'X003 review', 'X004 start', 'X005 start'
    ]);
    await fail('X002 review');
    expect(events.slice(8)).toEqual(['X004 review']);
    await open('X003 review');
    expect(events.slice(8)).toEqual(['X004 review', 'X005 review']);
    await open('X005 review');
    await open('X004 review');
    await open('X001 review');

    expect(rows(await evaluation)).toEqual([
      ['X001', EvaluationStatus.MANUAL, 'X001 reviewed'],
      ['X002', EvaluationStatus.MANUAL, 'Evaluation failed: X002 review failed'],
      ['X003', EvaluationStatus.MANUAL, 'X003 reviewed'],
      ['X004', EvaluationStatus.MANUAL, 'X004 reviewed'],
      ['X005', EvaluationStatus.MANUAL, 'X005 reviewed']
    ]);
  });

  it('should let only a criterion\'s first review start the next criterion', async () => {
    const { events, step, open, later, review } = controlledSteps();
    let lateReview: Promise<string> | undefined;
    const evaluator = new StubSectionEvaluator('Test', {
      X001: async (_repoPath, evaluationRun) => {
        await evaluationRun!.runAgentReview(async () => 'first review');
        await step('X001 between reviews');
        return manual('X001', await review(evaluationRun, 'X001'));
      },
      X002: async () => {
        await step('X002 analysis');
        return pass('X002');
      },
      X003: async (_repoPath, evaluationRun) => {
        events.push('X003 start');
        lateReview = later('X003 late').then(() => evaluationRun!.runAgentReview(async () => {
          events.push('X003 late review');
          return 'late';
        }));
        return pass('X003');
      },
      X004: async () => {
        await step('X004 analysis');
        return pass('X004');
      },
      X005: async () => {
        events.push('X005 start');
        return pass('X005');
      }
    });

    const evaluation = evaluator.evaluate('/repo', undefined, createEvaluationRun({ repositoryPath: '/repo', language: 'java' }));
    await settle();
    expect(events).toEqual(['X001 between reviews', 'X002 analysis']);
    await open('X001 between reviews');
    expect(events).toEqual(['X001 between reviews', 'X002 analysis', 'X001 review']);
    await open('X002 analysis');
    expect(events.slice(3)).toEqual(['X003 start', 'X004 analysis']);
    await open('X003 late');
    expect(events.slice(3)).toEqual(['X003 start', 'X004 analysis', 'X003 late review']);
    await open('X004 analysis');
    expect(events.slice(3)).toEqual(['X003 start', 'X004 analysis', 'X003 late review', 'X005 start']);
    await open('X001 review');

    expect(rows(await evaluation)).toEqual([
      ['X001', EvaluationStatus.MANUAL, 'X001 reviewed'],
      ['X002', EvaluationStatus.PASS, 'X002 done'],
      ['X003', EvaluationStatus.PASS, 'X003 done'],
      ['X004', EvaluationStatus.PASS, 'X004 done'],
      ['X005', EvaluationStatus.PASS, 'X005 done']
    ]);
    await expect(lateReview).resolves.toBe('late');
  });

  it('should let work after a review overlap a later criterion but finish a section before the next starts', async () => {
    const { events, step, open, review } = controlledSteps();
    const first = new StubSectionEvaluator('First', {
      X001: async (_repoPath, evaluationRun) => {
        const evidence = await review(evaluationRun, 'X001');
        await step('X001 after review');
        return manual('X001', evidence);
      },
      X002: async () => {
        await step('X002 analysis');
        return pass('X002');
      }
    });
    const second = new StubSectionEvaluator('Second', {
      Y001: async () => {
        events.push('Y001 start');
        return pass('Y001');
      }
    });

    const evaluation = new TestCompositeEvaluator([first, second])
      .evaluate('/repo', undefined, createEvaluationRun({ repositoryPath: '/repo', language: 'java' }));
    await settle();
    expect(events).toEqual(['X001 review', 'X002 analysis']);
    await open('X001 review');
    expect(events).toEqual(['X001 review', 'X002 analysis', 'X001 after review']);
    await open('X002 analysis');
    expect(events).toEqual(['X001 review', 'X002 analysis', 'X001 after review']);
    await open('X001 after review');
    expect(events).toEqual(['X001 review', 'X002 analysis', 'X001 after review', 'Y001 start']);

    expect(rows(await evaluation)).toEqual([
      ['X001', EvaluationStatus.MANUAL, 'X001 reviewed'],
      ['X002', EvaluationStatus.PASS, 'X002 done'],
      ['Y001', EvaluationStatus.PASS, 'Y001 done']
    ]);
  });

  it('should run criteria one after another when the section has no evaluation run', async () => {
    const { events, open, review } = controlledSteps();
    const ownRun = (criterionId: string): CriterionFunction => async (_repoPath, evaluationRun) => {
      const run = evaluationRun ?? createEvaluationRun({ repositoryPath: '/repo', language: 'java', criteriaFilter: [criterionId] });
      return manual(criterionId, await review(run, criterionId));
    };
    const evaluator = new StubSectionEvaluator('Test', { X001: ownRun('X001'), X002: ownRun('X002') });

    const evaluation = evaluator.evaluate('/repo');
    await settle();
    expect(events).toEqual(['X001 review']);
    await open('X001 review');
    expect(events).toEqual(['X001 review', 'X002 review']);
    await open('X002 review');

    expect(rows(await evaluation)).toEqual([
      ['X001', EvaluationStatus.MANUAL, 'X001 reviewed'],
      ['X002', EvaluationStatus.MANUAL, 'X002 reviewed']
    ]);
  });

  it.each([
    ['replaced on the run', (run: EvaluationRun, runAgentReview: EvaluationRun['runAgentReview']) => Object.assign(run, { runAgentReview })],
    ['on a copy of the run', (run: EvaluationRun, runAgentReview: EvaluationRun['runAgentReview']) => ({ ...run, runAgentReview })]
  ])('should keep the handoff when runAgentReview is wrapped %s', async (_name, wrap) => {
    const { events, open, review } = controlledSteps();
    const run = createEvaluationRun({ repositoryPath: '/repo', language: 'java' });
    const original = run.runAgentReview;
    const wrapped = wrap(run, reviewWork => {
      events.push('traced');
      return original(reviewWork);
    });
    const reviewed = (criterionId: string): CriterionFunction => async (_repoPath, evaluationRun) =>
      manual(criterionId, await review(evaluationRun, criterionId));
    const evaluator = new StubSectionEvaluator('Test', { X001: reviewed('X001'), X002: reviewed('X002') });

    const evaluation = evaluator.evaluate('/repo', undefined, wrapped);
    await settle();
    expect(events).toEqual(['traced', 'X001 review', 'traced', 'X002 review']);
    await open('X002 review');
    await open('X001 review');
    expect((await evaluation).map(result => result.evidence)).toEqual(['X001 reviewed', 'X002 reviewed']);
  });

  it('should resolve nextAgentReviewHandoff when a review outside section evaluation starts', async () => {
    const { events, open, review } = controlledSteps();
    const run = createEvaluationRun({ repositoryPath: '/repo', language: 'java' });
    const handoff = run.nextAgentReviewHandoff().then(() => events.push('handoff'));
    await settle();
    expect(events).toEqual([]);

    const reviewed = review(run, 'X001');
    await settle();
    expect(events).toEqual(['X001 review', 'handoff']);
    await open('X001 review');
    await expect(reviewed).resolves.toBe('X001 reviewed');
    await handoff;
  });
});

describe('CatalogSectionEvaluator', () => {
  it('should fail fast when a catalog criterion has neither fallback nor override', () => {
    class MissingOverrideEvaluator extends CatalogSectionEvaluator {
      constructor() {
        super('Shared/Common', 'java');
      }
    }

    expect(() => new MissingOverrideEvaluator()).toThrow(
      'No default evaluation or handler registered for criterion: S001'
    );
  });
});

describe('CompositeLanguageEvaluator', () => {
  beforeEach(() => {
    setLogger(new NoopLogger());
  });

  afterEach(() => {
    resetLogger();
  });

  it('should collect results from all section evaluators in order', async () => {
    const section1 = new StubSectionEvaluator('Section1', {
      'X001': async () => ({ criterionId: 'X001', status: EvaluationStatus.PASS, evidence: 'ok' }),
      'X002': async () => ({ criterionId: 'X002', status: EvaluationStatus.MANUAL, evidence: 'manual' }),
    });

    const section2 = new StubSectionEvaluator('Section2', {
      'Y001': async () => ({ criterionId: 'Y001', status: EvaluationStatus.FAIL, evidence: 'fail' }),
    });

    const evaluator = new TestCompositeEvaluator([section1, section2]);
    const results = await evaluator.evaluate('/fake/path');

    expect(results).toHaveLength(3);
    expect(results[0].criterionId).toBe('X001');
    expect(results[1].criterionId).toBe('X002');
    expect(results[2].criterionId).toBe('Y001');
  });

  it('should return partial results if a section evaluator throws', async () => {
    const section1 = new StubSectionEvaluator('Section1', {
      'X001': async () => ({ criterionId: 'X001', status: EvaluationStatus.PASS, evidence: 'ok' }),
    });

    const throwingSection: SectionEvaluator = {
      sectionName: 'Broken',
      criteriaIds: ['Z001'],
      evaluate: async () => { throw new Error('Section exploded'); },
      evaluateCriterion: async () => { throw new Error('Section exploded'); },
    };

    const section3 = new StubSectionEvaluator('Section3', {
      'Y001': async () => ({ criterionId: 'Y001', status: EvaluationStatus.PASS, evidence: 'ok' }),
    });

    const evaluator = new TestCompositeEvaluator([section1, throwingSection, section3]);
    const results = await evaluator.evaluate('/fake/path');

    // Should have results from section1 only; throwingSection aborts the loop
    expect(results).toHaveLength(1);
    expect(results[0].criterionId).toBe('X001');
  });
});
