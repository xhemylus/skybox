-- Session tokens are now stored as SHA-256 hashes; old plaintext rows can never match.
DELETE FROM "sessions";
