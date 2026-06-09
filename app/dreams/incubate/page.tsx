import Link from "next/link";
import entries from "@/data/journal-entries.json";
import { getDreamRepository } from "@/lib/dream-store";
import { recommendDreamCycles } from "@/lib/dream-cycles";
import type { JournalEntry } from "@/lib/matching";
import DreamIncubateClient from "./DreamIncubateClient";

export const runtime = "nodejs";

type IncubatePageProps = {
  searchParams: Promise<{ entry?: string }>;
};

export default async function DreamIncubatePage({ searchParams }: IncubatePageProps) {
  const { entry } = await searchParams;
  const repository = await getDreamRepository();
  const allEntries = entries as JournalEntry[];
  const styleMemory = await repository.getStyleMemory();
  const settings = await repository.getGenerationSettings();
  const recommendations = recommendDreamCycles(allEntries);

  return (
    <main className="page-shell">
      <nav className="top-nav" aria-label="Primary navigation">
        <Link href="/">State Tides</Link>
        <Link href="/dreams">Dream Gallery</Link>
        <Link href="/settings">Settings</Link>
      </nav>

      <section className="panel page-hero-panel">
        <p className="section-label">Dream Incubation</p>
        <h1>Choose the tide that should become a dream.</h1>
        <p className="summary-line">
          Select source fragments, review the recommended cycle, and approve the estimated cost
          before the archive grows a new dream seed.
        </p>
      </section>

      <DreamIncubateClient
        entries={allEntries}
        recommendations={recommendations}
        styleMemory={styleMemory}
        settings={settings}
        initialEntryId={entry ?? null}
      />
    </main>
  );
}
