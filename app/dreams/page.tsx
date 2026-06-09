import Link from "next/link";
import { getDreamRepository } from "@/lib/dream-store";
import DreamDeleteButton from "./DreamDeleteButton";

export const runtime = "nodejs";

function formatDate(date: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(new Date(date));
}

export default async function DreamsGalleryPage() {
  const repository = await getDreamRepository();
  const dreams = await repository.listDreams();

  return (
    <main className="page-shell">
      <nav className="top-nav" aria-label="Primary navigation">
        <Link href="/">State Tides</Link>
        <Link href="/dreams/incubate">Incubate</Link>
        <Link href="/settings">Settings</Link>
      </nav>

      <section className="panel page-hero-panel">
        <p className="section-label">Dream Gallery</p>
        <h1>Saved dream seeds.</h1>
        <p className="summary-line">
          A visual archive of incubated tides, their core imagery, and the forms they have taken.
        </p>
      </section>

      {dreams.length === 0 ? (
        <section className="panel empty-state-panel">
          <p className="section-label">Empty</p>
          <p className="empty-copy">No dreams have been incubated yet.</p>
          <Link className="button-link" href="/dreams/incubate">
            Start incubation
          </Link>
        </section>
      ) : (
        <section className="dream-gallery-grid">
          {dreams.map((record) => (
            <article key={record.seed.id} className="panel dream-card">
              <div className="dream-card-plate" aria-hidden="true">
                {record.seed.imageryCluster.slice(0, 4).map((image) => (
                  <span key={image}>{image}</span>
                ))}
              </div>
              <div className="dream-card-header">
                <div>
                  <p className="section-label">{record.seed.cycle.type}</p>
                  <h2>{record.seed.title}</h2>
                </div>
                <span>{formatDate(record.seed.createdAt)}</span>
              </div>
              <p className="summary-line">{record.seed.summary}</p>
              <div className="dream-meta-grid">
                <span>Cycle {record.seed.cycle.startDate} - {record.seed.cycle.endDate}</span>
                <span>{record.seed.dominantEmotions.join(", ")}</span>
                <span>{record.outputs.map((output) => output.mode).join(", ")}</span>
              </div>
              <div className="action-row">
                <Link className="button-link" href={`/dreams/${record.seed.id}`}>
                  Open
                </Link>
                <DreamDeleteButton seedId={record.seed.id} />
              </div>
            </article>
          ))}
        </section>
      )}
    </main>
  );
}
