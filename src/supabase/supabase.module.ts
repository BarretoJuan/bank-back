import { Global, Module } from "@nestjs/common";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

export const SUPABASE_ANON = "SUPABASE_ANON";
export const SUPABASE_SERVICE = "SUPABASE_SERVICE";

@Global()
@Module({
  providers: [
    {
      provide: SUPABASE_ANON,
      useFactory: (): SupabaseClient => {
        return createClient(
          process.env.SUPABASE_URL!,
          process.env.SUPABASE_ANON_KEY!,
        );
      },
    },
    {
      provide: SUPABASE_SERVICE,
      useFactory: (): SupabaseClient => {
        return createClient(
          process.env.SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!,
          {
            auth: { persistSession: false },
          },
        );
      },
    },
  ],
  exports: [SUPABASE_ANON, SUPABASE_SERVICE],
})
export class SupabaseModule {}
