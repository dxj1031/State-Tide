"use client";

import Link from "next/link";
import { PointerEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  buildManualDreamCycle,
  classifyDreamAbstraction,
  suggestedModeForAbstraction
} from "@/lib/dream-cycles";
import { estimateDreamTokens } from "@/lib/dream-prompt";
import type {
  DreamCycleCandidate,
  DreamGenerationSettings,
  DreamOutputMode,
  DreamRecord,
  DreamStyleMemory
} from "@/lib/dream-types";
import type { JournalEntry } from "@/lib/matching";

type DreamIncubateClientProps = {
  entries: JournalEntry[];
  recommendations: DreamCycleCandidate[];
  styleMemory: DreamStyleMemory;
  settings: DreamGenerationSettings;
  initialEntryId: string | null;
};

function parseDate(date: string) {
  return new Date(`${date}T00:00:00`);
}

function daysBetween(start: string, end: string) {
  return Math.round((parseDate(end).getTime() - parseDate(start).getTime()) / 86400000);
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(new Date(`${date}T00:00:00`));
}

function sortEntries(entries: JournalEntry[]) {
  return [...entries].sort((a, b) => a.date.localeCompare(b.date));
}

function modeLabel(mode: DreamOutputMode) {
  if (mode === "text") {
    return "Text dream";
  }

  if (mode === "image") {
    return "Image prompt";
  }

  return "Music prompt";
}

function abstractionCopy(level: ReturnType<typeof classifyDreamAbstraction>) {
  if (level === "abstract") {
    return "This tide is mostly emotion, metaphor, and state language. Music can hold the most abstract material.";
  }

  if (level === "concrete") {
    return "This tide includes events, objects, and concrete details. Image can preserve those visible anchors.";
  }

  return "This tide balances emotion with concrete detail. Text can keep both structure and metaphor legible.";
}

