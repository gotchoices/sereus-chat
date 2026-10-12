/**
 * Change signals. Each returns an unsubscribe function. A subscription lasts until
 * unsubscribed, across strands opening, hibernating and waking: an implementation
 * re-attaches as the strand comes and goes, so a caller subscribes once.
 */
export interface ChangesModel {
  /** The set of strands or one of their summaries changed. */
  strands(onChange: () => void): () => void;
  /** This strand's chat tables changed, here or, once applied here, elsewhere. */
  strand(strandId: string, onChange: () => void): () => void;
  /** This device's addresses or relay reservation changed. */
  reachability(onChange: () => void): () => void;
  /** The cadre's control network connected or disconnected, or its machines changed. */
  cadre(onChange: () => void): () => void;
}
