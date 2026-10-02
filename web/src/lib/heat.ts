// Hitze-Anpassung: Wie viel langsamer gleiche Anstrengung bei Wärme und Schwüle ist.
// Grundlage ist die Summe aus Temperatur und Taupunkt (in °F), eine in der Praxis verbreitete
// Faustregel. Die Größenordnung passt zu großen Auswertungen von Marathon-Ergebnissen.

export type HeatLevel = 'none' | 'mild' | 'moderate' | 'high' | 'extreme'

const toF = (c: number) => (c * 9) / 5 + 32

/** [Obergrenze der Summe in °F, Verlangsamung in %] je Stufe; Mittelwert der Spannen. */
const TABLE: [number, number][] = [
  [100, 0],
  [110, 0.25],
  [120, 0.75],
  [130, 1.5],
  [140, 2.5],
  [150, 3.75],
  [160, 5.25],
  [170, 7],
  [180, 9],
]

/** Verlangsamung in % für Temperatur und Taupunkt in °C (0 = kein Effekt). Über der Tabelle: 10. */
export function heatPct(tempC: number | null | undefined, dewC: number | null | undefined): number {
  if (tempC == null || dewC == null) return 0
  const sum = toF(tempC) + toF(dewC)
  for (const [max, pct] of TABLE) if (sum <= max) return pct
  return 10
}

export function heatLevel(pct: number): HeatLevel {
  if (pct <= 0) return 'none'
  if (pct < 1.5) return 'mild'
  if (pct < 3.5) return 'moderate'
  if (pct < 7) return 'high'
  return 'extreme'
}

export const LEVEL_TEXT: Record<HeatLevel, string> = {
  none: 'Kein Hitze-Effekt',
  mild: 'Leicht warm',
  moderate: 'Warm',
  high: 'Heiß',
  extreme: 'Sehr heiß',
}

export const LEVEL_COLOR: Record<HeatLevel, string> = {
  none: 'var(--zone-1)',
  mild: 'var(--zone-2)',
  moderate: 'var(--zone-3)',
  high: 'var(--zone-4)',
  extreme: 'var(--zone-5)',
}

/** Ab hier gilt ein Lauf als warm genug, dass ein höherer Puls kein Formverlust ist. */
export const HOT_PCT = 1.5

/** Tempo in s/km bei Hitze: gleiche Anstrengung, entsprechend langsamer. */
export const heatPace = (pace: number, pct: number) => Math.round(pace * (1 + pct / 100))

export function heatAdvice(pct: number): string {
  const level = heatLevel(pct)
  if (level === 'none') return 'Lauf wie geplant.'
  if (level === 'mild') return 'Kaum ein Unterschied. Lauf nach Gefühl, eher am langsamen Ende.'
  if (level === 'moderate') return 'Etwas langsamer laufen und vorher trinken. Bei Tempoeinheiten den Puls nicht jagen.'
  if (level === 'high') return 'Deutlich langsamer laufen, Wasser mitnehmen. Harte Einheiten besser in die kühlste Zeit legen.'
  return 'Harte Einheiten heute verschieben oder locker laufen. Viel trinken, Schatten suchen.'
}

export const HEAT_EVIDENCE = [
  {
    title: 'Wärme kostet Tempo',
    text: 'Bei Wärme braucht der Körper Blut zum Kühlen der Haut, dazu kommt Flüssigkeitsverlust. Der Puls steigt bei gleichem Tempo. Auswertungen von Millionen Marathon-Ergebnissen zeigen: Am schnellsten wird bei etwa 4 bis 10 °C gelaufen, darüber werden alle langsamer, langsamere Läufer stärker.',
    source: 'Ely et al. 2007 (Med Sci Sports Exerc), El Helou et al. 2012 (PLoS One)',
  },
  {
    title: 'Warum der Taupunkt zählt',
    text: 'Schweiß kühlt nur, wenn er verdunstet. Bei hohem Taupunkt ist die Luft feucht und verdunstet wenig, darum fühlt sich 25 °C bei Schwüle viel härter an als bei trockener Luft. Die Faustregel addiert Temperatur und Taupunkt; je höher die Summe, desto langsamer.',
    source: 'Racinais et al. 2015, Konsens zu Sport in der Hitze (Scand J Med Sci Sports); Faustregel nach Hadley',
  },
  {
    title: 'Was die App daraus macht',
    text: 'Sie zeigt, wie viel langsamer gleiche Anstrengung heute ist, und rechnet die Zieltempos um. Läufe in der Wärme gelten bei der automatischen Auswertung nicht als „zu hart“, nur weil der Puls höher war. Nach 10 bis 14 Tagen regelmäßigen Laufens in der Wärme gewöhnt sich der Körper deutlich an; dann ist der Effekt kleiner als die Tabelle.',
    source: 'Périard et al. 2015 (Scand J Med Sci Sports)',
  },
]
