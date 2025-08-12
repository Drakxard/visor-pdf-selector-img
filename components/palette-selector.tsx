'use client'

import { useState } from 'react'
import { useTheme } from 'next-themes'

const palettes = [
  { name: 'light', color: '#ffffff' },
  { name: 'dark', color: '#000000' },
  { name: 'blue', color: '#3b82f6' },
  { name: 'green', color: '#16a34a' },
]

export function PaletteSelector() {
  const { theme, setTheme } = useTheme()
  const [open, setOpen] = useState(false)

  return (
    <div className="fixed right-4 bottom-4 flex flex-col items-center z-50">
      <button
        onClick={() => setOpen(!open)}
        className="w-8 h-8 rounded-full border bg-gray-200 dark:bg-gray-700"
      />
      <div
        className={`transition-all overflow-hidden flex flex-col items-center ${
          open ? 'max-h-96 mt-2' : 'max-h-0'
        }`}
      >
        {palettes.map((p) => (
          <button
            key={p.name}
            onClick={() => setTheme(p.name)}
            style={{ backgroundColor: p.color }}
            className={`w-8 h-8 rounded-full border mb-2 ${
              theme === p.name ? 'ring-2 ring-offset-2' : ''
            }`}
          />
        ))}
      </div>
    </div>
  )
}
