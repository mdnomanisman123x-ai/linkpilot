"use client";
import { useRef, useState } from "react";

interface Props {
  accept: string;
  multiple?: boolean;
  onFiles: (files: File[]) => void;
  title: string;
  hint: string;
}

export default function Dropzone({ accept, multiple = false, onFiles, title, hint }: Props) {
  const ref = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => ref.current?.click()}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          ref.current?.click();
        }
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const files = Array.from(e.dataTransfer.files);
        if (files.length) onFiles(multiple ? files : files.slice(0, 1));
      }}
      className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-4 py-10 text-center transition ${
        over
          ? "scale-[1.01] border-cyan-400 bg-cyan-500/10"
          : "border-slate-300 hover:border-cyan-400 hover:bg-cyan-500/5 dark:border-white/20"
      }`}
    >
      <div className="text-4xl" aria-hidden="true">
        ⬆️
      </div>
      <div className="font-display text-lg font-semibold">{title}</div>
      <div className="text-sm text-slate-500 dark:text-slate-400">{hint}</div>
      <input
        ref={ref}
        type="file"
        accept={accept}
        multiple={multiple}
        hidden
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length) onFiles(files);
          e.target.value = "";
        }}
      />
    </div>
  );
}
