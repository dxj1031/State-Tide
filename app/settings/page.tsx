import Link from "next/link";
import { getDreamRepository } from "@/lib/dream-store";
import SettingsClient from "./SettingsClient";

export const runtime = "nodejs";

export default async function SettingsPage() {
  const repository = await getDreamRepository();
  const settings = await repository.getGenerationSettings();
  const styleMemory = await repository.getStyleMemory();

  return (
    <main className="page-shell">
      <nav className="top-nav" aria-label="Primary navigation">
        <Link href="/">State Tides</Link>
        <Link href="/dreams/incubate">Incubate</Link>
        <Link href="/dreams">Dream Gallery</Link>
      </nav>

      <section className="panel page-hero-panel">
        <p className="section-label">Settings</p>
        <h1>Dream generation memory.</h1>
        <p className="summary-line">
          Configure approval, detail exposure, tone, output preference, and reusable style memory.
        </p>
      </section>

      <SettingsClient initialSettings={settings} initialStyleMemory={styleMemory} />
    </main>
  );
}
