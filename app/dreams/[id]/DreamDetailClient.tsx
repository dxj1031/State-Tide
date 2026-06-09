"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import type { DreamOutput, DreamOutputMode, DreamRecord } from "@/lib/dream-types";
import type { JournalEntry } from "@/lib/matching";

type DreamDetailClientProps = {
  initialRecord: DreamRecord;
  sourceEntries: JournalEntry[];
};

function modeLabel(mode: DreamOutputMode) {
  if (mode === "text") {
    return "Text Dream";
  }

  if (mode === "image") {
    return "Image Prompt";
  }

  return "Music Prompt";
}

export default function DreamDetailClient({ initialRecord, sourceEntries }: DreamDetailClientProps) {
  const [record, setRecord] = useState(initialRecord);
  const [isTranslating, setIsTranslating] = useState<DreamOutputMode | null>(null);
  const [feedbackText, setFeedbackText] = useState("");
  const [fitScore, setFitScore] = useState("4");
  const [applyScope, setApplyScope] = useState("none");
  const [feedbackStatus, setFeedbackStatus] = useState<string | null>(null);

  async function translate(targetMode: DreamOutputMode, sourceOutput: DreamOutput | null) {
    setIsTranslating(targetMode);

    try {
      const response = await fetch(`/api/dreams/${record.seed.id}/outputs`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          targetMode,
          sourceOutputId: sourceOutput?.id ?? null,
          variantOfOutputId: sourceOutput?.mode === targetMode ? sourceOutput.id : null
        })
      });

      if (!response.ok) {
        throw new Error("Translation failed.");
      }

      const output = (await response.json()) as DreamOutput;
      setRecord((current) => ({
        ...current,
        outputs: [output, ...current.outputs]
      }));
    } finally {
      setIsTranslating(null);
    }
  }

  async function submitFeedback(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedbackStatus(null);
    const response = await fetch(`/api/dreams/${record.seed.id}/feedback`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        fitScore: Number(fitScore),
        styleFeedback: feedbackText,
        applyScope
      })
    });

    if (response.ok) {
      setFeedbackText("");
      setFeedbackStatus("Feedback saved.");
    } else {
      setFeedbackStatus("Feedback could not be saved.");
    }
  }

  const primaryOutput = record.outputs[0] ?? null;

  return (
    <section className="dream-detail-layout">
      <article className="panel dream-detail-panel">
        <p className="section-label">Source Tide</p>
        <div className="dream-meta-grid">
          <span>{record.seed.cycle.startDate} - {record.seed.cycle.endDate}</span>
          <span>{record.seed.cycle.type}</span>
          <span>{record.seed.tokenEstimate.level} token use</span>
        </div>
        <p className="summary-line">{record.seed.cycle.rationale}</p>
        <div className="source-link-list">
          {sourceEntries.map((entry) => (
            <Link key={entry.id} href={`/entries/${entry.id}`}>
              {entry.date}: {entry.text}
            </Link>
          ))}
        </div>
      </article>

      <article className="panel dream-detail-panel">
        <p className="section-label">Core Imagery</p>
        <div className="imagery-cluster">
          {record.seed.imageryCluster.map((item) => (
            <span key={item}>{item}</span>
          ))}
        </div>
        <p className="summary-line">Dominant emotions: {record.seed.dominantEmotions.join(", ")}</p>
        <p className="summary-line">Style: {record.seed.coreStyle}</p>
      </article>

      <article className="panel dream-detail-panel">
        <p className="section-label">Explanation Layer</p>
        <div className="explanation-list">
          {record.seed.explanation.map((item) => (
            <div key={`${item.label}-${item.source}`} className="explanation-item">
              <strong>{item.label}</strong>
              <span>{item.source}</span>
              <p>{item.rationale}</p>
            </div>
          ))}
        </div>
      </article>

      <article className="panel dream-detail-panel">
        <div className="timeline-header">
          <div>
            <p className="section-label">Outputs</p>
            <h2>Translate without changing the seed.</h2>
          </div>
          <div className="action-row">
            {(["text", "image", "music"] as DreamOutputMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                className="secondary-button"
                disabled={isTranslating !== null}
                onClick={() => translate(mode, primaryOutput)}
              >
                {isTranslating === mode ? "Translating..." : modeLabel(mode)}
              </button>
            ))}
          </div>
        </div>

        <div className="output-stack">
          {record.outputs.map((output) => (
            <section key={output.id} className="output-block">
              <div className="match-header">
                <h3>{modeLabel(output.mode)}</h3>
                <span>{new Date(output.createdAt).toLocaleString("en-US")}</span>
              </div>
              <p className="entry-text">{output.content}</p>
              <details open>
                <summary>Prompt details</summary>
                {output.prompt ? <pre>{output.prompt}</pre> : <p>Direct dream text; no separate prompt.</p>}
                {output.negativePrompt ? (
                  <>
                    <p className="reading-label">Negative Prompt</p>
                    <pre>{output.negativePrompt}</pre>
                  </>
                ) : null}
                <p className="reading-label">Technical Notes</p>
                <ul>
                  {output.technicalNotes.map((note) => (
                    <li key={note}>{note}</li>
                  ))}
                </ul>
              </details>
            </section>
          ))}
        </div>
      </article>

      <article className="panel dream-detail-panel">
        <p className="section-label">Feedback</p>
        <form className="feedback-form" onSubmit={submitFeedback}>
          <label>
            Understanding fit
            <select value={fitScore} onChange={(event) => setFitScore(event.target.value)}>
              <option value="5">5 - Very close</option>
              <option value="4">4 - Mostly close</option>
              <option value="3">3 - Mixed</option>
              <option value="2">2 - Distant</option>
              <option value="1">1 - Not close</option>
            </select>
          </label>
          <label>
            Style feedback
            <textarea
              value={feedbackText}
              onChange={(event) => setFeedbackText(event.target.value)}
              rows={4}
              placeholder="Example: keep the tide imagery, but make future dreams less ornate."
            />
          </label>
          <label>
            Apply this feedback
            <select value={applyScope} onChange={(event) => setApplyScope(event.target.value)}>
              <option value="none">Do not apply to future dreams</option>
              <option value="future_dreams">Apply to future dreams</option>
              <option value="same_cycle_type">Apply to this cycle type</option>
            </select>
          </label>
          <button type="submit">Save feedback</button>
          {feedbackStatus ? <p className="meta-line">{feedbackStatus}</p> : null}
        </form>
      </article>
    </section>
  );
}
