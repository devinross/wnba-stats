import React, { useState } from "react";
import { C, FONT_DISPLAY } from "./palette";
import { SITE, NAV_LINKS } from "./config.js";
import BrandMark from "./BrandMark.jsx";
import { useLeagueData } from "./useLeagueData";
import Dashboard from "./Dashboard.jsx";
import TeamView from "./TeamView.jsx";

function Center({ children }) {
  return (
    <div style={{ minHeight: "100vh", background: C.INK, display: "grid", placeItems: "center", padding: 24 }}>
      <div style={{ maxWidth: 480, textAlign: "center", color: C.TXT }}>{children}</div>
    </div>
  );
}

// Tab pills, built like the marketing site's buttons: capsules, mono type, a
// flat plum fill when active and a hairline outline when not.
function TabButton({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`hf-btn ${active ? "hf-btn--primary" : "hf-btn--ghost"}`}
      style={{ padding: "9px 20px", fontSize: 14 }}
    >
      {children}
    </button>
  );
}

function TeamPicker({ teams, value, onChange, season }) {
  const team = teams.find((t) => t.id === value) || teams[0];
  return (
    // A bare <select> sizes itself to its *longest* option, which strands the
    // chevron far to the right of a short team name. So the label is drawn as
    // text — sized to the current team — with a transparent native select laid
    // over it for the actual interaction and keyboard/screen-reader behavior.
    <div className="team-picker" style={{ position: "relative", display: "inline-flex", alignItems: "center", gap: 8 }}>
      {/* This is the page's <h1>: the selected team is what the page is about,
          and it re-renders as you switch teams. The visible text stays the
          short team name the design calls for; the rest of the sentence is
          there for screen readers and crawlers. */}
      <h1
        style={{ fontFamily: FONT_DISPLAY, fontWeight: 600, fontSize: 22, letterSpacing: "-0.02em", lineHeight: 1.1, whiteSpace: "nowrap", margin: 0 }}
      >
        <span aria-hidden="true">{team.emoji} </span>
        {team.teamName}
        <span className="sr-only">
          {" — "}
          {team.city}
          {season ? `, ${season}` : ""} WNBA team and player stats
        </span>
      </h1>
      <span aria-hidden="true" style={{ color: C.BRAND, fontSize: 13, lineHeight: 1 }}>
        ▾
      </span>
      <select
        value={value}
        onChange={(e) => onChange(Number(e.target.value) || e.target.value)}
        aria-label="Select team"
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          opacity: 0,
          appearance: "none",
          WebkitAppearance: "none",
          border: "none",
          background: "transparent",
          cursor: "pointer",
        }}
      >
        {teams.map((t) => (
          <option key={t.id} value={t.id} style={{ color: "#111", fontWeight: 600 }}>
            {t.emoji} {t.teamName}
          </option>
        ))}
      </select>
    </div>
  );
}

// Tray-with-arrow glyph for the header download CTA (same as the main site's).
function DownloadIcon({ size = 15 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 3v12" />
      <path d="M7 11l5 5 5-5" />
      <path d="M4 19h16" />
    </svg>
  );
}

const navItemStyle = {
  fontFamily: FONT_DISPLAY,
  fontWeight: 700,
  fontSize: 15,
  color: C.TXT,
};

// The brand lockup: the app mark, this site's name, and the line naming whose
// subdomain this is. The whole thing links back to the main site.
function Logo() {
  return (
    <a
      href={SITE.parentUrl}
      style={{ display: "inline-flex", alignItems: "center", gap: 10 }}
      aria-label={`${SITE.name}, powered by ${SITE.parentName}`}
    >
      <BrandMark size={30} />
      <span style={{ display: "grid", gap: 1 }}>
        <span style={{ fontFamily: FONT_DISPLAY, fontWeight: 600, fontSize: 18, letterSpacing: "-0.01em", lineHeight: 1.1 }}>
          {SITE.name}
        </span>
        <span
          className="brand-sub"
          style={{
            fontFamily: FONT_DISPLAY,
            fontWeight: 600,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: C.MUTE,
            lineHeight: 1.1,
            whiteSpace: "nowrap",
          }}
        >
          Powered by {SITE.parentName}
        </span>
      </span>
    </a>
  );
}

