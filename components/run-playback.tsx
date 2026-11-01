"use client";

import { useEffect, useRef, useState } from "react";
import type { TraceEvent } from "@/lib/pipeline-trace";
import { RUN_SCENES, sceneFor, statusFor, exportRun, completionStatus } from "@/lib/run-playback";
import styles from "./run-playback.module.css";

const labels = ["Note", "Check", "Memory", "Model", "Record", "Decision", "Save", "Return", "History", "Timeline", "Action"];
const glyphs = ["✎", "✓", "▦", "◉", "≡", "▤", "▣", "↗", "⌕", "⌁", "→"];

function EventVisual({ event }: { event: TraceEvent }) {
  const scene = sceneFor(event);
  const fields = event.fields ?? [];
  if (scene === "record" && event.provenance) {
    return <div className={styles.record}>{event.provenance.map((field, index) => (
      <div className={styles.recordRow} key={field.field} style={{ animationDelay: `${index * 90}ms` }}>
        <span>{field.field.replaceAll("_", " ")}</span><strong>{field.value}</strong><small>{field.source}</small>
      </div>
    ))}</div>;
  }
  if ((scene === "score" || scene === "search") && event.scores?.length) {
    return <div className={styles.ranking}>{event.scores.slice(0, 5).map((score, index) => (
      <div className={styles.rank} key={score.label} style={{ animationDelay: `${index * 80}ms` }}>
        <span>{score.label}</span><div className={styles.rankTrack}>
          <i style={{ width: `${Math.min(1, score.value) * 100}%` }} />
          {event.threshold !== undefined ? <b style={{ left: `${event.threshold * 100}%` }} /> : null}
        </div><strong>{score.value.toFixed(3)}</strong>
      </div>
    ))}{event.threshold !== undefined ? <p>State boundary {event.threshold} · history overlap is a different score</p> : <p>Actual lexical / emoji overlap · not a confidence estimate</p>}</div>;
  }
  if (scene === "timeline") {
    const points = event.timeline ?? [];
    return <div className={styles.timeline}>
      <svg viewBox="0 0 800 160" aria-label={`${points.length} related records`}>
        <line x1="35" y1="83" x2="765" y2="83" className={styles.timeLine} />
        {points.map((point, index) => <g key={`${point.date}-${index}`} className={styles.timePoint} style={{ animationDelay: `${index * 55}ms` }}>
          {points[index + 1] && (point.gapDays ?? 0) > 0 ? <line x1={point.x * 8 + 5} y1="83" x2={points[index + 1].x * 8 - 5} y2="83" className={styles.gap} /> : null}
          <circle cx={point.x * 8} cy="83" r="7" /><text x={point.x * 8} y={index % 2 ? 125 : 45}>{point.date.slice(5)}</text>
        </g>)}
      </svg>
      <p>{points.length ? "Recorded dates unfold into a timeline. Amber spans are gaps between records." : "No related history — no timeline is invented."}</p>
    </div>;
  }
  if (scene === "model") {
    const local = ["fallback", "screen"].includes(event.stage);
    return <div className={styles.model}>
      <div className={styles.routes}>
        <div data-active={!local}><span className={styles.orb}>◉</span><strong>Claude</strong><small>{local ? "Not used for this step" : event.stage === "request" ? "Request sent" : event.stage === "response" ? "Response received" : "Contract prepared"}</small></div>
        <span className={styles.branch}>{local ? "↘" : "→"}</span>
        <div data-active={local} data-local="true"><span className={styles.orb}>⌘</span><strong>Local rules</strong><small>{local ? event.stage === "screen" ? "Model skipped" : "Fallback selected" : "Available if needed"}</small></div>
      </div>
      <p className={styles.payload}>{(event.code ?? event.note ?? "").slice(0, 170)}</p>
    </div>;
  }
  if (scene === "memory") {
    const count = Number(fields.find(field => field.k === "nodes")?.v ?? 0);
    return <div className={styles.memory}><div>{Array.from({ length: Math.min(12, count) }, (_, i) => <span key={i} style={{ animationDelay: `${i * 60}ms` }}>▦</span>)}</div><strong>{count} actual state nodes loaded</strong></div>;
  }
  if (event.code) return <div className={styles.note}><span>{scene === "action" ? "YOUR NEXT ACTION" : "CAPTURED INPUT"}</span><p>{event.code}</p><i /></div>;
  return <div className={styles.facts}>
    {fields.map((field, index) => <div key={field.k} style={{ animationDelay: `${index * 75}ms` }}><small>{field.k}</small><strong>{field.v}</strong></div>)}
    {event.note ? <p>{event.note}</p> : null}
  </div>;
}

