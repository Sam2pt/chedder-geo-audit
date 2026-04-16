"use client";

import { useState } from "react";
import type { SnippetLanguage } from "@/lib/types";

interface Props {
  code: string;
  language?: SnippetLanguage;
  target?: string;
}

const LANG_LABEL: Record<SnippetLanguage, string> = {
  html: "HTML",
  json: "JSON",
  txt: "TEXT",
  markdown: "MARKDOWN",
  bash: "SHELL",
};

export function CodeSnippet({ code, language = "html", target }: Props) {
  const [copied, setCopied] = useState(false);

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // fallback: select in textarea
      const ta = document.createElement("textarea");
      ta.value = code;
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
      } catch {
        /* noop */
      }
      document.body.removeChild(ta);
    }
  }

  return (
    <div className="mt-3 rounded-xl overflow-hidden border border-black/[0.08] bg-[#0d1117] shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/10 bg-[#161b22]">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-white/50">
            {LANG_LABEL[language]}
          </span>
          {target && (
            <>
              <span className="text-white/20">·</span>
              <span className="text-[11px] text-white/60 truncate">
                {target}
              </span>
            </>
          )}
        </div>
        <button
          type="button"
          onClick={onCopy}
          className={`shrink-0 inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-[11px] font-semibold transition-all ${
            copied
              ? "bg-[#34c759]/20 text-[#34c759]"
              : "bg-white/5 text-white/80 hover:bg-white/10"
          }`}
          aria-label="Copy code"
        >
          {copied ? (
            <>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6L9 17l-5-5" />
              </svg>
              Copied
            </>
          ) : (
            <>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
              Copy
            </>
          )}
        </button>
      </div>
      <pre className="overflow-x-auto text-[12.5px] leading-[1.55] p-3 text-[#c9d1d9] font-mono whitespace-pre">
        <code>{code}</code>
      </pre>
    </div>
  );
}