export default function DreamIncubateClient({
  entries,
  recommendations,
  styleMemory,
  settings,
  initialEntryId
}: DreamIncubateClientProps) {
  const sortedEntries = useMemo(() => sortEntries(entries), [entries]);
  const initialIds = useMemo(() => {
    if (initialEntryId && entries.some((entry) => entry.id === initialEntryId)) {
      return [initialEntryId];
    }

    return recommendations[0]?.entryIds ?? sortedEntries.slice(0, 4).map((entry) => entry.id);
  }, [entries, initialEntryId, recommendations, sortedEntries]);
  const [selectedEntryIds, setSelectedEntryIds] = useState<string[]>(initialIds);
  const selectedEntries = useMemo(
    () => sortedEntries.filter((entry) => selectedEntryIds.includes(entry.id)),
    [selectedEntryIds, sortedEntries]
  );
  const manualCycle = useMemo(() => buildManualDreamCycle(selectedEntries), [selectedEntries]);
  const [selectedCycleId, setSelectedCycleId] = useState(recommendations[0]?.id ?? "manual");
  const cycleOptions = useMemo(
    () => [manualCycle, ...recommendations].filter((cycle): cycle is DreamCycleCandidate => cycle !== null),
    [manualCycle, recommendations]
  );
  const selectedCycle =
    cycleOptions.find((cycle) => cycle.id === selectedCycleId) ?? manualCycle ?? recommendations[0] ?? null;
  const cycleEntries = useMemo(
    () =>
      selectedCycle
        ? sortedEntries.filter((entry) => selectedCycle.entryIds.includes(entry.id))
        : selectedEntries,
    [selectedCycle, selectedEntries, sortedEntries]
  );
  const recommendedAbstraction = useMemo(
    () => classifyDreamAbstraction(cycleEntries.length > 0 ? cycleEntries : selectedEntries),
    [cycleEntries, selectedEntries]
  );
  const suggestedMode = useMemo(() => {
    return settings.output_preference === "auto"
      ? suggestedModeForAbstraction(recommendedAbstraction)
      : settings.output_preference;
  }, [recommendedAbstraction, settings.output_preference]);
  const [modeSource, setModeSource] = useState<"auto" | "manual">("auto");
  const [mode, setMode] = useState<DreamOutputMode>(suggestedMode);
  const estimate = selectedCycle
    ? estimateDreamTokens(cycleEntries, selectedCycle, mode, styleMemory)
    : null;
  const approvalKey = selectedCycle && estimate
    ? `${selectedCycle.id}:${mode}:${estimate.estimatedTokens}:${cycleEntries.map((entry) => entry.id).join(",")}`
    : "";
  const [approvedKey, setApprovedKey] = useState("");
  const [generatedRecord, setGeneratedRecord] = useState<DreamRecord | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timelineRef = useRef<HTMLDivElement | null>(null);
  const [dragStart, setDragStart] = useState<number | null>(null);
  const [dragEnd, setDragEnd] = useState<number | null>(null);
  const range = useMemo(
    () => ({
      start: sortedEntries[0]?.date ?? "",
      end: sortedEntries.at(-1)?.date ?? "",
      totalDays: Math.max(1, daysBetween(sortedEntries[0]?.date ?? "", sortedEntries.at(-1)?.date ?? ""))
    }),
    [sortedEntries]
  );

  const entryPositions = useMemo(
    () =>
      sortedEntries.map((entry) => ({
        entry,
        x: range.start ? 4 + (daysBetween(range.start, entry.date) / range.totalDays) * 92 : 4
      })),
    [range, sortedEntries]
  );
  const estimateApproved = !settings.require_token_approval || approvedKey === approvalKey;

  useEffect(() => {
    if (modeSource === "auto") {
      setMode(suggestedMode);
    }
  }, [modeSource, suggestedMode]);

  function selectCycle(cycle: DreamCycleCandidate) {
    setSelectedCycleId(cycle.id);
    setSelectedEntryIds(cycle.entryIds);
    setApprovedKey("");
    setGeneratedRecord(null);
  }

  function applyPointerSelection(startX: number, endX: number) {
    const left = Math.min(startX, endX);
    const right = Math.max(startX, endX);
    const nextIds = entryPositions
      .filter((point) => point.x >= left && point.x <= right)
      .map((point) => point.entry.id);

    if (nextIds.length > 0) {
      setSelectedEntryIds(nextIds);
      setSelectedCycleId("manual");
      setApprovedKey("");
      setGeneratedRecord(null);
    }
  }

  function pointerFraction(event: PointerEvent<HTMLDivElement>) {
    const rect = timelineRef.current?.getBoundingClientRect();

    if (!rect) {
      return 0;
    }

    return Math.max(0, Math.min(100, ((event.clientX - rect.left) / rect.width) * 100));
  }

  async function generateDream() {
    if (!selectedCycle || !estimate) {
      return;
    }

    if (settings.require_token_approval && approvedKey !== approvalKey) {
      setError("Approve the current token estimate before incubating this dream.");
      return;
    }

    setError(null);
    setIsGenerating(true);

    try {
      const response = await fetch("/api/dreams/incubate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          cycle: selectedCycle,
          mode
        })
      });

      if (!response.ok) {
        throw new Error("Dream incubation failed.");
      }

      const payload = (await response.json()) as DreamRecord;
      setGeneratedRecord(payload);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Dream incubation failed.");
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <section className="dream-workspace">
      <article className="panel incubation-panel">
        <div className="timeline-header">
          <div>
            <p className="section-label">Source Fragments</p>
            <h2>Frame the tide.</h2>
          </div>
          <p className="timeline-note" aria-live="polite">
            {selectedEntries.length} fragment{selectedEntries.length === 1 ? "" : "s"} selected.
          </p>
        </div>

        <div
          ref={timelineRef}
          className="brush-timeline"
          onPointerDown={(event) => {
            const x = pointerFraction(event);
            setDragStart(x);
            setDragEnd(x);
          }}
          onPointerMove={(event) => {
            if (dragStart === null) {
              return;
            }

            setDragEnd(pointerFraction(event));
          }}
          onPointerUp={(event) => {
            if (dragStart === null) {
              return;
            }

            const end = pointerFraction(event);
            applyPointerSelection(dragStart, end);
            setDragStart(null);
            setDragEnd(null);
          }}
        >
          <div className="brush-track" />
          {dragStart !== null && dragEnd !== null ? (
            <div
              className="brush-selection"
              style={{
                left: `${Math.min(dragStart, dragEnd)}%`,
                width: `${Math.abs(dragEnd - dragStart)}%`
              }}
            />
          ) : null}
          {entryPositions.map((point) => {
            const selected = selectedEntryIds.includes(point.entry.id);

            return (
              <button
                key={point.entry.id}
                type="button"
                className={`brush-point ${selected ? "is-selected" : ""}`}
                style={{ left: `${point.x}%` }}
                onClick={() => {
                  setSelectedEntryIds((current) =>
                    current.includes(point.entry.id)
                      ? current.filter((id) => id !== point.entry.id)
                      : [...current, point.entry.id]
                  );
                  setSelectedCycleId("manual");
                  setApprovedKey("");
                }}
              >
                <span>{point.entry.markers?.[0] ?? "."}</span>
              </button>
            );
          })}
        </div>

        <div className="date-range-controls">
          <label>
            Start
            <select
              value={selectedEntries[0]?.id ?? ""}
              onChange={(event) => {
                const startIndex = sortedEntries.findIndex((entry) => entry.id === event.target.value);
                const endIndex = sortedEntries.findIndex(
                  (entry) => entry.id === selectedEntries.at(-1)?.id
                );
                const left = Math.max(0, startIndex);
                const right = Math.max(left, endIndex >= 0 ? endIndex : left);
                setSelectedEntryIds(sortedEntries.slice(left, right + 1).map((entry) => entry.id));
                setSelectedCycleId("manual");
                setApprovedKey("");
              }}
            >
              {sortedEntries.map((entry) => (
                <option key={`start-${entry.id}`} value={entry.id}>
                  {entry.date}
                </option>
              ))}
            </select>
          </label>
          <label>
            End
            <select
              value={selectedEntries.at(-1)?.id ?? ""}
              onChange={(event) => {
                const startIndex = sortedEntries.findIndex(
                  (entry) => entry.id === selectedEntries[0]?.id
                );
                const endIndex = sortedEntries.findIndex((entry) => entry.id === event.target.value);
                const left = Math.max(0, startIndex);
                const right = Math.max(left, endIndex);
                setSelectedEntryIds(sortedEntries.slice(left, right + 1).map((entry) => entry.id));
                setSelectedCycleId("manual");
                setApprovedKey("");
              }}
            >
              {sortedEntries.map((entry) => (
                <option key={`end-${entry.id}`} value={entry.id}>
                  {entry.date}
                </option>
              ))}
            </select>
          </label>
        </div>
      </article>

      <article className="panel incubation-panel">
        <p className="section-label">Suggested Incubations</p>
        <div className="cycle-grid" role="radiogroup" aria-label="Dream cycle candidates">
          {cycleOptions.map((cycle) => (
            <button
              key={cycle.id}
              type="button"
              className={`cycle-card ${selectedCycle?.id === cycle.id ? "is-selected" : ""}`}
              role="radio"
              aria-checked={selectedCycle?.id === cycle.id}
              onClick={() => selectCycle(cycle)}
            >
              <span className="cycle-type">{cycle.type}</span>
              <strong>{cycle.label}</strong>
              <span>
                {formatDate(cycle.startDate)} - {formatDate(cycle.endDate)}
              </span>
              <p>{cycle.rationale}</p>
            </button>
          ))}
        </div>
      </article>

      <article className="panel incubation-panel">
        <p className="section-label">Dream Form</p>
        <div className="mode-segment" role="radiogroup" aria-label="Dream output mode">
          {(["text", "image", "music"] as DreamOutputMode[]).map((item) => (
            <button
              key={item}
              type="button"
              className={mode === item ? "is-selected" : ""}
              role="radio"
              aria-checked={mode === item}
              onClick={() => {
                setMode(item);
                setModeSource("manual");
                setApprovedKey("");
              }}
            >
              {modeLabel(item)}
            </button>
          ))}
        </div>
        <div className="recommended-mode-card">
          <div>
            <p className="reading-label">Suggested Form</p>
            <strong>{modeLabel(suggestedMode)}</strong>
            <p>{abstractionCopy(recommendedAbstraction)}</p>
          </div>
          <button
            type="button"
            className="secondary-button"
            onClick={() => {
              setModeSource("auto");
              setMode(suggestedMode);
              setApprovedKey("");
            }}
          >
            Use recommended mode
          </button>
        </div>
        {estimate ? (
          <div className="token-card">
            <p className="reading-label">Incubation Cost</p>
            <strong>
              ~{estimate.estimatedTokens.toLocaleString()} tokens - {estimate.level}
            </strong>
            <p>{estimate.reason}</p>
            {settings.require_token_approval ? (
              <>
                <button
                  type="button"
                  className={`secondary-button approval-button ${estimateApproved ? "is-approved" : ""}`}
                  onClick={() => {
                    setApprovedKey(approvalKey);
                    setError(null);
                  }}
                >
                  {estimateApproved ? "Estimate approved" : "Approve this estimate"}
                </button>
                <p className={`approval-status ${estimateApproved ? "is-approved" : ""}`} aria-live="polite">
                  {estimateApproved
                    ? "Approved for the current cycle, mode, and source fragments."
                    : "Approval is required before incubation. Changing the cycle or mode resets approval."}
                </p>
              </>
            ) : (
              <p className="meta-line">Approval is skipped in settings.</p>
            )}
          </div>
        ) : null}
        <button type="button" disabled={isGenerating || !selectedCycle} onClick={generateDream}>
          {isGenerating ? "Incubating..." : "Incubate Dream"}
        </button>
        {error ? <p className="error-line">{error}</p> : null}
      </article>

      {generatedRecord ? (
        <article className="panel incubation-panel">
          <p className="section-label">Incubated Dream</p>
          <h2>{generatedRecord.seed.title}</h2>
          <p className="summary-line">{generatedRecord.seed.summary}</p>
          <div className="prompt-box">
            <p className="reading-label">{modeLabel(generatedRecord.outputs[0]?.mode ?? mode)}</p>
            <p>{generatedRecord.outputs[0]?.content}</p>
          </div>
          <div className="action-row">
            <Link className="button-link" href={`/dreams/${generatedRecord.seed.id}`}>
              Open dream
            </Link>
            <Link className="button-link secondary-link" href="/dreams">
              Dream Gallery
            </Link>
          </div>
        </article>
      ) : null}
    </section>
  );
}
