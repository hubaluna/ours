import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
export function useImage(path: string | null) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    setUrl(null);
    if (!path || path.startsWith("illustration:")) return;
    if (path.startsWith("data:image/")) {
      setUrl(path);
      return;
    }
    let active = true;
    const load = () => {
      void supabase?.storage
        .from("photos")
        .createSignedUrl(path, 3600)
        .then(({ data }) => {
          if (active) setUrl(data?.signedUrl ?? null);
        });
    };
    load();
    const timer = setInterval(load, 45 * 60 * 1000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [path]);
  return url;
}
