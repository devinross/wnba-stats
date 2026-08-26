// ---------------------------------------------------------------------------
// Where the numbers on a page came from — gathered up and shown once, at the
// foot of the page, instead of under every card.
//
// A section used to draw its own footnote. On a team page that meant the same
// "wnba.com › Team · Box Scores" line repeated five times, each behind its own
// hairline rule, inside cards that were already fenced. So sections now
// *declare* their source rather than drawing it: <SourceRef> renders nothing
// and registers with the provider, and <PageSources> lists what registered.
//
// Entries are deduped on url + formula, which is the pair that decides whether
// two sections really share a source: the three player sections drawn from one
// game log collapse to a single line, while the three assist charts — same
// play-by-play page, different arithmetic — stay separate, because the
// arithmetic is the part worth checking.
//
// Registration happens in an effect, so the list arrives in mount order, which
// for a page of sibling sections is the order they appear on screen.
// ---------------------------------------------------------------------------

import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
} from "react";
import { C, FONT_DISPLAY } from "./palette.js";

// Two contexts, deliberately: the add/remove pair has to stay referentially
// stable or every SourceRef's effect would re-run on each registration and
// re-register forever. The list is allowed to change, and only PageSources
// reads it.
const ApiCtx = createContext(null);
const ListCtx = createContext(null);

/** url + formula: the same page reached for a different derivation is a different source. */
const idOf = (s) => `${s.url} ${s.formula || ""}`;

export function SourceProvider({ children }) {
  // id -> { source, sections: Map<title, refcount>, order, count }. A ref, not
  // state: registrations arrive one effect at a time and want merging, not
  // replaying against a stale snapshot.
  const store = useRef(new Map());
  const seq = useRef(0);
  const [version, bump] = useReducer((n) => n + 1, 0);

  const api = useMemo(
    () => ({
      add(source, section) {
        const id = idOf(source);
        let e = store.current.get(id);
        if (!e) {
          e = { id, source, sections: new Map(), order: seq.current++, count: 0 };
          store.current.set(id, e);
        }
        e.count += 1;
        if (section) e.sections.set(section, (e.sections.get(section) || 0) + 1);
        bump();
      },
      // Sections come and go as data loads and tabs switch, so both the entry
      // and the section names under it are refcounted — a source stops being
      // listed the moment nothing on the page is drawn from it.
      remove(source, section) {
        const id = idOf(source);
        const e = store.current.get(id);
        if (!e) return;
        e.count -= 1;
        if (section) {
          const n = (e.sections.get(section) || 0) - 1;
          if (n > 0) e.sections.set(section, n);
          else e.sections.delete(section);
        }
        if (e.count <= 0) store.current.delete(id);
        bump();
      },
    }),
    []
  );

  const list = useMemo(
    () =>
      [...store.current.values()]
        .sort((a, b) => a.order - b.order)
        .map((e) => ({ id: e.id, ...e.source, sections: [...e.sections.keys()] })),
    [version]
  );

  return (
    <ApiCtx.Provider value={api}>
      <ListCtx.Provider value={list}>{children}</ListCtx.Provider>
    </ApiCtx.Provider>
  );
}

/**
 * Declares that the section around it was built from `source`, so the page
 * footer can name it. Draws nothing. `section` is the heading a reader would
 * recognise it by; without one the source is still listed, just unattributed.
 */
export function SourceRef({ source, section }) {
  const api = useContext(ApiCtx);
  // sourceFor() builds a fresh object every render, so the effect keys off what
  // the object says rather than which object it is. Same reason `section` has
  // to be a plain string: a heading passed as JSX would be a new object on
  // every render, and the entry would re-register (and jump to the end of the
  // list) each time. Anything else is dropped rather than trusted.
  const name = typeof section === "string" ? section : undefined;
  const key = source ? `${idOf(source)} ${source.label}` : null;

  useEffect(() => {
    if (!api || !source) return undefined;
    api.add(source, name);
    return () => api.remove(source, name);
  }, [api, key, name]);

  return null;
}

/**
 * The one footnote for the whole page: every source that registered, in the
 * order the sections using it appear. Renders nothing on a page that declared
 * none — the salary and Virtual GM pages don't draw from stats.wnba.com.
 *
 * Closed by default, and grey rather than white, because this is provenance
 * for the reader who goes looking — it shouldn't compete with the charts. A
 * <details> rather than state of our own: it opens without JavaScript, the
 * keyboard and screen-reader behavior comes free, and browser find-in-page
 * opens it to reveal a match.
 */
export default function PageSources() {
  const list = useContext(ListCtx);
  if (!list || !list.length) return null;

  return (
    <section className="hf-container" style={{ paddingBottom: 8 }} aria-labelledby="page-sources">
      <details
        className="sources"
        style={{
          background: C.PANEL_2,
          border: `1px solid ${C.LINE}`,
          borderRadius: 16,
          marginBottom: 22,
        }}
      >
        <summary
          id="page-sources"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "13px 20px",
            cursor: "pointer",
            fontSize: 12.5,
            color: C.MUTE,
          }}
        >
          <span className="sources-chevron" aria-hidden="true" style={{ fontSize: 10, lineHeight: 1 }}>
            ▸
          </span>
          <span style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, letterSpacing: 0.2 }}>
            Sources
          </span>
          <span>
            {list.length} wnba.com {list.length === 1 ? "page" : "pages"} behind this one
          </span>
        </summary>

        <div style={{ padding: "0 20px 16px" }}>
          <p style={{ fontSize: 12, color: C.MUTE, margin: "0 0 4px", lineHeight: 1.55 }}>
            Every number on this page, and the wnba.com page it came from — open one and the rows
            should reconcile. Where a note says the arithmetic is ours, it was done here on top of
            what that page publishes.
          </p>

          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {list.map((s) => (
              <li
                key={s.id}
                className="split-2"
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(120px, 200px) 1fr",
                  rowGap: 4,
                  columnGap: 18,
                  padding: "11px 0",
                  borderTop: `1px solid ${C.LINE}`,
                }}
              >
                {/* One heading per line rather than a joined list: several of
                    them already carry a "·" of their own, so any separator
                    would read as part of a title. */}
                <span style={{ fontSize: 12, color: C.TXT, fontWeight: 600, lineHeight: 1.5 }}>
                  {s.sections.map((name) => (
                    <span key={name} style={{ display: "block" }}>
                      {name}
                    </span>
                  ))}
                </span>
                <span style={{ minWidth: 0 }}>
                  {/* Underlined rather than sat on a hairline border: the
                      hairline is the same grey as this panel's fill and all
                      but vanishes on it. */}
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      fontSize: 12,
                      color: C.BRAND,
                      textDecoration: "underline",
                      textDecorationColor: C.SEPARATOR,
                      textUnderlineOffset: 3,
                    }}
                  >
                    wnba.com › {s.label}
                  </a>
                  {s.formula && (
                    <span
                      style={{
                        display: "block",
                        fontSize: 11,
                        color: C.MUTE,
                        lineHeight: 1.55,
                        marginTop: 4,
                      }}
                    >
                      {s.formula}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </details>
    </section>
  );
}
