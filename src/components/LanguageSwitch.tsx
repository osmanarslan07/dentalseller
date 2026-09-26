"use client";

import { useEffect, useLayoutEffect, useRef, useState, useTransition } from "react";
import { LANGS, Lang } from "@/i18n";
import { useLang, useT } from "@/i18n/client";
import { setLanguage } from "@/i18n/actions";

/** 🌐 English ▾ — opens a small menu of the languages, each with its flag. Saved on the
 * account and applied to this browser straight away. */
export function LanguageSwitch({ className = "" }: { className?: string }) {
  const lang = useLang();
  const t = useT();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [upward, setUpward] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const current = LANGS.find((l) => l.id === lang) ?? LANGS[0];

  // opens downward unless there's more room above (sign-in page footer, bottom of a page)
  useLayoutEffect(() => {
    if (!open || !ref.current || !menuRef.current) return;
    const box = ref.current.getBoundingClientRect();
    const height = menuRef.current.offsetHeight + 6;
    const below = window.innerHeight - box.bottom;
    setUpward(below < height && box.top > below);
    menuRef.current.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function choose(id: Lang) {
    setOpen(false);
    buttonRef.current?.focus();
    if (id !== lang) start(() => setLanguage(id));
  }

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${t("Language")}: ${current.label}`}
        disabled={pending}
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white py-1.5 pl-2.5 pr-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:text-slate-900 ${
          pending ? "opacity-60" : ""
        }`}
      >
        <GlobeIcon />
        {current.label}
        <svg viewBox="0 0 24 24" className={`h-3.5 w-3.5 text-slate-400 transition ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div
          ref={menuRef}
          role="menu"
          aria-label={t("Language")}
          onKeyDown={moveFocus}
          className={`animate-fade-in absolute right-0 z-50 w-48 rounded-xl bg-white p-1 shadow-lg ring-1 ring-slate-900/10 ${
            upward ? "bottom-full mb-1.5" : "top-full mt-1.5"
          }`}
        >
          <LanguageOptions lang={lang} asMenu onChoose={choose} />
        </div>
      )}
    </div>
  );
}

/** The same choices laid out in place — for inside a menu or sheet, where a second popup would
 * be one too many. The caller gives the "Language" heading and the layout (className). */
export function LanguageList({ className = "flex flex-col gap-0.5" }: { className?: string }) {
  const lang = useLang();
  const t = useT();
  const [pending, start] = useTransition();
  return (
    <div role="group" aria-label={t("Language")} className={`${className} ${pending ? "opacity-60" : ""}`}>
      <LanguageOptions lang={lang} disabled={pending} onChoose={(id) => id !== lang && start(() => setLanguage(id))} />
    </div>
  );
}

function LanguageOptions({
  lang,
  asMenu,
  disabled,
  onChoose,
}: {
  lang: Lang;
  asMenu?: boolean;
  disabled?: boolean;
  onChoose: (id: Lang) => void;
}) {
  return LANGS.map((l) => {
    const on = l.id === lang;
    return (
      <button
        key={l.id}
        type="button"
        {...(asMenu ? { role: "menuitemradio", "aria-checked": on } : { "aria-pressed": on })}
        lang={l.id}
        disabled={disabled}
        onClick={() => onChoose(l.id)}
        className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm ${
          on ? "bg-teal-50 font-medium text-teal-800" : "text-slate-700 hover:bg-slate-100 hover:text-slate-900"
        }`}
      >
        <Flag lang={l.id} />
        <span className="flex-1">{l.label}</span>
        {on && (
          <svg viewBox="0 0 24 24" className="h-4 w-4 text-teal-600" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M5 12.5l4.5 4.5L19 7.5" />
          </svg>
        )}
      </button>
    );
  });
}

// ↑/↓ walk the menu's options
function moveFocus(e: React.KeyboardEvent<HTMLDivElement>) {
  if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
  e.preventDefault();
  const items = [...e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]')];
  const i = items.indexOf(document.activeElement as HTMLButtonElement);
  items[(i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
}

function GlobeIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 flex-none text-slate-500" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z" />
    </svg>
  );
}

function Flag({ lang }: { lang: Lang }) {
  const cls = "h-3.5 w-5 flex-none rounded-[2px] ring-1 ring-slate-900/10";
  if (lang === "tr") {
    return (
      <svg viewBox="0 0 30 20" className={cls} aria-hidden>
        <rect width="30" height="20" fill="#E30A17" />
        <circle cx="11" cy="10" r="5" fill="#fff" />
        <circle cx="12.25" cy="10" r="4" fill="#E30A17" />
        <polygon
          points="17.3,7.7 17.86,9.23 19.49,9.29 18.2,10.29 18.65,11.86 17.3,10.95 15.95,11.86 16.4,10.29 15.11,9.29 16.74,9.23"
          fill="#fff"
          transform="rotate(-18 17.3 10)"
        />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 60 40" preserveAspectRatio="none" className={cls} aria-hidden>
      <rect width="60" height="40" fill="#012169" />
      <path d="M0,0 L60,40 M60,0 L0,40" stroke="#fff" strokeWidth="8" />
      <path d="M0,0 L60,40 M60,0 L0,40" stroke="#C8102E" strokeWidth="3" />
      <path d="M30,0 V40 M0,20 H60" stroke="#fff" strokeWidth="12" />
      <path d="M30,0 V40 M0,20 H60" stroke="#C8102E" strokeWidth="7" />
    </svg>
  );
}
