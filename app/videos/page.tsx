"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import * as Dialog from "@radix-ui/react-dialog";

interface Video {
  title: string;
  url: string;
}

function getEmbedUrl(url: string) {
  const match = url.match(/v=([^&]+)/);
  const id = match ? match[1] : url;
  return `https://www.youtube.com/embed/${id}`;
}

export default function VideosPage() {
  const [videos, setVideos] = useState<Video[]>([]);
  const [current, setCurrent] = useState<Video | null>(null);

  useEffect(() => {
    fetch("/api/videos")
      .then((res) => res.json())
      .then(setVideos)
      .catch(() => setVideos([]));
  }, []);

  return (
    <div className="p-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {videos.map((v) => (
          <Card
            key={v.title}
            className="p-4 cursor-pointer hover:bg-accent"
            onClick={() => setCurrent(v)}
          >
            <p className="text-center">{v.title}</p>
          </Card>
        ))}
      </div>

      <Dialog.Root open={!!current} onOpenChange={() => setCurrent(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50" />
          <Dialog.Content className="fixed left-1/2 top-1/2 w-11/12 max-w-3xl -translate-x-1/2 -translate-y-1/2 bg-background p-4">
            {current && (
              <iframe
                src={getEmbedUrl(current.url)}
                className="w-full aspect-video"
                allow="autoplay; encrypted-media"
                allowFullScreen
              />
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}

