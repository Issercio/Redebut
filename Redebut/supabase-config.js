window.REDEBUT_SUPABASE_CONFIG = {
  // Example: 'https://your-project-ref.supabase.co'
  url: 'https://vevwapwxbiffospnmfhx.supabase.co',
  // Example: 'eyJ...'
  anonKey: 'sb_publishable_Kow-mehYMg4nY0mR_LgklA_EjU8JZAP',
  // Must match the actual table name in Supabase.
  table: 'support_messages',
  // Anti-spam cooldown in seconds.
  publishCooldownSeconds: 8,
  // Keep only the latest N messages (local + realtime prune target).
  maxMessages: 100,
  // Safety polling to keep devices in sync even if realtime drops.
  syncPollSeconds: 5
};
