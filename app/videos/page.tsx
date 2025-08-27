"use client"

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'

interface Video {
  title: string
  url: string | null
}

function toEmbed(url: string) {
  try {
    const u = new URL(url)
    const id = u.searchParams.get('v')
    if (id) return `https://www.youtube.com/embed/${id}`
    return url
  } catch {
    return url
  }
}

export default function VideosPage() {
  const [videos, setVideos] = useState<Video[]>([])
  const [current, setCurrent] = useState<Video | null>(null)
  const params = useSearchParams()

  const dir = params.get('dir') || ''

  useEffect(() => {
    const url = dir ? `/api/videos?dir=${encodeURIComponent(dir)}` : '/api/videos'
    fetch(url)
      .then((res) => res.json())
      .then((data) => setVideos(data.videos || []))
      .catch(() => setVideos([]))
  }, [dir])

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-xl font-semibold">Videos</h1>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
        {videos.map((v) => (
          <button
            key={v.title}
            onClick={() => v.url && setCurrent(v)}
            className="border rounded p-4 hover:bg-gray-100 text-left"
          >
            {v.title}
          </button>
        ))}
      </div>
      {current && current.url && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white p-4 max-w-xl w-full space-y-2">
            <div className="flex justify-between items-center">
              <h2 className="font-medium">{current.title}</h2>
              <button onClick={() => setCurrent(null)}>✕</button>
            </div>
            <div className="aspect-video">
              <iframe
                src={toEmbed(current.url)}
                allowFullScreen
                className="w-full h-full border-0"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
