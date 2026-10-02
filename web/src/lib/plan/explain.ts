// Warum eine Einheit im Plan steht: Zweck, was sie im Körper bewirkt und was die Forschung dazu sagt.
// Bewusst vorsichtig formuliert: Wo die Studienlage dünn ist, steht das auch so da.

import type { Kind, Phase, PlanWorkout } from './types'

export interface Explanation {
  /** Ein Satz für Listen und „Heute“. */
  short: string
  /** Wofür die Einheit da ist. */
  purpose: string
  /** Was im Körper passiert. */
  effect: string
  /** Was Studien zeigen, inklusive Grenzen. */
  evidence: string
  /** Kurzzitate der Quellen. */
  sources: string[]
  /** Worauf du achten solltest. */
  tip: string
}

const BASE: Partial<Record<Kind, Explanation>> = {
  easy: {
    short: 'Baut deine Ausdauer-Grundlage auf, ohne dich zu ermüden.',
    purpose: 'Umfang sammeln, damit Herz, Muskeln und Sehnen mehr Training vertragen. Der Großteil deines Trainings sollte so locker sein.',
    effect: 'Mehr Mitochondrien und Kapillaren in der Beinmuskulatur, das Herz pumpt mehr Blut pro Schlag, der Körper nutzt mehr Fett als Energie.',
    evidence:
      'Erfolgreiche Ausdauersportler trainieren etwa 75–80 % ihrer Zeit locker. Trainingsstudien mit viel lockerem Umfang und wenig, aber gezielter Intensität schneiden mindestens so gut ab wie Pläne mit viel mittelhartem Training.',
    sources: ['Seiler & Kjerland 2006, Scand J Med Sci Sports', 'Stöggl & Sperlich 2014, Front Physiol', 'Holloszy 1967, J Biol Chem (Mitochondrien)'],
    tip: 'Locker heißt: Du könntest dich unterhalten. Zone 2 bis 3 passt, wichtig ist, dass du danach nicht platt bist.',
  },
  recovery: {
    short: 'Hält die Beine in Bewegung, ohne neue Ermüdung.',
    purpose: 'Etwas Umfang nach einer harten Einheit, damit du am nächsten Schlüsseltag wieder frisch bist.',
    effect: 'Leichte Durchblutung, kaum zusätzliche Belastung für Muskeln und Nervensystem.',
    evidence: 'Einen eigenen Leistungsschub durch Regenerationsläufe zeigen Studien nicht. Ihr Wert liegt darin, Umfang zu ermöglichen, ohne die harten Einheiten zu gefährden.',
    sources: ['Seiler 2010, Int J Sports Physiol Perform (Trainingsverteilung)'],
    tip: 'Wirklich langsam. Lieber zu langsam als zu schnell, und bei schweren Beinen ganz weglassen.',
  },
  long: {
    short: 'Macht dich ausdauernd für die Renndistanz.',
    purpose: 'Die wichtigste Einheit für Halbmarathon und Marathon: Sie trainiert genau die Dauer, die im Rennen zählt.',
    effect: 'Größere Glykogenspeicher, bessere Fettverbrennung, Sehnen und Knochen gewöhnen sich an lange Belastung, der Kopf auch.',
    evidence:
      'Bei Marathonläufern sagt der durchschnittliche Wochenumfang die Zielzeit gut voraus, mehr als die Intensität. Lange Läufe sind der Hauptbaustein dieses Umfangs.',
    sources: ['Tanda 2011, J Hum Sport Exerc (Marathon-Vorhersage aus Trainingsdaten)'],
    tip: 'Ruhig und gleichmäßig. Bei Läufen über 90 Minuten Verpflegung üben, so wie im Rennen.',
  },
  strides: {
    short: 'Kurze schnelle Steigerungen für einen lockeren, ökonomischen Schritt.',
    purpose: 'Schnelligkeit und Lauftechnik pflegen, ohne zu ermüden.',
    effect: 'Das Nervensystem lernt schnelle, saubere Bewegungen. Das hilft bei der Laufökonomie, also wie viel Energie ein bestimmtes Tempo kostet.',
    evidence:
      'Gut belegt ist, dass schnelle, kraftvolle Reize (Sprung- und Krafttraining) die Laufökonomie um einige Prozent verbessern. Studien nur zu Steigerungsläufen gibt es kaum, sie gelten als bewährte Praxis mit wenig Risiko.',
    sources: ['Blagrove et al. 2018, Sports Med (Kraft und Laufökonomie)'],
    tip: 'Schnell, aber nicht verkrampft. Zwischen den Steigerungen vollständig erholen.',
  },
  tempo: {
    short: 'Hebt deine Schwelle: das Tempo, das du lange halten kannst.',
    purpose: 'Training knapp unter oder an der Laktatschwelle, dem Tempo, ab dem Laktat schnell ansteigt.',
    effect: 'Die Muskeln bauen Laktat besser ab und verwerten es. Dadurch verschiebt sich die Schwelle zu einem schnelleren Tempo.',
    evidence:
      'Die Laktatschwelle sagt Leistungen über 5 km bis Marathon sehr gut voraus, oft besser als die VO2max. Training um die Schwelle verbessert sie zuverlässig.',
    sources: ['Farrell et al. 1979, Med Sci Sports (Laktat und Laufleistung)', 'Faude et al. 2009, Sports Med (Schwellenkonzepte)'],
    tip: '„Angenehm hart“: Du kannst nur noch kurze Sätze sprechen. Gleichmäßig laufen, nicht schneller werden.',
  },
  intervals: {
    short: 'Erhöht deine maximale Sauerstoffaufnahme (VO2max).',
    purpose: 'Mehrere harte Abschnitte nahe deinem Maximum, mit Pausen dazwischen. So bleibst du länger im Bereich, der die VO2max fordert.',
    effect: 'Das Herz wird kräftiger und pumpt mehr Blut pro Schlag, die Muskeln nehmen mehr Sauerstoff auf.',
    evidence:
      'In einer viel zitierten Studie steigerten 4 × 4 Minuten bei 90–95 % der maximalen Herzfrequenz die VO2max deutlich stärker als gleich langes lockeres oder mittleres Laufen.',
    sources: ['Helgerud et al. 2007, Med Sci Sports Exerc 39:665', 'Billat 2001, Sports Med (Intervalltraining)'],
    tip: 'Die Abschnitte gleichmäßig laufen, der letzte sollte so schnell sein wie der erste. Wenn das nicht klappt, war das Tempo zu hoch.',
  },
  fartlek: {
    short: 'Spielerischer Tempowechsel als Einstieg in härteres Training.',
    purpose: 'Schnelle Abschnitte nach Gefühl, ohne feste Zeiten auf der Bahn. Gewöhnt den Körper an Tempo, bevor die strukturierten Intervalle kommen.',
    effect: 'Ähnlich wie Intervalle, nur weniger intensiv: Schwelle und VO2max werden angesprochen, die Belastung bleibt moderat.',
    evidence:
      'Fahrtspiel selbst ist wenig untersucht. Es nutzt dieselben Reize wie Intervalltraining in milderer Form und eignet sich deshalb für die Grundlagenphase.',
    sources: ['Billat 2001, Sports Med (Intervalltraining)'],
    tip: 'Nach Gefühl: zügig, aber nie ganz am Limit.',
  },
  race_pace: {
    short: 'Übt genau das Tempo, das du im Rennen laufen willst.',
    purpose: 'Das Zieltempo verinnerlichen, damit du es im Rennen ohne Uhr-Blick triffst und weißt, wie es sich anfühlt.',
    effect: 'Der Körper wird in genau dieser Belastung ökonomischer, und du lernst Verpflegung und Einteilung bei diesem Tempo.',
    evidence:
      'Das Prinzip der Spezifität ist eine der stabilsten Regeln der Trainingslehre: Was man trainiert, wird besser. Studien zu reinen Renntempo-Einheiten sind selten, die Praxis ist bei allen gängigen Plänen gleich.',
    sources: ['Bompa & Haff, Periodization (Spezifitätsprinzip)'],
    tip: 'Nicht schneller als geplant, auch wenn es sich leicht anfühlt. Im Rennen kommt die Müdigkeit später.',
  },
  technique: {
    short: 'Beim Schwimmen bringt Technik mehr als Kraft.',
    purpose: 'Wasserlage, Armzug und Atmung verbessern.',
    effect: 'Weniger Wasserwiderstand und ein effizienterer Zug: Du schwimmst mit gleicher Kraft schneller.',
    evidence: 'Im Wasser hängt der Energieverbrauch stark von der Technik ab. Geübte Schwimmer brauchen für das gleiche Tempo deutlich weniger Energie als ungeübte.',
    sources: ['Toussaint & Hollander 1994, Sports Med (Energetik beim Schwimmen)'],
    tip: 'Lieber wenige saubere Bahnen als viele unsaubere. Bei Müdigkeit aufhören, sonst übst du Fehler.',
  },
  brick: {
    short: 'Gewöhnt die Beine an den Wechsel vom Rad zum Laufen.',
    purpose: 'Das Laufen direkt nach dem Radfahren üben, wie im Triathlon.',
    effect: 'Nach dem Rad laufen die ersten Minuten oft unrund und schwer, Schrittlänge und Puls sind verändert. Der Körper gewöhnt sich mit Übung daran.',
    evidence: 'Studien zeigen, dass sich Laufökonomie und Schrittmuster direkt nach dem Radfahren verändern. Geübte Triathleten kommen damit besser zurecht.',
    sources: ['Millet & Vleck 2000, Br J Sports Med (Wechsel Rad–Laufen)'],
    tip: 'Die ersten 5 Minuten nach Gefühl laufen, nicht nach Pace. Danach ins Wettkampftempo finden.',
  },
  race: {
    short: 'Dein Rennen. Alles davor war Vorbereitung.',
    purpose: 'Umsetzen, was du trainiert hast.',
    effect: 'Durch das Tapering sind Muskeln und Glykogenspeicher aufgefüllt, die Fitness ist geblieben.',
    evidence: 'Etwa zwei Wochen mit 40–60 % weniger Umfang bei gleicher Intensität verbessern die Rennleistung im Schnitt um einige Prozent.',
    sources: ['Bosquet et al. 2007, Med Sci Sports Exerc (Tapering)'],
    tip: 'Ruhig anlaufen, die erste Hälfte nicht schneller als geplant. Nichts Neues ausprobieren.',
  },
}

