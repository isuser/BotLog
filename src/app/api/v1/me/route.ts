import { fromPostgrest } from "@/lib/api/errors";
import { json, parseBody, route } from "@/lib/api/handler";
import { getMyProfile } from "@/lib/api/profile";
import { updateProfileSchema } from "@/lib/api/schemas";

/** The signed-in person's profile. Not for API keys: agents have their own records. */
export const GET = route(
  async ({ db }) => {
    return json({ data: await getMyProfile(db) });
  },
  { allowApiKey: false },
);

/** Changes the signed-in person's name, theme or preferences. */
export const PATCH = route(
  async ({ db, actor, request }) => {
    const body = await parseBody(request, updateProfileSchema);
    // No `returning`: clients can't read the preference columns from the table.
    const { error } = await db.from("profile").update(body).eq("id", actor.userId);
    if (error) throw fromPostgrest(error);
    return json({ data: await getMyProfile(db) });
  },
  { allowApiKey: false },
);
