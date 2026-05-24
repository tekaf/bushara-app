export const RISK_CASE_WAVE_SIZE = 20

export type WaveChunk<T> = {
  waveNumber: number
  guests: T[]
}

export function splitGuestsIntoWaves<T>(guests: T[], waveSize = RISK_CASE_WAVE_SIZE): WaveChunk<T>[] {
  const size = Math.max(1, Number(waveSize || RISK_CASE_WAVE_SIZE))
  const out: WaveChunk<T>[] = []
  for (let i = 0; i < guests.length; i += size) {
    out.push({
      waveNumber: Math.floor(i / size) + 1,
      guests: guests.slice(i, i + size),
    })
  }
  return out
}
