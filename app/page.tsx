"use client";

import { FormEvent, useMemo, useState } from "react";
import entries from "@/data/journal-entries.json";
import { extractEmoji, type RelatedEntry } from "@/lib/matching";
import type { ClassificationResult } from "@/lib/state-classification";
import {
  find_similar_entries,
  retrieve_timeline
} from "@/lib/state-tides-service";

const samplePrompt = "Detached again tonight. Restless, slowed, hard to begin anything.";
const fallbackEmoji = "\u{1FAE8}";
const quickActions = ["Rest", "Avoid", "Work a bit", "Go outside"];

function formatDate(date: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric"
  }).format(new Date(`${date}T00:00:00`));
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseDate(date: string) {
  return new Date(`${date}T00:00:00`);
}

function daysBetween(start: string, end: string) {
  return Math.round(
    (parseDate(end).getTime() - parseDate(start).getTime()) / (1000 * 60 * 60 * 24)
  );
}

function addDays(date: Date, amount: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function todayStamp() {
  return new Date().toISOString().slice(0, 10);
}

function formatAction(action: string) {
  if (!action) {
    return "not recorded";
  }

  const trimmed = action.trim();
  if (!trimmed) {
    return "not recorded";
  }

  return trimmed.charAt(0).toLowerCase() + trimmed.slice(1);
}

function buildDotTimeline(relatedTimeline: RelatedEntry[], allEntries: typeof entries) {
  if (relatedTimeline.length === 0 || allEntries.length === 0) {
    return {
      points: [] as Array<{ entry: RelatedEntry; x: number; emoji: string }>,
      gaps: [] as Array<{ id: string; left: number; width: number; gapDays: number }>,
      ticks: [] as Array<{ label: string; x: number }>,
      wavePoints: [] as Array<{ x: number; y: number }>
    };
  }

  const sortedAll = [...allEntries].sort((a, b) => a.date.localeCompare(b.date));
  const start = sortedAll[0].date;
  const end = sortedAll.at(-1)!.date;
  const totalDays = Math.max(1, daysBetween(start, end));

  const points = relatedTimeline.map((entry) => ({
    entry,
    x: 7 + (daysBetween(start, entry.date) / totalDays) * 86,
    emoji: entry.emojiOverlap[0] ?? entry.markers?.[0] ?? fallbackEmoji
  }));

  const gaps = points.flatMap((point, index) => {
    const next = points[index + 1];
    if (!next) {
      return [];
    }

    const gapDays = Math.max(0, daysBetween(point.entry.date, next.entry.date) - 1);
    if (gapDays <= 0) {
      return [];
    }

    return [
      {
        id: `gap-${point.entry.id}-${next.entry.id}`,
        left: point.x,
        width: Math.max(2, next.x - point.x),
        gapDays
      }
    ];
  });

  const ticks = [0, 0.25, 0.5, 0.75, 1].map((fraction) => {
    const date = addDays(parseDate(start), Math.round(totalDays * fraction));
    return {
      label: new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(date),
      x: 7 + fraction * 86
    };
  });

  // A soft kernel-density curve gives the timeline a tidal feel without implying
  // continuous state values between dots.
  const waveSamples = 40;
  const bandwidth = 7;
  const densities = Array.from({ length: waveSamples }, (_, index) => {
    const x = 7 + (index / (waveSamples - 1)) * 86;
    const density = points.reduce((sum, point) => {
      const distance = Math.abs(point.x - x);
      return sum + Math.exp(-(distance * distance) / (2 * bandwidth * bandwidth));
    }, 0);

    return { x, density };
  });
  const maxDensity = Math.max(1, ...densities.map((sample) => sample.density));
  const wavePoints = densities.map((sample) => ({
    x: sample.x,
    y: 80 - (sample.density / maxDensity) * 20
  }));

  return { points, gaps, ticks, wavePoints };
}

export default function HomePage() {
  const [draft, setDraft] = useState(samplePrompt);
  const [query, setQuery] = useState("");
  const [classification, setClassification] = useState<ClassificationResult | null>(null);
  const [isClassifying, setIsClassifying] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [hoveredPointId, setHoveredPointId] = useState<string | null>(null);
  const [selectedPointId, setSelectedPointId] = useState<string | null>(null);
  const [showNextPanel, setShowNextPanel] = useState(false);
  const [nextActionDraft, setNextActionDraft] = useState("");
  const [actionFeedbackVisible, setActionFeedbackVisible] = useState(false);
  const [submittedNextAction, setSubmittedNextAction] = useState<{
    action: string;
    timestamp: string;
  } | null>(null);

  const analysis = useMemo(() => retrieve_timeline(query, entries), [query]);
  const topMatches = useMemo(() => find_similar_entries(query, entries), [query]);
  const dotTimeline = useMemo(
    () => buildDotTimeline(analysis.relatedTimeline, entries),
    [analysis.relatedTimeline]
  );
  const pastActionComparisons = useMemo(
    () => topMatches.filter((entry) => entry.next_action).slice(0, 3),
    [topMatches]
  );

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setShowResults(false);
    setHoveredPointId(null);
    setSelectedPointId(null);
    setShowNextPanel(false);
    setNextActionDraft("");
    setSubmittedNextAction(null);
    setActionFeedbackVisible(false);
    setIsClassifying(true);

    try {
      const response = await fetch("/api/classify-state", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: draft })
      });

      if (!response.ok) {
        throw new Error("Classification failed.");
      }

      const nextClassification = (await response.json()) as ClassificationResult;
      setClassification(nextClassification);

      const prefix = [
        ...nextClassification.emojis,
        nextClassification.label,
        ...nextClassification.record.tags,
        ...nextClassification.fragments.flatMap((fragment) => fragment.evidence)
      ].join(" ");
      setQuery(`${prefix} ${draft}`.trim());
    } catch {
      setClassification(null);
      setQuery(draft);
    } finally {
      setIsClassifying(false);
      setIsSearching(true);
      await delay(900);
      setIsSearching(false);
      setShowResults(true);
    }
  };

  const onNextActionSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedAction = nextActionDraft.trim();

    if (!normalizedAction) {
      return;
    }

    setSubmittedNextAction({
      action: normalizedAction,
      timestamp: todayStamp()
    });
    setActionFeedbackVisible(true);
    await delay(420);
    setActionFeedbackVisible(false);
    setShowNextPanel(false);
  };

  const hasResults = topMatches.length > 0;
  const queryEmoji = extractEmoji(query);
  const markerEmoji =
    classification?.emojis[0] ??
    queryEmoji[0] ??
    topMatches.flatMap((entry) => entry.emojiOverlap).filter(Boolean)[0] ??
    fallbackEmoji;
  const hoveredPoint = dotTimeline.points.find((point) => point.entry.id === hoveredPointId) ?? null;
  const selectedPoint = dotTimeline.points.find((point) => point.entry.id === selectedPointId) ?? null;
  const activePoint = selectedPoint ?? hoveredPoint;
  const emotionDisplay = classification
    ? classification.fragments.map((fragment) => `${fragment.emoji} ${fragment.label}`).join(", ")
    : "Unclear";
  const isWorking = isClassifying || isSearching;
  const statusText = isClassifying
    ? "Structuring the note into an internal state record..."
    : isSearching
      ? "Looking for recurrence, gaps, and nearby states..."
      : null;

  return (
    <main className="page-shell">
      <section className="panel input-panel">
        <form onSubmit={onSubmit} className="journal-form">
          <div className="input-heading">
            <p className="eyebrow">State Tides</p>
            <h1>Enter a short state note.</h1>
          </div>
          <textarea
            id="journal-entry"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            rows={4}
            placeholder="Example: Detached again. Hard to begin anything. Everything feels slowed."
          />
          <div className="form-row">
            <button type="submit" disabled={isWorking}>
              {isWorking ? "Tracing..." : "Trace recurrence"}
            </button>
            <p className="hint">
              The app uses a hidden thought-record structure to infer states, links, and gaps.
            </p>
          </div>
        </form>
      </section>

      {isWorking ? (
        <section className="panel search-panel">
          <div className="search-header">
            <p className="section-label">Searching</p>
            <h2>{statusText}</h2>
          </div>
          <div className="search-animation" aria-hidden="true">
            <div className="search-wave">
              <span>{classification?.emojis[0] ?? markerEmoji}</span>
            </div>
            <div className="search-line" />
            <div className="search-grid">
              {Array.from({ length: 42 }).map((_, index) => (
                <span
                  key={`search-${index}`}
                  className="search-cell"
                  style={{ animationDelay: `${index * 30}ms` }}
                />
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {showResults && hasResults ? (
        <>
          <section className="results-grid">
            <article className="panel summary-panel">
              <p className="section-label">Analysis</p>
              <h2>You&apos;ve felt this before.</h2>
              <div className="reading-grid">
                <span className="reading-grid-line reading-grid-line-vertical" aria-hidden="true" />
                <span className="reading-grid-line reading-grid-line-horizontal" aria-hidden="true" />
                <article className="reading-card">
                  <p className="reading-label">Trigger</p>
                  <p className="reading-value">
                    {classification?.record.situation ?? draft}
                  </p>
                </article>
                <article className="reading-card">
                  <p className="reading-label">Emotions</p>
                  <p className="reading-value">{emotionDisplay}</p>
                </article>
                <article className="reading-card">
                  <p className="reading-label">Intensity</p>
                  <p className="reading-value">
                    {classification?.record.emotion_intensity ?? 0}/10
                  </p>
                </article>
                <article className="reading-card">
                  <p className="reading-label">Behavior</p>
                  <p className="reading-value">
                    {classification?.record.behavior ?? "Not clearly stated."}
                  </p>
                </article>
              </div>

              <div className="next-action-block">
                <div className="next-action-header">
                  <button
                    type="button"
                    className="secondary-button next-button"
                    onClick={() => setShowNextPanel((current) => !current)}
                  >
                    Next
                  </button>
                  {actionFeedbackVisible ? <span className="next-action-pulse" aria-hidden="true" /> : null}
                </div>

                {showNextPanel ? (
                  <form className="next-action-form" onSubmit={onNextActionSubmit}>
                    <label className="next-action-label" htmlFor="next-action-input">
                      What did you do next?
                    </label>
                    <input
                      id="next-action-input"
                      type="text"
                      value={nextActionDraft}
                      onChange={(event) => setNextActionDraft(event.target.value)}
                      placeholder="Rest, stop working, go outside..."
                    />
                    <div className="next-action-chips" role="list" aria-label="Quick actions">
                      {quickActions.map((action) => (
                        <button
                          key={action}
                          type="button"
                          className={`action-chip ${
                            nextActionDraft.toLowerCase() === action.toLowerCase() ? "is-active" : ""
                          }`}
                          onClick={() => setNextActionDraft(action)}
                        >
                          {action}
                        </button>
                      ))}
                    </div>
                    <div className="next-action-actions">
                      <button type="submit" className="secondary-button">
                        Save
                      </button>
                    </div>
                  </form>
                ) : null}

                {submittedNextAction ? (
                  <div className="next-action-comparison">
                    <p className="section-label">Next Action</p>
                    <div className="next-action-current">
                      <span>This time:</span>
                      <strong>{`\u2192 ${formatAction(submittedNextAction.action)}`}</strong>
                    </div>
                    <div className="next-action-history">
                      {pastActionComparisons.map((entry) => (
                        <button
                          key={`action-${entry.id}`}
                          type="button"
                          className="next-action-history-item"
                          onClick={() => setSelectedPointId(entry.id)}
                        >
                          <span>{formatDate(entry.date)}</span>
                          <strong>{`\u2192 ${formatAction(entry.next_action ?? "")}`}</strong>
                        </button>
                      ))}
                    </div>
                    <p className="next-action-note">You&apos;ve responded differently before.</p>
                  </div>
                ) : null}
              </div>
            </article>

            <article className="panel matches-panel">
              <p className="section-label">Top 3 similar entries</p>
              <div className="matches">
                {topMatches.map((entry) => (
                  <div key={entry.id} className="match-card">
                    <div className="match-header">
                      <h3>{formatDate(entry.date)}</h3>
                      <span>{Math.round(entry.score * 100)}% overlap</span>
                    </div>
                    <p className="entry-text">{entry.text}</p>
                    <p className="meta-line">
                      Shared terms: {[...entry.emojiOverlap, ...entry.overlap].join(", ")}
                    </p>
                    <p className="meta-line">
                      {entry.nextRelatedDate ? (
                        entry.hasGapBeforeNext ? (
                          `Then nothing like this appeared for ${entry.gapDays} day${
                            entry.gapDays === 1 ? "" : "s"
                          }.`
                        ) : (
                          "A related entry appears again the next day."
                        )
                      ) : entry.hasTrailingAbsence ? (
                        `After this, nothing similar was recorded for ${entry.daysWithoutRelatedAfter} day${
                          entry.daysWithoutRelatedAfter === 1 ? "" : "s"
                        }.`
                      ) : (
                        "This is the latest related point in the sample."
                      )}
                    </p>
                  </div>
                ))}
              </div>
            </article>
          </section>

          <section className="panel timeline-panel result-enter">
            <div className="timeline-header">
              <div>
                <p className="section-label">Timeline</p>
                <h2>Discrete appearances across time</h2>
              </div>
            </div>

            <div className="calendar-summary">
              <div className="calendar-stat">
                <span className="calendar-stat-value">{analysis.relatedTimeline.length}</span>
                <span className="calendar-stat-label">related appearances</span>
              </div>
              <div className="calendar-stat">
                <span className="calendar-stat-value">
                  {Math.max(
                    0,
                    ...analysis.relatedTimeline.map(
                      (entry) => entry.gapDays ?? entry.daysWithoutRelatedAfter ?? 0
                    )
                  )}
                </span>
                <span className="calendar-stat-label">longest recorded gap</span>
              </div>
              <div className="calendar-stat">
                <span className="calendar-stat-value">{markerEmoji}</span>
                <span className="calendar-stat-label">current state marker</span>
              </div>
            </div>

            <div className="dot-timeline" onMouseLeave={() => setHoveredPointId(null)}>
              <div className="dot-track" />
              {dotTimeline.wavePoints.length > 1 ? (
                <svg className="dot-wave" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                  <path
                    className="dot-wave-fill"
                    d={`M ${dotTimeline.wavePoints[0].x} 86 ${dotTimeline.wavePoints
                      .map((point) => `L ${point.x} ${point.y}`)
                      .join(" ")} L ${dotTimeline.wavePoints.at(-1)!.x} 86 Z`}
                  />
                  <path
                    className="dot-wave-line"
                    d={`M ${dotTimeline.wavePoints[0].x} ${dotTimeline.wavePoints[0].y} ${dotTimeline.wavePoints
                      .slice(1)
                      .map((point) => `L ${point.x} ${point.y}`)
                      .join(" ")}`}
                  />
                </svg>
              ) : null}

              {dotTimeline.ticks.map((tick) => (
                <div
                  key={`${tick.label}-${tick.x}`}
                  className="dot-tick"
                  style={{ left: `${tick.x}%` }}
                >
                  <span className="dot-tick-line" />
                  <span className="dot-tick-label">{tick.label}</span>
                </div>
              ))}

              {dotTimeline.gaps.map((gap) => {
                const activeGap =
                  activePoint &&
                  activePoint.entry.nextRelatedDate &&
                  activePoint.entry.gapDays === gap.gapDays;

                return (
                  <div
                    key={gap.id}
                    className={`dot-gap ${activeGap ? "is-active" : ""} ${
                      activePoint && !activeGap ? "is-muted" : ""
                    }`}
                    style={{
                      left: `${gap.left}%`,
                      width: `${gap.width}%`
                    }}
                  >
                    {activeGap ? <span className="dot-gap-label">Nothing like this for {gap.gapDays} days</span> : null}
                  </div>
                );
              })}

              {dotTimeline.points.map((point) => {
                const distanceDays = activePoint
                  ? Math.abs(daysBetween(activePoint.entry.date, point.entry.date))
                  : 0;
                const isHovered = hoveredPoint?.entry.id === point.entry.id;
                const isSelected = selectedPoint?.entry.id === point.entry.id;
                const isNearby = activePoint !== null && distanceDays <= 5;
                const isFar = activePoint !== null && distanceDays > 5;

                return (
                  <button
                    key={point.entry.id}
                    type="button"
                    className={`dot-point ${isHovered ? "is-hovered" : ""} ${
                      isSelected ? "is-selected" : ""
                    } ${isNearby ? "is-nearby" : ""} ${isFar ? "is-far" : ""}`}
                    style={{ left: `${point.x}%` }}
                    onMouseEnter={() => setHoveredPointId(point.entry.id)}
                    onFocus={() => setHoveredPointId(point.entry.id)}
                    onClick={() =>
                      setSelectedPointId((current) => (current === point.entry.id ? null : point.entry.id))
                    }
                  >
                    <span className="dot-point-core">{point.emoji}</span>
                  </button>
                );
              })}

              {hoveredPoint ? (
                <div
                  className="dot-tooltip"
                  style={{ left: `clamp(120px, ${hoveredPoint.x}%, calc(100% - 120px))` }}
                >
                  <p className="timeline-date">{formatDate(hoveredPoint.entry.date)}</p>
                  <p className="lens-card-text">{hoveredPoint.entry.text}</p>
                  {hoveredPoint.entry.hasGapBeforeNext ? (
                    <p className="meta-line">
                      Nothing like this for {hoveredPoint.entry.gapDays} days.
                    </p>
                  ) : hoveredPoint.entry.hasTrailingAbsence ? (
                    <p className="meta-line">
                      Then nothing similar was recorded for {hoveredPoint.entry.daysWithoutRelatedAfter} days.
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>

            <p className="hint">Move across the timeline to reveal gaps.</p>

            {selectedPoint ? (
              <div className="panel lens-expanded-panel">
                <p className="section-label">Selected Entry</p>
                <p className="summary-line">
                  {formatDate(selectedPoint.entry.date)}: {selectedPoint.entry.text}
                </p>
                {selectedPoint.entry.nextRelatedDate ? (
                  <p className="summary-line">
                    Next related entry on {formatDate(selectedPoint.entry.nextRelatedDate)}.
                  </p>
                ) : null}
                {selectedPoint.entry.hasGapBeforeNext ? (
                  <p className="summary-line">
                    Nothing like this for {selectedPoint.entry.gapDays} days.
                  </p>
                ) : selectedPoint.entry.hasTrailingAbsence ? (
                  <p className="summary-line">
                    Then nothing similar was recorded for {selectedPoint.entry.daysWithoutRelatedAfter} days.
                  </p>
                ) : null}
              </div>
            ) : null}

          </section>
        </>
      ) : null}

      {!isWorking && !showResults ? (
        <section className="panel empty-state-panel">
          <p className="section-label">Ready</p>
          <p className="empty-copy">
            Submit raw text only. The app structures it internally, then looks for recurrence and gaps.
          </p>
        </section>
      ) : null}
    </main>
  );
}
