/** Map technical parse/upload failures to short French messages for the UI. */
export function humanizeParseError(raw: string | null | undefined): string {
  if (!raw?.trim()) return "Erreur inconnue pendant l'analyse.";
  const msg = raw.trim();
  const lower = msg.toLowerCase();

  if (/not a cs2 demo|magic=/i.test(msg)) {
    return "Fichier invalide : ce n'est pas une démo CS2 (.dem).";
  }
  if (/no rounds found/i.test(msg)) {
    return "Aucun round joué détecté (warmup seul, démo coupée, ou mauvais fichier).";
  }
  if (/too small|fichier trop petit|empty demo/i.test(msg)) {
    return "Fichier trop petit pour être une démo CS2 complète.";
  }
  if (/no players|players\.length/i.test(msg)) {
    return "Aucun joueur trouvé dans la démo.";
  }
  if (/unsupported map|map inconnue/i.test(msg)) {
    return msg; // already FR or keep as-is
  }
  if (/enospace|enospc|disk/i.test(lower)) {
    return "Espace disque / stockage insuffisant côté serveur.";
  }
  if (/econnrefused|redis|econnreset|etimedout|network/i.test(lower)) {
    return "Service temporairement indisponible (Redis / stockage). Réessaie dans un instant.";
  }
  if (/nosuchkey|not found|404/i.test(lower) && /demo|s3|object/i.test(lower)) {
    return "Fichier démo introuvable sur le stockage. Ré-uploade la démo.";
  }
  if (/demoparser|native|binding|dlopen/i.test(lower)) {
    return "Analyseur de démo indisponible sur le serveur. Contacte l'admin.";
  }
  if (/out of memory|heap|allocation/i.test(lower)) {
    return "Démo trop lourde pour le serveur (mémoire). Essaie une démo plus courte ou contacte l'admin.";
  }
  // Keep short; truncate huge stacks
  if (msg.length > 220) return `${msg.slice(0, 200).trim()}…`;
  return msg;
}

export const MIN_DEMO_BYTES = 50_000; // ~50 KB — real CS2 demos are multi-MB
