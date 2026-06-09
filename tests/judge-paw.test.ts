import test from "node:test";
import assert from "node:assert/strict";
import {
  STARTER_MESSAGES,
  buildJudgePrompt,
  fallbackJudgePawVerdict,
  parseVerdictPayload
} from "../lib/judge-paw.ts";

test("fallback Judge Paw verdict returns a complete mini-court structure", () => {
  const verdict = fallbackJudgePawVerdict(STARTER_MESSAGES);

  assert.ok(verdict.verdict.length > 0);
  assert.equal(verdict.responsibilitySplit.blake + verdict.responsibilitySplit.ryan, 100);
  assert.ok(verdict.keyEvidence.length >= 3);
  assert.ok(verdict.emotionalLogic.length >= 2);
  assert.ok(verdict.escalationMoment.quote.length > 0);
  assert.ok(verdict.repairOrder.length >= 3);
  assert.ok(verdict.judgeStamp.includes("PAW"));
});

test("parseVerdictPayload normalizes responsibility split", () => {
  const fallback = fallbackJudgePawVerdict(STARTER_MESSAGES);
  const parsed = parseVerdictPayload(
    {
      verdict: "Test verdict.",
      responsibilitySplit: { blake: 3, ryan: 1 },
      keyEvidence: ["Evidence"],
      emotionalLogic: [{ speaker: "Blake", read: "Read" }],
      escalationMoment: { quote: "Quote", explanation: "Explanation" },
      repairOrder: ["Repair"],
      judgeStamp: "STAMP"
    },
    fallback
  );

  assert.equal(parsed.responsibilitySplit.blake + parsed.responsibilitySplit.ryan, 100);
  assert.equal(parsed.responsibilitySplit.blake, 75);
  assert.equal(parsed.responsibilitySplit.ryan, 25);
});

test("Judge Paw prompt labels celebrity names as fictional placeholders", () => {
  const prompt = buildJudgePrompt(STARTER_MESSAGES);

  assert.match(prompt, /fictional demo/i);
  assert.match(prompt, /Do not imply real events/i);
});