export default function RunPlayback({ events, running, run }: {
  events: TraceEvent[]; running: boolean; run: { id: string; startedAt: string } | null;
}) {
  const [cursor, setCursor] = useState(0);
  const [playing, setPlaying] = useState(true);
  const container = useRef<HTMLElement>(null);
  useEffect(() => {
    if (run) container.current?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  }, [run]);
  const event = events[Math.min(cursor, events.length - 1)];
  const scene = event ? sceneFor(event) : "input";
  const atEnd = cursor >= events.length - 1;
  const awaiting = running && atEnd;
  const duration = event?.stage === "normalize" || event?.stage === "timeline" ? 1100 : 650;
  useEffect(() => {
    if (!playing || atEnd) return;
    const timer = setTimeout(() => setCursor(index => index + 1), duration);
    return () => clearTimeout(timer);
  }, [playing, atEnd, cursor, events.length, duration]);

  const visible = events.slice(0, cursor + 1);
  const previousScene = cursor > 0 ? sceneFor(events[cursor - 1]) : "gate";
  const position = Math.max(0, RUN_SCENES.indexOf(scene === "error" ? previousScene === "error" ? "gate" : previousScene : scene));
  const degraded = event?.stage === "fallback" || event?.ok === false;
  const done = events.length > 0 && atEnd && !running;
  const mode = !events.length ? "Ready for a note" : !playing ? running ? "Playback paused · capture continues" : "Playback paused · execution finished" : awaiting ? "Live · awaiting the next event" : !atEnd && !running ? "Execution finished · playing captured events" : done ? completionStatus(events) : "Live capture · automatic playback";

  const download = () => {
    if (!run) return;
    const url = URL.createObjectURL(new Blob([exportRun(run.id, run.startedAt, events)], { type: "application/json" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = `state-tides-${run.id}.json`; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return <section ref={container} className={`panel ${styles.shell}`} aria-label="Animated run" data-paused={!playing} data-degraded={degraded}>
    <header className={styles.header}>
      <div><p className="section-label">A note in motion</p><h2>Watch the whole journey.</h2></div>
      <span className={styles.mode} data-live={running} data-warning={done && completionStatus(events) !== "Current run complete"}>{mode}</span>
    </header>
    <div className={styles.stage} data-scene={scene} data-waiting={awaiting && playing}>
      <div className={styles.glow} aria-hidden="true" />
      <div className={styles.sceneHeading} aria-live="polite">
        <span className={styles.number}>{events.length ? String(cursor + 1).padStart(2, "0") : "—"}</span>
        <div><small>{event ? statusFor(event) : "Every step follows a real event"}</small><h3>{event?.title ?? "Your next note starts here."}</h3></div>
        {event ? <span className={styles.clock}>{(event.at / 1000).toFixed(2)}s<br /><small>{event.origin ?? "server"} capture</small></span> : null}
      </div>
      <div className={styles.content} key={`${cursor}-${event?.stage ?? "idle"}`}>
        {event ? <EventVisual event={event} /> : <div className={styles.idle}><span>✎</span><p>Submit a note. Follow its words through checks, a model or local rules, state decisions, and your history.</p></div>}
      </div>
      {awaiting ? <div className={styles.waiting}><i /><span>Waiting for the next real result…</span></div> : null}
    </div>
    <div className={styles.rail} aria-hidden="true">
      <svg viewBox="0 0 1000 100">
        <path d="M35 32H965" className={styles.path} />
        <path d="M35 32H965" className={styles.flow} style={{ strokeDashoffset: 930 - position * 93 }} />
        {RUN_SCENES.map((item, index) => <g key={item} data-current={scene === item} data-visited={visible.some(e => sceneFor(e) === item)}>
          <circle cx={35 + index * 93} cy="32" r="15" /><text x={35 + index * 93} y="37">{glyphs[index]}</text><text x={35 + index * 93} y="77" className={styles.railLabel}>{labels[index]}</text>
        </g>)}
        <circle cx={35 + position * 93} cy="32" r="22" className={styles.traveller} />
      </svg>
    </div>
    <footer className={styles.controls}>
      <div><button type="button" className="secondary-button" disabled={!events.length || done} onClick={() => setPlaying(value => !value)}>{playing ? "Pause animation" : "Continue animation"}</button>
        <button type="button" className="secondary-button" disabled={!events.length} onClick={() => { setCursor(0); setPlaying(true); }}>Replay this run</button>
        <button type="button" className="secondary-button" disabled={!events.length || running} onClick={download}>Export run JSON</button></div>
      <small>{events.length ? `${Math.min(cursor + 1, events.length)} / ${events.length} captured events` : "Only this run is kept. Nothing is stored as run history."}</small>
    </footer>
  </section>;
}
