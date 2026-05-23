import { useEffect, useState } from "react";
import type { DisplayPost, OverlayCorner, OverlayVerbosity, ServerInfo } from "../lib/types";
import { api } from "../lib/api";
import { Logo } from "./Logo";

type Props = {
  visible: boolean;
  verbosity: OverlayVerbosity;
  opacity: number;
  scale: number;
  corner: OverlayCorner;
  current: DisplayPost | null;
};

const CORNER_CLASS: Record<OverlayCorner, string> = {
  tl: "overlay--corner-tl",
  tr: "overlay--corner-tr",
  bl: "overlay--corner-bl",
  br: "overlay--corner-br",
};

const isChip = (v: OverlayVerbosity) => v === "qr-only" || v === "minimal";

export function Overlay({ visible, verbosity, opacity, scale, corner, current }: Props) {
  const [info, setInfo] = useState<ServerInfo | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () => api.serverInfo().then((i) => !cancelled && setInfo(i)).catch(() => {});
    load();
    const t = window.setInterval(load, 60_000);
    return () => { cancelled = true; window.clearInterval(t); };
  }, []);

  const style = {
    ["--ov-opacity" as string]: opacity,
    ["--ov-scale" as string]: scale,
  } as React.CSSProperties;

  const cornerClass = isChip(verbosity) ? CORNER_CLASS[corner] : "";

  return (
    <div
      className={`overlay overlay--${verbosity} ${cornerClass} ${visible ? "overlay--on" : ""}`}
      style={style}
    >
      {verbosity === "qr-only" && info?.qr && (
        <div className="overlay__chip overlay__chip--qr">
          <img src={info.qr} alt="join QR" />
        </div>
      )}

      {verbosity === "minimal" && info?.url && (
        <div className="overlay__chip">
          {info.qr && <img src={info.qr} alt="join QR" />}
          <div className="overlay__chip-text">
            <div className="overlay__chip-url">{info.url}</div>
            {info.ssid && <div className="overlay__chip-ssid">wifi: {info.ssid}</div>}
          </div>
        </div>
      )}

      {!isChip(verbosity) && (
        <div className="overlay__inner">
          <div className="overlay__brand">
            <Logo size={48} />
            <div>
              <div className="overlay__title">smutstream</div>
              <div className="overlay__sub">join from your phone to add tags + vote</div>
            </div>
          </div>

          <div className="overlay__lan">
            {info?.qr && <img src={info.qr} alt="join QR" className="overlay__qr" />}
            <div className="overlay__lantext">
              <div className="overlay__url">{info?.url ?? "…"}</div>
              {info?.ssid && <div className="overlay__ssid">wifi: {info.ssid}</div>}
              {verbosity === "verbose" && (
                <>
                  <div className="overlay__host">host: {info?.hostname ?? "?"}</div>
                  {info?.ips && info.ips.length > 1 && (
                    <div className="overlay__ips">
                      also: {info.ips.filter((i) => i !== info.primaryIp).join(", ")}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {verbosity === "verbose" && current && (
            <div className="overlay__nowplaying">
              <div className="overlay__np-label">now showing</div>
              <div className="overlay__np-group">{current.groupName}</div>
              {current.artists.length > 0 && (
                <div className="overlay__np-artists">by {current.artists.slice(0, 2).join(", ")}</div>
              )}
              {current.contributorName && (
                <div className="overlay__np-by">added by {current.contributorName}</div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
