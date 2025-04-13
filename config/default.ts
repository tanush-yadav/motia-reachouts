import { env } from './env'

export const appConfig = {
  openai: {
    apiKey: env.OPENAI_API_KEY,
  },
  serp: {
    apiKey: env.SERP_API_KEY,
  },
  supabase: {
    url: env.SUPABASE_URL,
    key: env.SUPABASE_ANON_KEY,
  },
  sender: {
    name: env.SENDER_NAME,
  },
  email: {
    user: env.EMAIL_USER,
    pass: env.EMAIL_PASS,
    from: env.EMAIL_FROM,
  },
}
