import { supabaseAuthenticator } from '../_shared/auth.ts';
import { serviceClient, supabaseStore } from '../_shared/store.ts';
import { createRegistryCheckHandler, traficomMock } from './handler.ts';

const client = serviceClient();

// Swap traficomMock for the real Traficom adapter once partner access is in place (§7).
Deno.serve(
  createRegistryCheckHandler({
    auth: supabaseAuthenticator(client),
    store: supabaseStore(client),
    registry: traficomMock,
  }),
);