// Site header, matched to the marketing site's: sticky, hairline bottom rule,
// blurred translucent page color behind it, mono nav, plum download capsule.
function SiteHeader() {
  const [open, setOpen] = useState(false);
  return (
    <header
      style={{
        position: "sticky",
        top: 0,
        zIndex: 50,
        backdropFilter: "saturate(140%) blur(10px)",
        WebkitBackdropFilter: "saturate(140%) blur(10px)",
        background: "color-mix(in srgb, var(--ink) 78%, transparent)",
        borderBottom: `1px solid ${C.LINE}`,
      }}
    >
      <div
        className="hf-container"
        style={{ height: 64, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}
      >
        <Logo />

        <nav style={{ display: "flex", alignItems: "center", gap: 26 }} className="hf-nav-desktop">
          {NAV_LINKS.map((l) => (
            <a key={l.href} href={l.href} style={navItemStyle}>
              {l.label}
            </a>
          ))}
        </nav>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <a
            href={SITE.appStoreUrl}
            target="_blank"
            rel="noreferrer"
            className="hf-btn hf-btn--primary hf-nav-desktop"
            style={{ padding: "10px 18px", fontSize: 14 }}
          >
            <DownloadIcon />
            Download
          </a>
          <button
            type="button"
            aria-label="Menu"
            aria-expanded={open}
            className="hf-nav-mobile"
            onClick={() => setOpen((v) => !v)}
            style={{
              display: "none",
              width: 38,
              height: 38,
              borderRadius: 10,
              background: "transparent",
              border: `1px solid ${C.LINE}`,
              color: C.TXT,
              cursor: "pointer",
              fontSize: 18,
            }}
          >
            {open ? "✕" : "☰"}
          </button>
        </div>
      </div>

      {open && (
        <div className="hf-container" style={{ paddingBottom: 16 }}>
          <nav style={{ display: "grid", gap: 4 }}>
            {NAV_LINKS.map((l) => (
              <a key={l.href} href={l.href} style={{ ...navItemStyle, padding: "12px 4px" }}>
                {l.label}
              </a>
            ))}
            <a
              href={SITE.appStoreUrl}
              target="_blank"
              rel="noreferrer"
              className="hf-btn hf-btn--primary"
              style={{ marginTop: 12 }}
            >
              <DownloadIcon />
              Download
            </a>
          </nav>
        </div>
      )}
    </header>
  );
}

// The team context strip under the site header: which team you're looking at,
// and its headline record.
function TeamBar({ team, teams, teamId, onPick, tab, games, updated, season }) {
  const teamW = games.filter((g) => g.w).length;
  const teamL = games.length - teamW;
  return (
    <div
      className="hf-container"
      style={{
        paddingTop: 22,
        paddingBottom: 18,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: 14,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <div
          style={{
            width: 50,
            height: 50,
            borderRadius: 16,
            background: `linear-gradient(135deg, ${C.BRAND}, ${C.BRAND_HI})`,
            display: "grid",
            placeItems: "center",
            fontSize: 26,
            lineHeight: 1,
          }}
          aria-hidden="true"
        >
          {team.emoji}
        </div>
        <div>
          <div className="hf-eyebrow" style={{ fontSize: 10, marginBottom: 2 }}>
            {season ? `${season} ` : ""}WNBA Analytics
          </div>
          <TeamPicker teams={teams} value={teamId} onChange={onPick} season={season} />
          <div style={{ fontSize: 12, color: C.MUTE, marginTop: 2 }}>
            {team.city}
            {team.city ? " · " : ""}
            {tab === "team" ? "team performance" : "player performance"}
            {updated ? ` · updated ${updated}` : ""}
          </div>
        </div>
      </div>
      <div style={{ display: "flex", gap: 22, alignItems: "center" }}>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 11, color: C.MUTE, letterSpacing: 1.5, textTransform: "uppercase", fontWeight: 600 }}>Record</div>
          <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 22 }}>
            {teamW}
            <span style={{ color: C.MUTE }}>–</span>
            {teamL}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 11, color: C.MUTE, letterSpacing: 1.5, textTransform: "uppercase", fontWeight: 600 }}>Games</div>
          <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 22 }}>{games.length}</div>
        </div>
      </div>
    </div>
  );
}

