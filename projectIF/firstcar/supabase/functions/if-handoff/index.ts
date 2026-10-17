import { supabaseAuthenticator } from '../_shared/auth.ts';
import { serviceClient, supabaseStore } from '../_shared/store.ts';
import { createHandoffHandler } from './handler.ts';

const client = serviceClient();

Deno.serve(createHandoffHandler({ auth: supabaseAuthenticator(client), store: supabaseStore(client) }));
