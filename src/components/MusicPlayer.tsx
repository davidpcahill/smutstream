import { useEffect, useRef, useState } from "react";
import { stationByKey } from "../lib/stations";

type Props = {
  enabled: boolean;
  stationKey: string;
  volume: number;
};

/**
 * HTML5 streaming audio. Lives on the /display tab.
 *
 * Notes:
 * - Browsers block autoplay of audio until a user gesture on the page. If
 *   play() is rejected, we show a one-tap overlay button.
 * - Station/volume changes apply immediately to the active <audio> element.
 * - Disabling music tears down the element so we stop pulling bandwidth.
 */
export function MusicPlayer({ enabled, stationKey, volume }: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [needsTap, setNeedsTap] = useState(false);
  const [stationLabel, setStationLabel] = useState<string | null>(null);

  const station = stationByKey(stationKey);

  // Primary effect: set up / tear down / change station. Does NOT depend on
  // volume — volume is handled by its own effect below so dragging the
  // slider doesn't restart the stream and cause a stutter.
  useEffect(() => {
    if (!enabled || !station) {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = "";
        audioRef.current = null;
      }
      setStationLabel(null);
      setNeedsTap(false);
      return;
    }
    let el = audioRef.current;
    if (!el) {
      el = new Audio();
      el.crossOrigin = "anonymous";
      el.preload = "none";
      audioRef.current = el;
    }
    const sourceChanged = el.src !== station.url;
    if (sourceChanged) {
      el.src = station.url;
    }
    // Set initial volume on first attach (subsequent volume changes go through
    // the dedicated effect below).
    el.volume = volume;
    if (sourceChanged || el.paused) {
      el.play().then(
        () => { setNeedsTap(false); setStationLabel(station.name); },
        () => { setNeedsTap(true); setStationLabel(station.name); },
      );
    } else {
      setStationLabel(station.name);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- volume intentionally omitted
  }, [enabled, stationKey, station]);

  // Volume sync — apply live without restarting playback.
  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
  }, [volume]);

  // Stop entirely on unmount
  useEffect(() => () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
      audioRef.current = null;
    }
  }, []);

  function tapToStart() {
    if (!audioRef.current || !station) return;
    audioRef.current.play().then(
      () => setNeedsTap(false),
      () => setNeedsTap(true),
    );
  }

  if (!enabled) return null;

  return (
    <>
      {stationLabel && !needsTap && (
        <div className="music-chip" title="now playing audio">
          <span>♪</span> {stationLabel}
        </div>
      )}
      {needsTap && (
        <button className="music-start" onClick={tapToStart}>
          <span>▶</span>
          <div>
            <strong>tap to start music</strong>
            <div>{station?.name ?? "stream"} — browser blocked autoplay</div>
          </div>
        </button>
      )}
    </>
  );
}
