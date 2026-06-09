"use client";

import { FormEvent, useState } from "react";
import type {
  DreamGenerationSettings,
  DreamStyleMemory,
  DreamTone,
  DetailExposure,
  DreamOutputMode,
  ExplanationTone
} from "@/lib/dream-types";

type SettingsClientProps = {
  initialSettings: DreamGenerationSettings;
  initialStyleMemory: DreamStyleMemory;
};

function linesToArray(value: string) {
  return value
    .split(/\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function arrayToLines(value: string[]) {
  return value.join("\n");
}

export default function SettingsClient({ initialSettings, initialStyleMemory }: SettingsClientProps) {
  const [settings, setSettings] = useState(initialSettings);
  const [styleMemory, setStyleMemory] = useState(initialStyleMemory);
  const [preferredSymbols, setPreferredSymbols] = useState(arrayToLines(styleMemory.preferred_symbols));
  const [avoidedSymbols, setAvoidedSymbols] = useState(arrayToLines(styleMemory.avoided_symbols));
  const [fitNotes, setFitNotes] = useState(arrayToLines(styleMemory.perceived_fit_notes));
  const [status, setStatus] = useState<string | null>(null);

  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus(null);
    const nextStyleMemory: DreamStyleMemory = {
      ...styleMemory,
      preferred_symbols: linesToArray(preferredSymbols),
      avoided_symbols: linesToArray(avoidedSymbols),
      perceived_fit_notes: linesToArray(fitNotes)
    };

    const [settingsResponse, memoryResponse] = await Promise.all([
      fetch("/api/dreams/settings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(settings)
      }),
      fetch("/api/dreams/style-memory", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(nextStyleMemory)
      })
    ]);

    if (settingsResponse.ok && memoryResponse.ok) {
      setStyleMemory(nextStyleMemory);
      setStatus("Settings saved.");
    } else {
      setStatus("Settings could not be saved.");
    }
  }

  return (
    <form className="settings-layout" onSubmit={saveSettings}>
      <section className="panel settings-panel">
        <p className="section-label">Generation</p>
        <label className="toggle-row">
          <input
            type="checkbox"
            checked={settings.require_token_approval}
            onChange={(event) =>
              setSettings((current) => ({
                ...current,
                require_token_approval: event.target.checked
              }))
            }
          />
          Require approval before token-consuming incubation
        </label>
        <label>
          Dream tone
          <select
            value={settings.tone}
            onChange={(event) =>
              setSettings((current) => ({ ...current, tone: event.target.value as DreamTone }))
            }
          >
            <option value="gentle">Gentle</option>
            <option value="neutral">Neutral</option>
            <option value="surreal">Surreal</option>
            <option value="shadow">Shadow</option>
          </select>
        </label>
        <label>
          Detail exposure
          <select
            value={settings.detail_exposure}
            onChange={(event) =>
              setSettings((current) => ({
                ...current,
                detail_exposure: event.target.value as DetailExposure
              }))
            }
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </label>
        <label>
          Output preference
          <select
            value={settings.output_preference}
            onChange={(event) =>
              setSettings((current) => ({
                ...current,
                output_preference: event.target.value as "auto" | DreamOutputMode
              }))
            }
          >
            <option value="auto">Auto</option>
            <option value="text">Text</option>
            <option value="image">Image</option>
            <option value="music">Music</option>
          </select>
        </label>
      </section>

      <section className="panel settings-panel">
        <p className="section-label">Style Memory</p>
        <label>
          Preferred tone
          <select
            value={styleMemory.preferred_tone}
            onChange={(event) =>
              setStyleMemory((current) => ({
                ...current,
                preferred_tone: event.target.value as DreamTone
              }))
            }
          >
            <option value="gentle">Gentle</option>
            <option value="neutral">Neutral</option>
            <option value="surreal">Surreal</option>
            <option value="shadow">Shadow</option>
          </select>
        </label>
        <label>
          Explanation tone
          <select
            value={styleMemory.explanation_tone}
            onChange={(event) =>
              setStyleMemory((current) => ({
                ...current,
                explanation_tone: event.target.value as ExplanationTone
              }))
            }
          >
            <option value="clinical">Clinical</option>
            <option value="gentle">Gentle</option>
            <option value="poetic">Poetic</option>
            <option value="shadow">Shadow</option>
          </select>
        </label>
        <label>
          Text style
          <input
            value={styleMemory.text_style}
            onChange={(event) => setStyleMemory((current) => ({ ...current, text_style: event.target.value }))}
          />
        </label>
        <label>
          Image style
          <input
            value={styleMemory.image_style}
            onChange={(event) => setStyleMemory((current) => ({ ...current, image_style: event.target.value }))}
          />
        </label>
        <label>
          Music style
          <input
            value={styleMemory.music_style}
            onChange={(event) => setStyleMemory((current) => ({ ...current, music_style: event.target.value }))}
          />
        </label>
      </section>

      <section className="panel settings-panel">
        <p className="section-label">Symbols</p>
        <label>
          Preferred symbols
          <textarea
            rows={5}
            value={preferredSymbols}
            onChange={(event) => setPreferredSymbols(event.target.value)}
            placeholder="One symbol per line"
          />
        </label>
        <label>
          Avoided symbols
          <textarea
            rows={5}
            value={avoidedSymbols}
            onChange={(event) => setAvoidedSymbols(event.target.value)}
          />
        </label>
        <label>
          Feedback memory
          <textarea
            rows={5}
            value={fitNotes}
            onChange={(event) => setFitNotes(event.target.value)}
          />
        </label>
        <div className="action-row">
          <button type="button" className="secondary-button" onClick={() => setFitNotes("")}>
            Clear feedback memory
          </button>
          <button type="submit">Save settings</button>
        </div>
        {status ? <p className="meta-line">{status}</p> : null}
      </section>
    </form>
  );
}
