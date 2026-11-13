import { SectionEvaluator, CriterionResult, EvaluationStatus, CriterionFunction, EvaluationRun } from '../../types';
import { runCriteriaInOrder } from '../../utils/criterion-scheduling';
import { redactEvaluatorSecrets } from '../../utils/redaction';
import { errorMessage } from '../../utils/type-guards';

export abstract class BaseSectionEvaluator implements SectionEvaluator {
  abstract readonly sectionName: string;

  /**
   * Map of criterion ID to handler function.
   * Subclasses populate this in their constructor.
   * Insertion order determines criteriaIds order.
   */
  protected criterionHandlers: Map<string, CriterionFunction> = new Map();

  get criteriaIds(): string[] {
    return Array.from(this.criterionHandlers.keys());
  }

  async evaluate(repoPath: string, criteriaFilter?: string[], evaluationRun?: EvaluationRun): Promise<CriterionResult[]> {
    const criteriaToEvaluate = criteriaFilter
      ? this.criteriaIds.filter(id => criteriaFilter.includes(id))
      : this.criteriaIds;

    return runCriteriaInOrder(criteriaToEvaluate.map(criterionId => () =>
      this.evaluateCriterion(criterionId, repoPath, evaluationRun)
        .catch(error => this.createErrorResult(criterionId, error))
    ), evaluationRun);
  }

  async evaluateCriterion(criterionId: string, repoPath: string, evaluationRun?: EvaluationRun): Promise<CriterionResult> {
    if (!this.criteriaIds.includes(criterionId)) {
      throw new Error(`Criterion ${criterionId} is not handled by ${this.sectionName} evaluator`);
    }

    return await this.evaluateSpecificCriterion(criterionId, repoPath, evaluationRun);
  }

  protected async evaluateSpecificCriterion(
    criterionId: string,
    repoPath: string,
    evaluationRun?: EvaluationRun
  ): Promise<CriterionResult> {
    const handler = this.criterionHandlers.get(criterionId);
    if (!handler) {
      throw new Error(`No handler registered for criterion: ${criterionId}`);
    }
    return await handler(repoPath, evaluationRun);
  }

  protected createResult(
    criterionId: string,
    status: EvaluationStatus,
    evidence: string,
    details?: string
  ): CriterionResult {
    return {
      criterionId,
      status,
      evidence,
      details
    };
  }

  protected createErrorResult(criterionId: string, error: any): CriterionResult {
    const message = redactEvaluatorSecrets(errorMessage(error));
    return this.createResult(
      criterionId,
      EvaluationStatus.MANUAL,
      `Evaluation failed: ${message}`,
      'Manual review required due to evaluation error'
    );
  }

  protected createManualReviewResult(criterionId: string, reason: string): CriterionResult {
    return this.createResult(
      criterionId,
      EvaluationStatus.MANUAL,
      reason,
      'This criterion requires manual evaluation by a human reviewer'
    );
  }

  protected createNotImplementedResult(criterionId: string, description: string): CriterionResult {
    return this.createResult(
      criterionId,
      EvaluationStatus.MANUAL,
      `${description} - evaluation logic not yet implemented`,
      'This criterion requires manual evaluation by a human reviewer'
    );
  }
}
