import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import { SharedEvaluator } from '../evaluators/shared/shared-evaluator';
import { CommandRunner, EvaluationStatus, S010Analysis } from '../types';
import { createEvaluationRun } from '../utils/evaluation-run';

class TestEvaluator extends SharedEvaluator {}

describe('S010 shared evaluator integration', () => {
  let repo: string;
  beforeEach(async () => {
    repo = await fs.mkdtemp(path.join(os.tmpdir(), 's010-shared-'));
    execFileSync('git', ['init', '-q'], { cwd: repo });
    execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: repo });
    execFileSync('git', ['config', 'user.name', 'Test'], { cwd: repo });
  });
  afterEach(async () => { await fs.remove(repo); });

  it('evaluates committed Java fail-fast evidence, caches it, and executes no target command', async () => {
    await fs.outputFile(path.join(repo, 'pom.xml'), '<project><artifactId>mod-example</artifactId></project>');
    await fs.outputJson(path.join(repo, 'descriptors/ModuleDescriptor-template.json'), {
      id: 'mod-example-1.0.0', launchDescriptor: { env: [{ name: 'SEARCH_URL', required: true }] }
    });
    await fs.outputFile(path.join(repo, 'src/main/java/SearchConfig.java'), 'class SearchConfig { @Value("${SEARCH_URL}") String url; }');
    execFileSync('git', ['add', '.'], { cwd: repo });
    execFileSync('git', ['commit', '-qm', 'fixture'], { cwd: repo });
    const runner: CommandRunner = { run: jest.fn(), normalize: jest.fn() };
    const run = createEvaluationRun({ repositoryPath: repo, language: 'java', criteriaFilter: ['S010'], commandRunner: runner });
    const evaluator = new TestEvaluator('java');

    const first = await evaluator.evaluateCriterion('S010', repo, run);
    await fs.outputFile(path.join(repo, 'src/main/java/SearchConfig.java'), 'dirty checkout must be ignored');
    const second = await evaluator.evaluateCriterion('S010', repo, run);

    expect(first.status).toBe(EvaluationStatus.PASS);
    expect(second.criterionDetails).toEqual(first.criterionDetails);
    expect(run.artifacts.s010ThirdPartyEvidence).toBeDefined();
    expect(run.artifacts.moduleDescriptor).toBeUndefined();
    expect(runner.run).not.toHaveBeenCalled();
    expect((first.criterionDetails as S010Analysis).findings[0].evidence[0].path).toContain('ModuleDescriptor');
  });

  it('returns not applicable for an explicit committed library', async () => {
    await fs.outputFile(path.join(repo, 'pom.xml'), '<project><artifactId>folio-spring-base</artifactId></project>');
    execFileSync('git', ['add', '.'], { cwd: repo });
    execFileSync('git', ['commit', '-qm', 'fixture'], { cwd: repo });
    const result = await new TestEvaluator('java').evaluateCriterion('S010', repo);
    expect(result.status).toBe(EvaluationStatus.NOT_APPLICABLE);
  });

  const stripesPackage = (name: string, stripes: object) => ({ name, dependencies: { react: '^18.2.0', '@folio/stripes-core': '^10.0.0' }, stripes });

  it.each([
    ['a Stripes package with no actsAs role (stripes-acq-components)', stripesPackage('@folio/stripes-acq-components', { actsAs: [''] }), 'library'],
    ['a ui- package without actsAs', stripesPackage('@folio/ui-example', {}), 'ui-module'],
    ['a package with a legacy stripes.type', stripesPackage('@folio/example', { type: 'app' }), 'ui-module'],
    ['a package with an actsAs role', stripesPackage('@folio/example', { actsAs: ['app'] }), 'ui-module']
  ])('classifies %s from the committed package.json', async (_name, packageJson, kind) => {
    await fs.outputJson(path.join(repo, 'package.json'), packageJson);
    await fs.outputFile(path.join(repo, 'lib/useFunds.js'), 'export const useFunds = ky => ky.get("finance/funds");\n');
    execFileSync('git', ['add', '.'], { cwd: repo });
    execFileSync('git', ['commit', '-qm', 'fixture'], { cwd: repo });

    const result = await new TestEvaluator('javascript').evaluateCriterion('S010', repo);

    expect((result.criterionDetails as S010Analysis).evidence.moduleKind.kind).toBe(kind);
    expect(result.status === EvaluationStatus.NOT_APPLICABLE).toBe(kind === 'library');
  });

  it('does not take library evidence from a package.json that links outside the repository', async () => {
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), 's010-outside-'));
    try {
      await fs.outputJson(path.join(outside, 'package.json'), stripesPackage('@folio/stripes-acq-components', { actsAs: [''] }));
      await fs.symlink(path.join(outside, 'package.json'), path.join(repo, 'package.json'));
      execFileSync('git', ['add', '.'], { cwd: repo });
      execFileSync('git', ['commit', '-qm', 'fixture'], { cwd: repo });

      const result = await new TestEvaluator('javascript').evaluateCriterion('S010', repo);

      expect(result.status).toBe(EvaluationStatus.MANUAL);
      expect((result.criterionDetails as S010Analysis).evidence.moduleKind.kind).toBe('ambiguous');
    } finally {
      await fs.remove(outside);
    }
  });

  it('returns manual for unsupported general Node runtime', async () => {
    await fs.outputJson(path.join(repo, 'package.json'), { name: 'mod-node', dependencies: { express: '4.0.0' } });
    execFileSync('git', ['add', '.'], { cwd: repo });
    execFileSync('git', ['commit', '-qm', 'fixture'], { cwd: repo });
    const result = await new TestEvaluator('javascript').evaluateCriterion('S010', repo);
    expect(result.status).toBe(EvaluationStatus.MANUAL);
    expect(result.details).toContain('  - Code type: Node.js (not supported)');
  });
});
