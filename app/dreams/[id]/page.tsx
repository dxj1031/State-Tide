import Link from "next/link";
import { notFound } from "next/navigation";
import entries from "@/data/journal-entries.json";
import { getDreamRepository } from "@/lib/dream-store";
import type { JournalEntry } from "@/lib/matching";
import DreamDetailClient from "./DreamDetailClient";

export const runtime = "nodejs";

type DreamDetailPageProps = {
  params: Promise<{ id: string }>;
};

export default async function DreamDetailPage({ params }: DreamDetailPageProps) {
  const { id } = await params;
  const repository = await getDreamRepository();
  const record = await repository.getDream(id);

  if (!record) {
    notFound();
  }

  const allEntries = entries as JournalEntry[];
  const sourceEntries = allEntries.filter((entry) => record.seed.sourceEntryIds.includes(entry.id));

  return (
    <main className="page-shell">
      <nav className="top-nav" aria-label="Primary navigation">
        <Link href="/">State Tides</Link>
        <Link href="/dreams/incubate">Incubate</Link>
        <Link href="/dreams">Dream Gallery</Link>
        <Link href="/settings">Settings</Link>
      </nav>

      <section className="panel page-hero-panel">
        <p className="section-label">Dream Seed</p>
        <h1>{record.seed.title}</h1>
        <p className="summary-line">{record.seed.summary}</p>
      </section>

      <DreamDetailClient initialRecord={record} sourceEntries={sourceEntries} />
    </main>
  );
}
