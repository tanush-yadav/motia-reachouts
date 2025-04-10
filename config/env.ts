import { cleanEnv, str } from 'envalid'

export const env = cleanEnv(process.env, {
  OPENAI_API_KEY: str(),
  SERP_API_KEY: str(),
  SUPABASE_URL: str(),
  SUPABASE_ANON_KEY: str(),
  SENDER_NAME: str(),
  SENDER_EMAIL: str(),
})
