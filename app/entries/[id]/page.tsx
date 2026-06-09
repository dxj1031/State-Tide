import Link from "next/link";
import { notFound } from "next/navigation";
import entries from "@/data/journal-entries.json";
import stateNodes from "@/data/state-nodes.json";
import { findSimilarEntries, type JournalEntry } from "@/lib/matching";
import { heuristicClassifyState } from "@/lib/state-classification";

type EntryPageProps = {
  params: Promise<{ id: string }>;
};

function formatDate(date: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric"
  }).format(new Date(`${date}T00:00:00`));
}

export default async function EntryCbtPage({ params }: EntryPageProps) {
  const { id } = await params;
  const allEntries = entries as JournalEntry[];
  const entry = allEntries.find((item) => item.id === id);

  if (!entry) {
    notFound();
  }

  const classification = heuristicClassifyState(entry.text, stateNodes);
  const timeline = findSimilarEntries(
    `${classification.label} ${classification.record.tags.join(" ")} ${entry.text}`,
    allEntries
  );
  const relatedEntry = timeline.relatedTimeline.find((item) => item.id === entry.id);

  return (
    <main className="page-shell">
      <nav className="top-nav" aria-label="Primary navigation">
        <Link href="/">State Tides</Link>
        <Link href="/dreams/incubate">Incubate</Link>
        <Link href="/dreams">Dream Gallery</Link>
        <Link href="/settings">Settings</Link>
      </nav>

      <section className="panel page-hero-panel">
        <p className="section-label">CBT Entry</p>
        <h1>{formatDate(entry.date)}</h1>
        <p className="summary-line">{entry.text}</p>
      </section>

      <section className="results-grid">
        <article className="panel summary-panel">
          <p className="section-label">Thought Record</p>
          <div className="reading-grid">
            <article className="reading-card">
              <p className="reading-label">Trigger</p>
              <p className="reading-value">{classification.record.situation ?? entry.text}</p>
            </article>
            <article className="reading-card">
              <p className="reading-label">Automatic Thought</p>
              <p className="reading-value">
                {classification.record.automatic_thought ?? "Not clearly stated."}
              </p>
            </article>
            <article className="reading-card">
              <p className="reading-label">Emotions</p>
              <p className="reading-value">{classification.record.emotion_labels.join(", ")}</p>
            </article>
            <article className="reading-card">
              <p className="reading-label">Intensity</p>
              <p className="reading-value">{classification.record.emotion_intensity}/10</p>
            </article>
            <article className="reading-card">
              <p className="reading-label">Behavior</p>
              <p className="reading-value">{classification.record.behavior ?? "Not clearly stated."}</p>
            </article>
            <article className="reading-card">
              <p className="reading-label">Alternative Frame</p>
              <p className="reading-value">
                {classification.record.alternative_framing ?? "This state can recur without being continuous."}
              </p>
            </article>
          </div>
        </article>

        <article className="panel matches-panel">
          <p className="section-label">Tide Context</p>
          <h2>{classification.label}</h2>
          <p className="summary-line">
            Markers: {entry.markers?.join(" ") || "none"}. Next action: {entry.next_action ?? "not recorded"}.
          </p>
          {relatedEntry ? (
            <div className="match-card">
              <p className="reading-label">Gap Evidence</p>
              {relatedEntry.nextRelatedDate ? (
                <p className="entry-text">
                  Next related entry appears on {formatDate(relatedEntry.nextRelatedDate)}.
                </p>
              ) : (
                <p className="entry-text">This is the latest related point in the current sample.</p>
              )}
              {relatedEntry.hasGapBeforeNext ? (
                <p className="meta-line">Nothing like this appears for {relatedEntry.gapDays} days.</p>
              ) : relatedEntry.hasTrailingAbsence ? (
                <p className="meta-line">
                  Then nothing similar is recorded for {relatedEntry.daysWithoutRelatedAfter} days.
                </p>
              ) : null}
            </div>
          ) : null}
          <div className="action-row">
            <Link className="button-link" href={`/dreams/incubate?entry=${entry.id}`}>
              Use in dream incubation
            </Link>
            <Link className="button-link secondary-link" href="/">
              Back to State Tides
            </Link>
          </div>
        </article>
      </section>
    </main>
  );
}
