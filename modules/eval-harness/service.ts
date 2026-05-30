import { complete, completeJSON } from "@/lib/llm";
import {
  geminiJudgeSchema,
  judgeResultSchema,
  type TestCase,
  type JudgeResult,
  type EvalResult,
  type SuiteResult,
} from "./schemas";
import { getTestSuite, getAvailableProjects } from "./testSuites";

const JUDGE_SYSTEM = `You are an LLM output quality judge. Given a test case (input + expected behavior) and the actual output, evaluate whether the output meets expectations.

Score 0-10:
- 9-10: Excellent, fully meets or exceeds expectations
- 7-8: Good, mostly meets expectations with minor issues
- 4-6: Partial, some expectations met but significant gaps
- 1-3: Poor, fails to meet most expectations
- 0: Complete failure or error

Be strict but fair. Focus on whether the expected behavior criteria are met.`;

async function runTestCase(testCase: TestCase): Promise<EvalResult> {
  const started = Date.now();

  try {
    let output: unknown;

    if (testCase.project === "resume-matcher") {
      const { analyzeResume } = await import("@/modules/resume-matcher/service");
      output = await analyzeResume(testCase.input as any);
    } else if (testCase.project === "sql-generator") {
      const { generateSql } = await import("@/modules/sql-generator/service");
      output = await generateSql(testCase.input as any);
    } else {
      throw new Error(`No eval runner for project: ${testCase.project}`);
    }

    const latencyMs = Date.now() - started;

    const judgment = await judgeOutput(testCase, output);

    return { testCase, output, judgment, latencyMs };
  } catch (err) {
    const latencyMs = Date.now() - started;
    const errorMsg = err instanceof Error ? err.message : String(err);

    return {
      testCase,
      output: null,
      judgment: {
        pass: false,
        score: 0,
        reasoning: `Test execution failed: ${errorMsg}`,
        issues: [errorMsg],
      },
      latencyMs,
      error: errorMsg,
    };
  }
}

async function judgeOutput(
  testCase: TestCase,
  output: unknown
): Promise<JudgeResult> {
  const prompt = `Evaluate this LLM output against the expected behavior.

Test: ${testCase.name}
Project: ${testCase.project}

Input: ${JSON.stringify(testCase.input, null, 2)}

Expected behavior: ${testCase.expectedBehavior}

Actual output: ${JSON.stringify(output, null, 2)}

Judge whether the output meets the expected behavior.`;

  const raw = await completeJSON<unknown>(prompt, geminiJudgeSchema, {
    system: JUDGE_SYSTEM,
    maxOutputTokens: 1024,
  });

  const parsed = judgeResultSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      pass: false,
      score: 0,
      reasoning: "Failed to parse judge response",
      issues: [parsed.error.message],
    };
  }
  return parsed.data;
}

export async function runSuite(projectSlug: string): Promise<SuiteResult> {
  const tests = getTestSuite(projectSlug);
  if (tests.length === 0) {
    throw new Error(
      `No test suite found for "${projectSlug}". Available: ${getAvailableProjects().join(", ")}`
    );
  }

  const results: EvalResult[] = [];
  for (const test of tests) {
    const result = await runTestCase(test);
    results.push(result);
  }

  const passed = results.filter((r) => r.judgment.pass).length;
  const avgScore =
    results.reduce((s, r) => s + r.judgment.score, 0) / results.length;
  const totalLatency = results.reduce((s, r) => s + r.latencyMs, 0);

  return {
    project: projectSlug,
    timestamp: new Date().toISOString(),
    results,
    passRate: Math.round((passed / results.length) * 100),
    avgScore: Math.round(avgScore * 10) / 10,
    totalLatencyMs: totalLatency,
  };
}

export { getAvailableProjects };