function FooterCol({ title, links }) {
  return (
    <div>
      <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 600, fontSize: 13, letterSpacing: "0.08em", textTransform: "uppercase", color: C.MUTE, marginBottom: 12 }}>
        {title}
      </div>
      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 9 }}>
        {links.map(([label, href]) => (
          <li key={label}>
            <a href={href} style={{ color: C.TXT, fontSize: 15 }}>
              {label}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SiteFooter({ updated }) {
  const year = 2026;
  return (
    <footer style={{ borderTop: `1px solid ${C.LINE}`, marginTop: 40, background: C.PANEL }}>
      <div
        className="hf-container"
        style={{ padding: "44px 24px", display: "flex", flexWrap: "wrap", gap: 24, justifyContent: "space-between" }}
      >
        <div style={{ maxWidth: 340 }}>
          <a href={SITE.parentUrl} style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
            <BrandMark size={30} />
            <span style={{ fontFamily: FONT_DISPLAY, fontWeight: 600, fontSize: 18, letterSpacing: "-0.01em" }}>
              {SITE.parentName}
            </span>
          </a>
          <p style={{ color: C.MUTE, marginTop: 12, fontSize: 15 }}>{SITE.tagline}</p>
        </div>
        <div style={{ display: "flex", gap: 56, flexWrap: "wrap" }}>
          <FooterCol
            title={SITE.parentName}
            links={[
              ["Home", SITE.parentUrl],
              ["NBA Stats", `${SITE.parentUrl}/pros/nba`],
              ["Blog", `${SITE.parentUrl}/blog`],
              ["FAQ", `${SITE.parentUrl}/faq`],
            ]}
          />
          <FooterCol
            title="This site"
            links={[
              ["Get the app", SITE.appStoreUrl],
              ["Contact", `mailto:${SITE.contactEmail}`],
            ]}
          />
        </div>
      </div>
      <div className="hf-container" style={{ padding: "18px 24px", borderTop: `1px solid ${C.LINE}`, color: C.MUTE, fontSize: 13 }}>
        © {year} {SITE.parentName}. Stats from stats.wnba.com
        {updated ? `, updated ${updated}` : ""}. Not affiliated with the WNBA.
      </div>
    </footer>
  );
}

function Shell({ league }) {
  const { teams, teamRanks, teamProfiles, leagueShotZones, positionShotZones, teamZoneWins, data, meta } = league;

  const defaultId = teams[0].id; // first team alphabetically; no team-specific default
  const [teamId, setTeamId] = useState(defaultId);
  const [tab, setTab] = useState("team");
  const [sel, setSel] = useState(0);

  const team = teams.find((t) => t.id === teamId) || teams[0];
  const bundle = data[teamId] || data[team.id];
  const { games, roster, onOff, fourFactors, playerAdv, lineups, upcoming, shotZones, errors } = bundle;

  const updated = meta && meta.generatedAt
    ? new Date(meta.generatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
    : null;

  const pickTeam = (id) => {
    setTeamId(id);
    setSel(0); // reset player selection when switching teams
  };

  return (
    <div style={{ minHeight: "100vh", background: C.INK, color: C.TXT }}>
      <SiteHeader />

      <TeamBar
        team={team}
        teams={teams}
        teamId={teamId}
        onPick={pickTeam}
        tab={tab}
        games={games}
        updated={updated}
        season={meta && meta.season}
      />

      <nav
        className="hf-container"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          paddingBottom: 18,
          borderBottom: `1px solid ${C.LINE}`,
        }}
      >
        <TabButton active={tab === "team"} onClick={() => setTab("team")}>
          Team
        </TabButton>
        <TabButton active={tab === "players"} onClick={() => setTab("players")}>
          Players
        </TabButton>
      </nav>

      {tab === "team" ? (
        <TeamView
          key={teamId}
          games={games}
          roster={roster}
          onOff={onOff}
          fourFactors={fourFactors}
          teamRanks={teamRanks}
          playerAdv={playerAdv}
          lineups={lineups}
          errors={errors}
          teamId={teamId}
          teamName={team.teamName}
          teamProfiles={teamProfiles}
          upcoming={upcoming}
          shotZones={shotZones}
          leagueShotZones={leagueShotZones}
          teamZoneWins={teamZoneWins}
        />
      ) : (
        <Dashboard key={teamId} games={games} roster={roster} sel={sel} setSel={setSel} leagueShotZones={leagueShotZones} positionShotZones={positionShotZones} />
      )}

      <SiteFooter updated={updated} />
    </div>
  );
}

export default function App() {
  const { loading, error, data: league } = useLeagueData();

  if (loading) {
    return (
      <Center>
        <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 600, fontSize: 20, color: C.BRAND, letterSpacing: "-0.02em" }}>
          Loading WNBA data…
        </div>
        <div style={{ color: C.MUTE, marginTop: 8, fontSize: 14 }}>Loading the saved data snapshot.</div>
      </Center>
    );
  }

  if (error) {
    return (
      <Center>
        <div className="hf-panel" style={{ padding: "26px 28px", textAlign: "left" }}>
          <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 600, fontSize: 18, marginBottom: 10 }}>Couldn't load data</div>
          <div style={{ color: C.MUTE, fontSize: 14, lineHeight: 1.6 }}>
            <code style={{ color: C.LOSS_FG }}>{String(error.message)}</code>
            <p style={{ marginTop: 12 }}>
              The site reads a saved data file (<code>data/wnba.json</code>) instead of
              calling stats.wnba.com directly. Generate or refresh it by running{" "}
              <code>npm run fetch</code> from the project, then rebuild and re-upload.
            </p>
          </div>
        </div>
      </Center>
    );
  }

  if (!league || !league.teams || !league.teams.length) {
    return (
      <Center>
        <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 600, fontSize: 18 }}>No teams found</div>
        <div style={{ color: C.MUTE, marginTop: 8, fontSize: 14 }}>
          The saved data has no teams, or the <code>SEASON</code> in <code>scripts/fetch-data.mjs</code> needs updating (then re-run <code>npm run fetch</code>).
        </div>
      </Center>
    );
  }

  return <Shell league={league} />;
}
