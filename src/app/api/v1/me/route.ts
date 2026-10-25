import { fromPostgrest } from "@/lib/api/errors";
import { json, parseBody, route } from "@/lib/api/handler";
import { PROFILE_SELECT, serializeProfile } from "@/lib/api/profile";
import { updateProfileSchema } from "@/lib/api/schemas";

/** The signed-in person's profile. Not for API keys: agents have their own records. */
export const GET = route(
  async ({ db, actor }) => {
    const { data, error } = await db.from("profile").select(PROFILE_SELECT).eq("id", actor.userId).single();
    if (error) throw fromPostgrest(error);
    return json({ data: serializeProfile(data) });
  },
  { allowApiKey: false },
);

/** Changes the signed-in person's name, theme or preferences. */
export const PATCH = route(
  async ({ db, actor, request }) => {
    const body = await parseBody(request, updateProfileSchema);
    const { data, error } = await db
      .from("profile")
      .update(body)
      .eq("id", actor.userId)
      .select(PROFILE_SELECT)
      .single();
    if (error) throw fromPostgrest(error);
    return json({ data: serializeProfile(data) });
  },
  { allowApiKey: false },
);
