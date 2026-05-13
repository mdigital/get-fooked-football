'use client';

import { useRef, useState } from 'react';

/**
 * Native file input + a paste-target div. Pasting an image (from iPhone Stickers app,
 * a screenshot, Photos, etc) drops it into the file input so the parent form picks it up.
 */
export default function PasteImageField() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [filename, setFilename] = useState<string | null>(null);

  const writeToInput = (file: File) => {
    const dt = new DataTransfer();
    dt.items.add(file);
    if (fileRef.current) {
      fileRef.current.files = dt.files;
    }
    setPreview(URL.createObjectURL(file));
    setFilename(file.name);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.currentTarget.files?.[0];
    if (f) {
      setPreview(URL.createObjectURL(f));
      setFilename(f.name);
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    for (const item of Array.from(e.clipboardData.items)) {
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        const f = item.getAsFile();
        if (f) {
          e.preventDefault();
          writeToInput(f);
          return;
        }
      }
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f && f.type.startsWith('image/')) writeToInput(f);
  };

  return (
    <div>
      <input
        ref={fileRef}
        type="file"
        name="image"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="block w-full text-sm"
        onChange={handleFileChange}
      />
      <div
        className="brutal-input mt-2 cursor-text"
        onPaste={handlePaste}
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        tabIndex={0}
        role="textbox"
        aria-label="Paste image here"
      >
        {preview ? (
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview} alt="preview" className="h-14 w-14 border-[3px] border-black object-cover" />
            <span className="text-xs">{filename}</span>
          </div>
        ) : (
          <span className="text-sm opacity-100">⇩ Drag, drop, or paste an image here (⌘V works for iPhone Stickers copy-paste)</span>
        )}
      </div>
    </div>
  );
}
