"use client";

import { useEffect, useState } from "react";

interface Video {
  title: string;
  url: string;
}

function toEmbed(url: string): string {
  const match = url.match(/(?:v=|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  return match ? `https://www.youtube.com/embed/${match[1]}` : url;
}

export default function VideosPage() {
  const [videos, setVideos] = useState<Video[]>([]);
  const [current, setCurrent] = useState<Video | null>(null);

  useEffect(() => {
    fetch("/api/videos")
      .then((r) => r.json())
      .then((data) => setVideos(data.videos || []))
      .catch(() => setVideos([]));
  }, []);

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">Videos</h1>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {videos.map((v) => (
          <div
            key={v.title}
            className="cursor-pointer border rounded p-2 hover:bg-gray-100 dark:hover:bg-gray-800"
            onClick={() => setCurrent(v)}
          >
            <div className="aspect-video flex items-center justify-center bg-black/10">
              <span className="text-2xl">▶</span>
            </div>
            <p className="mt-2 text-sm text-center break-words">{v.title}</p>
          </div>
        ))}
      </div>

      {current && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-900 p-4 rounded shadow-lg max-w-3xl w-full">
            <button
              className="mb-2 text-sm text-right w-full"
              onClick={() => setCurrent(null)}
            >
              Cerrar
            </button>
            <div className="aspect-video">
              <iframe
                className="w-full h-full"
                src={toEmbed(current.url)}
                title={current.title}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              ></iframe>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
