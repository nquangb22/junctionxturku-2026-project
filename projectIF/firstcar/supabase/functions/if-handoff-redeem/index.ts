import { requireEnv, serviceClient, supabaseStore } from '../_shared/store.ts';
import { redeemHandoffHandler } from '../if-handoff/handler.ts';

// Called by If, not the app: authenticated with a shared partner secret instead of a user JWT.
const MIN_SECRET_LENGTH = 32;
const partnerSecret = requireEnv('IF_PARTNER_SECRET');
if (partnerSecret.length < MIN_SECRET_LENGTH) throw new Error(`IF_PARTNER_SECRET must be at least ${MIN_SECRET_LENGTH} characters`);

Deno.serve(redeemHandoffHandler({ store: supabaseStore(serviceClient()), partnerSecret }));
