import React from "react";
import { safeMediaSource } from "./mediaSource";

export type MediaPlayState = "NOT_STARTED" | "PAUSED" | "ENDED" | "PLAYING";

export interface NativeAudioViewProps {
  url?: string;
  autoPlay?: boolean;
  playing?: boolean;
  widgetName?: string;
  onPlay?: () => void;
  onPause?: () => void;
  onEnd?: () => void;
}

export function NativeAudioView({
  url = "", autoPlay = false, playing, widgetName = "Audio", onPlay, onPause, onEnd,
}: NativeAudioViewProps): React.ReactElement {
  const source = safeMediaSource(url, "audio");
  const player = React.useRef<HTMLAudioElement>(null);
  const [playState, setPlayState] = React.useState<MediaPlayState>("NOT_STARTED");
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => { setPlayState("NOT_STARTED"); setFailed(false); }, [source]);
  React.useEffect(() => {
    if (!player.current || playing === undefined) return;
    if (playing) void player.current.play().catch(() => setPlayState("PAUSED"));
    else player.current.pause();
  }, [playing, source]);

  if (!source || failed) return <div data-native-widget="audio" role="status" style={centeredError}>
    {failed ? "Audio unavailable" : "Enter an audio URL"}
  </div>;

  return <audio
    aria-label={widgetName}
    autoPlay={autoPlay}
    controls
    {...{ controlsList: "nofullscreen nodownload noremoteplayback noplaybackrate" }}
    data-native-widget="audio"
    data-play-state={playState}
    onEnded={() => { setPlayState("ENDED"); onEnd?.(); }}
    onError={() => setFailed(true)}
    onPause={(event) => {
      if (event.currentTarget.ended) return;
      setPlayState("PAUSED");
      onPause?.();
    }}
    onPlay={() => { setPlayState("PLAYING"); onPlay?.(); }}
    ref={player}
    src={source}
    style={{ height: "100%", width: "100%" }}
  />;
}

const centeredError: React.CSSProperties = {
  alignItems: "center", display: "flex", height: "100%", justifyContent: "center", width: "100%",
};
