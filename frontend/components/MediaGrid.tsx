import { MediaTile } from "@/components/MediaTile";
import { VideoFeed } from "@/components/VideoFeed";

type Props = {
  streams: Map<string, MediaStream>;
  className?: string;
  tileClassName?: string;
};

export function MediaGrid({ streams, className = "media-grid", tileClassName = "media-tile" }: Props) {
  const entries = Array.from(streams.entries());
  return (
    <div className={className}>
      {entries.map(([id, stream]) => (
        <MediaTile className={tileClassName} key={id}>
          <VideoFeed id={`cam-${id}`} stream={stream} />
        </MediaTile>
      ))}
    </div>
  );
}


