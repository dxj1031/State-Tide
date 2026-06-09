export type SpeakerId = "blake" | "ryan";

export type PawMessage = {
  id: string;
  speaker: SpeakerId;
  text: string;
};

export type CaseHistory = {
  pastArguments: string[];
  communicationPatterns: string[];
  repeatedThemes: string[];
  emotionalTriggers: string[];
  repairAttempts: string[];
};

export type ResponsibilitySplit = {
  blake: number;
  ryan: number;
};

export type JudgePawVerdict = {
  verdict: string;
  responsibilitySplit: ResponsibilitySplit;
  keyEvidence: string[];
  emotionalLogic: Array<{
    speaker: string;
    read: string;
  }>;
  escalationMoment: {
    quote: string;
    explanation: string;
  };
  repairOrder: string[];
  judgeStamp: string;
};

export const PARTICIPANTS = {
  blake: {
    name: "Blake Lively",
    shortName: "Blake",
    emoji: "💅"
  },
  ryan: {
    name: "Ryan Reynolds",
    shortName: "Ryan",
    emoji: "🎬"
  }
} as const;

export const DEMO_HISTORY: CaseHistory = {
  pastArguments: [
    "A missed dinner reservation turned into a longer argument about feeling deprioritized.",
    "A late reply during a work trip was later repaired with a clear check-in agreement.",
    "A party exit disagreement repeated the pattern of one person wanting reassurance and the other wanting space."
  ],
  communicationPatterns: [
    "Blake tends to name the emotional meaning quickly, especially when she feels dismissed.",
    "Ryan tends to explain logistics first, which can sound like he is skipping the feeling underneath.",
    "Both use humor to soften tension, but humor lands badly when the other person is asking for acknowledgment."
  ],
  repeatedThemes: [
    "Responsiveness versus autonomy",
    "Being busy versus being emotionally available",
    "Whether a repair is a quick apology or a changed pattern"
  ],
  emotionalTriggers: [
    "Late replies after a promised check-in",
    "Phrases like 'you always' or 'you are being dramatic'",
    "Jokes made before the hurt is acknowledged"
  ],
  repairAttempts: [
    "Ryan previously suggested a short 'running late, still thinking of you' text.",
    "Blake previously agreed to ask for reassurance directly before assuming rejection.",
    "Both repaired best when they separated the event from character judgment."
  ]
};

export const STARTER_MESSAGES: PawMessage[] = [
  {
    id: "m1",
    speaker: "blake",
    text: "You said you would text when you got out, and then I heard nothing for three hours."
  },
  {
    id: "m2",
    speaker: "ryan",
    text: "I was in a work dinner. I was not ignoring you on purpose."
  },
  {
    id: "m3",
    speaker: "blake",
    text: "That is the point. It keeps becoming 'not on purpose,' but I still end up feeling forgotten."
  },
  {
    id: "m4",
    speaker: "ryan",
    text: "I feel like no matter what I say, the verdict is already that I failed."
  },
  {
    id: "m5",
    speaker: "blake",
    text: "Because you make it about being accused instead of just admitting it hurt me."
  }
];

function normalizeSplit(split: ResponsibilitySplit): ResponsibilitySplit {
  const blake = Math.max(0, Math.min(100, Math.round(split.blake)));
  const ryan = Math.max(0, Math.min(100, Math.round(split.ryan)));
  const total = blake + ryan || 100;

  return {
    blake: Math.round((blake / total) * 100),
    ryan: 100 - Math.round((blake / total) * 100)
  };
}

export function fallbackJudgePawVerdict(messages: PawMessage[]): JudgePawVerdict {
  const latestRyan = [...messages].reverse().find((message) => message.speaker === "ryan");
  const latestBlake = [...messages].reverse().find((message) => message.speaker === "blake");
  const escalationQuote =
    messages.find((message) =>
      /always|never|dramatic|verdict|failed|accused|problem/i.test(message.text)
    )?.text ??
    latestBlake?.text ??
    latestRyan?.text ??
    "The argument shifted from the event to the meaning of the event.";

  return {
    verdict:
      "Judge Paw finds that the conflict is less about one late text and more about whether a small miss gets repaired as an emotional event, not just explained as a scheduling event.",
    responsibilitySplit: normalizeSplit({ blake: 40, ryan: 60 }),
    keyEvidence: [
      "Blake repeatedly names the felt impact: feeling forgotten, not only the missing text.",
      "Ryan gives a logistical explanation before acknowledging the emotional signal.",
      "The history shows this couple repairs best when they separate the event from character judgment."
    ],
    emotionalLogic: [
      {
        speaker: PARTICIPANTS.blake.name,
        read: "Blake is arguing from accumulated emotional evidence: the late reply feels like a repeated sign of low priority."
      },
      {
        speaker: PARTICIPANTS.ryan.name,
        read: "Ryan is arguing from intent: he hears the complaint as a verdict on his character rather than a request for repair."
      }
    ],
    escalationMoment: {
      quote: escalationQuote,
      explanation:
        "This line escalated the argument by shifting attention away from the event and toward whether one person is being judged as a person."
    },
    repairOrder: [
      "Ryan should acknowledge the emotional impact before explaining the schedule.",
      "Blake should name the specific reassurance she needs without turning the whole pattern into a character charge.",
      "Both should agree on one tiny repair protocol: if a promised check-in slips, send a short late text plus a later repair."
    ],
    judgeStamp: "PAW VERDICT: Small miss, real impact. Repair before rebuttal. 🐾"
  };
}