/** Rad und Schwimmen nutzen dieselben Prinzipien, aber eigene Beispiele. */
const SPORT_TWEAK: Partial<Record<`${PlanWorkout['sport']}:${Kind}`, Partial<Explanation>>> = {
  'bike:tempo': {
    short: '„Sweet Spot“: viel Schwellenreiz bei überschaubarer Ermüdung.',
    tip: 'Knapp unter der Schwelle, gleichmäßige Trittfrequenz. Nicht zum Ende hin schneller werden.',
  },
  'swim:intervals': {
    short: 'Hebt dein Schwimmtempo über die Wettkampfdistanz.',
    tip: 'Kurze Pausen am Beckenrand, gleichmäßige Zeiten über alle Wiederholungen.',
  },
  'bike:long': {
    short: 'Ausdauer auf dem Rad, die Basis für Triathlon.',
    tip: 'Ruhig fahren und Verpflegung üben: etwa alle 20–30 Minuten essen oder trinken.',
  },
}

const PHASE_NOTE: Record<Phase, string> = {
  base: 'Grundlagenphase: Umfang und Ausdauer aufbauen, Intensität noch zurückhaltend.',
  build: 'Aufbauphase: Mehr gezielte Intensität auf der Grundlage.',
  peak: 'Spitzenphase: Training wird renn-spezifisch, die härtesten Wochen.',
  taper: 'Tapering: Umfang runter, Intensität halten, damit du frisch an den Start gehst.',
}

export function explain(w: Pick<PlanWorkout, 'kind' | 'sport' | 'phase'>): (Explanation & { phase: string }) | null {
  const base = BASE[w.sport === 'race' ? 'race' : w.kind]
  if (!base) return null
  return { ...base, ...SPORT_TWEAK[`${w.sport}:${w.kind}`], phase: PHASE_NOTE[w.phase] }
}
