import React from "react";
import { safeMediaSource } from "./mediaSource";
import type { MediaPlayState } from "./NativeAudioView";

export interface NativeVideoViewProps {
  url?: string;
  autoPlay?: boolean;
  playing?: boolean;
  widgetName?: string;
  backgroundColor?: string;
  borderRadius?: string;
  boxShadow?: string;
  onPlay?: () => void;
  onPause?: () => void;
  onEnd?: () => void;
}

export function NativeVideoView({
  url = "", autoPlay = false, playing, widgetName = "Video", backgroundColor = "#000",
  borderRadius, boxShadow, onPlay, onPause, onEnd,
}: NativeVideoViewProps): React.ReactElement {
  const source = safeMediaSource(url, "video");
  const player = React.useRef<HTMLVideoElement>(null);
  const [playState, setPlayState] = React.useState<MediaPlayState>("NOT_STARTED");
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => { setPlayState("NOT_STARTED"); setFailed(false); }, [source]);
  React.useEffect(() => {
    if (!player.current || playing === undefined) return;
    if (playing) void player.current.play().catch(() => setPlayState("PAUSED"));
    else player.current.pause();
  }, [playing, source]);

  if (!source || failed) return <div data-native-widget="video" role="status" style={centeredError}>
    {failed ? "Video unavailable" : "Enter a video URL"}
  </div>;

  return <div data-native-widget="video" data-play-state={playState} style={{ height: "100%", width: "100%" }}>
    <video
      aria-label={widgetName}
      autoPlay={autoPlay}
      controls
      disablePictureInPicture
      muted={autoPlay}
      onEnded={() => { setPlayState("ENDED"); onEnd?.(); }}
      onError={() => setFailed(true)}
      onPause={(event) => {
        if (event.currentTarget.ended) return;
        setPlayState("PAUSED");
        onPause?.();
      }}
      onPlay={() => { setPlayState("PLAYING"); onPlay?.(); }}
      playsInline
      ref={player}
      src={source}
      style={{ backgroundColor, borderRadius, boxShadow, height: "100%", width: "100%" }}
    />
  </div>;
}

const centeredError: React.CSSProperties = {
  alignItems: "center", display: "flex", height: "100%", justifyContent: "center", width: "100%",
};
