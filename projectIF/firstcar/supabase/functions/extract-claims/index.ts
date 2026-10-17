import { supabaseAuthenticator } from '../_shared/auth.ts';
import { requireEnv, serviceClient, supabaseStore } from '../_shared/store.ts';
import { createExtractClaimsHandler } from './handler.ts';
import { anthropicExtractor } from './llm.ts';

const client = serviceClient();

Deno.serve(
  createExtractClaimsHandler({
    auth: supabaseAuthenticator(client),
    store: supabaseStore(client),
    llm: anthropicExtractor(requireEnv('ANTHROPIC_API_KEY')),
  }),
);
