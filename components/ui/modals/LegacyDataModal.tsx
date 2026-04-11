"use client";

import React, { useEffect, useRef, useState } from 'react';
import { ExportSchema } from '@/lib/types';
import { useBubbleStore } from '@/store/useBubbleStore';
import { GlassButton } from '../GlassButton';

type Props = {
  open: boolean;
  onClose: () => void;
};

type PendingImport = {
  fileName: string;
  raw: ExportSchema;
  summary: {
    version: number | 'unknown';
    categories: number;
    people: number;
    labels: number;
  };
};

export function LegacyDataModal({ open, onClose }: Props) {
  const importData = useBubbleStore((s) => s.importData);
  const exportData = useBubbleStore((s) => s.exportData);
  const categoryCount = useBubbleStore((s) => s.categories.length);
  const bubbleCount = useBubbleStore((s) => s.people.length);
  const labelCount = useBubbleStore((s) => s.labels.length);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingImport, setPendingImport] = useState<PendingImport | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setPendingImport(null);
      setStatusMessage(null);
      setErrorMessage(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  async function handleFileSelection(file: File | null | undefined) {
    if (!file) return;

    setErrorMessage(null);
    setStatusMessage(null);

    try {
      const text = await file.text();
      const json = JSON.parse(text);

      if (!isImportableExportSchema(json)) {
        throw new Error('Invalid Bubble data file.');
      }

      setPendingImport({
        fileName: file.name,
        raw: json,
        summary: {
          version: typeof json.version === 'number' ? json.version : 'unknown',
          categories: json.categories.length,
          people: json.people.length,
          labels: Array.isArray(json.labels) ? json.labels.length : 0,
        },
      });
      setStatusMessage('File ready to import.');
    } catch (error) {
      setPendingImport(null);
      setErrorMessage(error instanceof Error ? error.message : 'Could not read that file.');
    }
  }

  function handleExportCurrentData() {
    try {
      const blob = new Blob([JSON.stringify(exportData(), null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'bubble-data-backup.json';
      anchor.click();
      URL.revokeObjectURL(url);
      setStatusMessage('Downloaded a backup of your current hosted Bubble data.');
      setErrorMessage(null);
    } catch {
      setErrorMessage('Could not export current Bubble data.');
    }
  }

  function handleImport() {
    if (!pendingImport) return;
    importData(pendingImport.raw);
    setStatusMessage('Imported legacy Bubble data. Cloud sync will save it to your account.');
    setErrorMessage(null);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/35 backdrop-blur-sm" onClick={onClose} />

      <div className="glass relative z-10 w-[min(680px,94vw)] rounded-2xl p-5">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <div className="text-2xl font-display tracking-tight-ui">Legacy Data</div>
            <div className="mt-1 text-sm text-gray-700">
              Import an older `bubble-data.json` snapshot into your hosted Bubble account, or export a backup of your
              current hosted data first.
            </div>
          </div>

          <GlassButton type="button" onClick={onClose}>
            Close
          </GlassButton>
        </div>

        <div className="grid gap-4">
          <div className="rounded-xl border border-white/50 bg-white/45 p-4">
            <div className="text-sm font-nav tracking-tight-ui text-gray-900">Current Hosted Data</div>
            <div className="mt-2 text-sm text-gray-700">
              {categoryCount} categories, {bubbleCount} bubbles, {labelCount} labels
            </div>
            <div className="mt-3">
              <GlassButton type="button" onClick={handleExportCurrentData}>
                Export Current Data
              </GlassButton>
            </div>
          </div>

          <div className="rounded-xl border border-white/50 bg-white/45 p-4">
            <div className="text-sm font-nav tracking-tight-ui text-gray-900">Import Legacy JSON</div>
            <div className="mt-2 text-sm text-gray-700">
              Import replaces the current Bubble state in this browser and then autosaves that state to your hosted
              account. Export a backup first if you may want to undo it.
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <GlassButton type="button" onClick={() => fileInputRef.current?.click()}>
                Choose JSON File
              </GlassButton>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={(event) => void handleFileSelection(event.target.files?.[0])}
              />
              {pendingImport ? <div className="text-sm text-gray-700">{pendingImport.fileName}</div> : null}
            </div>

            {pendingImport ? (
              <div className="mt-4 rounded-xl border border-white/60 bg-white/60 p-4 text-sm text-gray-800">
                <div>Ready to import:</div>
                <div className="mt-2">
                  Version {pendingImport.summary.version}, {pendingImport.summary.categories} categories,{' '}
                  {pendingImport.summary.people} bubbles, {pendingImport.summary.labels} labels
                </div>
              </div>
            ) : null}

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <GlassButton type="button" onClick={handleImport} disabled={!pendingImport}>
                Import Into Hosted Bubble
              </GlassButton>
            </div>
          </div>

          {statusMessage ? (
            <div className="rounded-xl border border-emerald-200/80 bg-emerald-50/80 px-4 py-3 text-sm text-emerald-900">
              {statusMessage}
            </div>
          ) : null}

          {errorMessage ? (
            <div className="rounded-xl border border-red-200/80 bg-red-50/80 px-4 py-3 text-sm text-red-800">
              {errorMessage}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function isImportableExportSchema(value: unknown): value is ExportSchema {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<ExportSchema>;
  return Array.isArray(candidate.categories) && Array.isArray(candidate.people);
}