export function parseVerdictPayload(value: unknown, fallback: JudgePawVerdict): JudgePawVerdict {
  if (!value || typeof value !== "object") {
    return fallback;
  }

  const candidate = value as Record<string, unknown>;
  const responsibility = candidate.responsibilitySplit as Partial<ResponsibilitySplit> | undefined;

  return {
    verdict: typeof candidate.verdict === "string" ? candidate.verdict : fallback.verdict,
    responsibilitySplit: normalizeSplit({
      blake: typeof responsibility?.blake === "number" ? responsibility.blake : fallback.responsibilitySplit.blake,
      ryan: typeof responsibility?.ryan === "number" ? responsibility.ryan : fallback.responsibilitySplit.ryan
    }),
    keyEvidence: Array.isArray(candidate.keyEvidence)
      ? candidate.keyEvidence.filter((item): item is string => typeof item === "string").slice(0, 5)
      : fallback.keyEvidence,
    emotionalLogic: Array.isArray(candidate.emotionalLogic)
      ? candidate.emotionalLogic
          .map((item) => {
            if (!item || typeof item !== "object") {
              return null;
            }

            const next = item as Record<string, unknown>;
            return {
              speaker: typeof next.speaker === "string" ? next.speaker : "Speaker",
              read: typeof next.read === "string" ? next.read : "No read supplied."
            };
          })
          .filter((item): item is JudgePawVerdict["emotionalLogic"][number] => item !== null)
          .slice(0, 4)
      : fallback.emotionalLogic,
    escalationMoment:
      candidate.escalationMoment &&
      typeof candidate.escalationMoment === "object" &&
      typeof (candidate.escalationMoment as Record<string, unknown>).quote === "string" &&
      typeof (candidate.escalationMoment as Record<string, unknown>).explanation === "string"
        ? {
            quote: (candidate.escalationMoment as Record<string, string>).quote,
            explanation: (candidate.escalationMoment as Record<string, string>).explanation
          }
        : fallback.escalationMoment,
    repairOrder: Array.isArray(candidate.repairOrder)
      ? candidate.repairOrder.filter((item): item is string => typeof item === "string").slice(0, 4)
      : fallback.repairOrder,
    judgeStamp: typeof candidate.judgeStamp === "string" ? candidate.judgeStamp : fallback.judgeStamp
  };
}

export function buildJudgePrompt(messages: PawMessage[]) {
  return [
    "You are Judge Paw, a playful mini-court mediator for everyday couple conflicts.",
    "This is a fictional demo using public celebrity names as placeholders. Do not imply real events or real private facts.",
    "Tone: gentle, cute, expressive, courtroom-inspired, emotionally precise. Use vivid but not harsh language. Emojis are allowed.",
    "You may clearly identify how a line escalated the conflict, but do not call anyone toxic, abusive, manipulative, or bad.",
    "The verdict is about this conversation's conflict dynamics, not moral worth.",
    `Participants: ${PARTICIPANTS.blake.name} and ${PARTICIPANTS.ryan.name}.`,
    `Case history: ${JSON.stringify(DEMO_HISTORY)}`,
    `Current conversation: ${JSON.stringify(messages)}`,
    "Return ONLY valid JSON with this schema: {\"verdict\":\"string\",\"responsibilitySplit\":{\"blake\":60,\"ryan\":40},\"keyEvidence\":[\"string\"],\"emotionalLogic\":[{\"speaker\":\"string\",\"read\":\"string\"}],\"escalationMoment\":{\"quote\":\"string\",\"explanation\":\"string\"},\"repairOrder\":[\"string\"],\"judgeStamp\":\"string\"}."
  ].join("\n\n");
}
