"use client";

import Image from "next/image";
import { FormEvent, useMemo, useState } from "react";
import {
  DEMO_HISTORY,
  PARTICIPANTS,
  STARTER_MESSAGES,
  fallbackJudgePawVerdict,
  type JudgePawVerdict,
  type PawMessage,
  type SpeakerId
} from "@/lib/judge-paw";

function nextId() {
  return `msg-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function estimateTension(messages: PawMessage[]) {
  const text = messages.map((message) => message.text).join(" ").toLowerCase();
  const hits = ["always", "never", "ignored", "failed", "dramatic", "accused", "forgotten", "hurt"].reduce(
    (count, term) => count + (text.includes(term) ? 1 : 0),
    0
  );

  return Math.min(100, 34 + hits * 9 + Math.max(0, messages.length - STARTER_MESSAGES.length) * 4);
}

function previewStatus(tension: number) {
  if (tension >= 78) {
    return "Objection energy detected 😾";
  }

  if (tension >= 58) {
    return "Tension rising, evidence forming 🐾";
  }

  return "Court is listening ⚖️";
}

function speakerLabel(speaker: SpeakerId) {
  return PARTICIPANTS[speaker].name;
}

export default function HomePage() {
  const [messages, setMessages] = useState<PawMessage[]>(STARTER_MESSAGES);
  const [drafts, setDrafts] = useState<Record<SpeakerId, string>>({
    blake: "I need you to say you understand why it felt bad, not just why it happened.",
    ryan: "I can do that. I just also need it not to become proof that I do not care."
  });
  const [verdict, setVerdict] = useState<JudgePawVerdict | null>(null);
  const [isJudging, setIsJudging] = useState(false);
  const [shakeEvidence, setShakeEvidence] = useState(false);
  const tension = useMemo(() => estimateTension(messages), [messages]);
  const fallbackPreview = useMemo(() => fallbackJudgePawVerdict(messages), [messages]);

  function addMessage(speaker: SpeakerId) {
    const text = drafts[speaker].trim();

    if (!text) {
      return;
    }

    setMessages((current) => [
      ...current,
      {
        id: nextId(),
        speaker,
        text
      }
    ]);
    setDrafts((current) => ({ ...current, [speaker]: "" }));
    setVerdict(null);
  }

  async function judgeCase(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsJudging(true);
    setShakeEvidence(false);

    try {
      const response = await fetch("/api/judge-paw", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages })
      });

      if (!response.ok) {
        throw new Error("Judgment failed.");
      }

      const nextVerdict = (await response.json()) as JudgePawVerdict;
      setVerdict(nextVerdict);
      setShakeEvidence(true);
      window.setTimeout(() => setShakeEvidence(false), 720);
    } catch {
      setVerdict(fallbackPreview);
      setShakeEvidence(true);
      window.setTimeout(() => setShakeEvidence(false), 720);
    } finally {
      setIsJudging(false);
    }
  }

  const activeVerdict = verdict ?? fallbackPreview;

  return (
    <main className="judge-shell">
      <section className="court-hero">
        <div>
          <p className="kicker">Fictional celebrity couple demo</p>
          <h1>Judge Paw</h1>
          <p>
            A tiny everyday court for messy couple arguments. Names are fictionalized demo
            placeholders using public figures; this is not a claim about real people.
          </p>
        </div>
        <div className="judge-bench">
          <Image
            src="/judge-paw.jpg"
            alt="Judge Paw mascot in a courtroom outfit"
            width={148}
            height={148}
            priority
          />
          <div>
            <span>Presiding today</span>
            <strong>Hon. Paw Paw</strong>
          </div>
        </div>
      </section>

      <section className="court-layout">
        <section className="chat-docket panel">
          <div className="section-heading">
            <p className="kicker">Live Argument Capture</p>
            <h2>Case: The late text incident</h2>
          </div>

          <div className="chat-window" aria-live="polite">
            {messages.map((message) => (
              <article key={message.id} className={`chat-bubble ${message.speaker}`}>
                <span>
                  {PARTICIPANTS[message.speaker].emoji} {speakerLabel(message.speaker)}
                </span>
                <p>{message.text}</p>
              </article>
            ))}
          </div>

          <form className="input-grid" onSubmit={judgeCase}>
            {(["blake", "ryan"] as SpeakerId[]).map((speaker) => (
              <label key={speaker} className={`speaker-input ${speaker}`}>
                <span>
                  {PARTICIPANTS[speaker].emoji} {PARTICIPANTS[speaker].shortName} says
                </span>
                <textarea
                  value={drafts[speaker]}
                  onChange={(event) =>
                    setDrafts((current) => ({ ...current, [speaker]: event.target.value }))
                  }
                  rows={3}
                />
                <button type="button" onClick={() => addMessage(speaker)}>
                  Add {PARTICIPANTS[speaker].shortName}
                </button>
              </label>
            ))}
            <button className="judge-button" type="submit" disabled={isJudging || messages.length < 4}>
              {isJudging ? "Judge Paw is sniffing evidence..." : "Judge"}
            </button>
          </form>
        </section>

        <aside className="court-sidebar">
          <section className="panel paw-meter">
            <div className="meter-top">
              <p className="kicker">Live Mood</p>
              <strong>{previewStatus(tension)}</strong>
            </div>
            <div className="meter-track">
              <span style={{ width: `${tension}%` }} />
            </div>
            <p>{tension}% courtroom tension. Judge Paw recommends evidence before rebuttal.</p>
          </section>

          <section className="panel case-history">
            <p className="kicker">Case History</p>
            <HistoryGroup title="Past Arguments" items={DEMO_HISTORY.pastArguments} />
            <HistoryGroup title="Patterns" items={DEMO_HISTORY.communicationPatterns} />
            <HistoryGroup title="Repeated Themes" items={DEMO_HISTORY.repeatedThemes} />
            <HistoryGroup title="Triggers" items={DEMO_HISTORY.emotionalTriggers} />
            <HistoryGroup title="Repair Attempts" items={DEMO_HISTORY.repairAttempts} />
          </section>
        </aside>
      </section>

      <section className={`verdict-panel panel ${shakeEvidence ? "is-shaking" : ""}`}>
        <div className="verdict-header">
          <div>
            <p className="kicker">Courtroom-Inspired Analysis</p>
            <h2>{verdict ? "Verdict delivered" : "Preview verdict"}</h2>
          </div>
          <span className="stamp">{activeVerdict.judgeStamp}</span>
        </div>

        <div className="objection-card">
          <strong>OBJECTION!</strong>
          <p>“{activeVerdict.escalationMoment.quote}”</p>
          <span>{activeVerdict.escalationMoment.explanation}</span>
        </div>

        <div className="verdict-grid">
          <article className="verdict-card main-verdict">
            <p className="kicker">Verdict</p>
            <h3>{activeVerdict.verdict}</h3>
          </article>

          <article className="verdict-card">
            <p className="kicker">Responsibility Split</p>
            <div className="split-bars">
              <SplitBar label={PARTICIPANTS.blake.shortName} value={activeVerdict.responsibilitySplit.blake} />
              <SplitBar label={PARTICIPANTS.ryan.shortName} value={activeVerdict.responsibilitySplit.ryan} />
            </div>
            <p className="fine-print">Conflict escalation responsibility, not moral worth.</p>
          </article>

          <article className="verdict-card">
            <p className="kicker">Key Evidence</p>
            <ul>
              {activeVerdict.keyEvidence.map((item) => (
                <li key={item}>🐾 {item}</li>
              ))}
            </ul>
          </article>

          <article className="verdict-card">
            <p className="kicker">Emotional Logic</p>
            <div className="logic-stack">
              {activeVerdict.emotionalLogic.map((item) => (
                <section key={`${item.speaker}-${item.read}`}>
                  <strong>{item.speaker}</strong>
                  <p>{item.read}</p>
                </section>
              ))}
            </div>
          </article>

          <article className="verdict-card repair-card">
            <p className="kicker">Repair Order</p>
            <ol>
              {activeVerdict.repairOrder.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ol>
          </article>
        </div>
      </section>
    </main>
  );
}

function HistoryGroup({ title, items }: { title: string; items: string[] }) {
  return (
    <details open>
      <summary>{title}</summary>
      <ul>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </details>
  );
}

function SplitBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="split-bar">
      <span>
        {label} <strong>{value}%</strong>
      </span>
      <div>
        <i style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}
