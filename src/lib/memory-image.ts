import type { Memory } from "@/lib/echoes";

function memoryArt(memory: Memory) {
  const seed = memory.id
    .split("")
    .reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const hue = seed % 360;
  const title = memory.title.replace(/'/g, "");
  const story = memory.photoHint || memory.relationship;
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="900" height="600" viewBox="0 0 900 600" role="img" aria-label="${title}">
      <defs>
        <linearGradient id="g" x1="0%" x2="100%" y1="0%" y2="100%">
          <stop offset="0%" stop-color="hsl(${hue} 70% 88%)"/>
          <stop offset="100%" stop-color="hsl(${(hue + 40) % 360} 70% 78%)"/>
        </linearGradient>
      </defs>
      <rect width="900" height="600" rx="56" fill="url(#g)" />
      <circle cx="720" cy="120" r="120" fill="rgba(255,255,255,0.34)" />
      <circle cx="160" cy="470" r="150" fill="rgba(255,255,255,0.18)" />
      <text x="64" y="110" font-size="44" font-family="Arial, sans-serif" fill="#163042" font-weight="700">${story}</text>
      <text x="64" y="180" font-size="54" font-family="Arial, sans-serif" fill="#163042" font-weight="700">${title}</text>
      <text x="64" y="250" font-size="30" font-family="Arial, sans-serif" fill="#163042">${memory.relationship}</text>
    </svg>
  `;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

export function createMemoryImage(memory: Memory) {
  if (memory.photoPath) return memory.photoPath;
  return memoryArt(memory);
}
