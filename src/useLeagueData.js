import { useEffect, useState } from "react";
import { loadLeague } from "./api";

// Loads the whole-league snapshot once. Returns { loading, error, data } where
// data is the league object (teams + per-team bundles + shared ranking).
export function useLeagueData() {
  const [state, setState] = useState({ loading: true, error: null, data: null });

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const data = await loadLeague();
        if (alive) setState({ loading: false, error: null, data });
      } catch (err) {
        if (alive) setState({ loading: false, error: err, data: null });
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  return state;
}
