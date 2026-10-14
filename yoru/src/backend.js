import {validPublicConfig} from "./public-config.js";
import { createClient } from "@supabase/supabase-js";
import { applyOperation, normalize } from "./state.js";
const config = window.YORU_CONFIG || {};
export const configured = validPublicConfig(config);
export const client = configured
  ? createClient(config.supabaseUrl, config.supabaseKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;
export async function loadData(userId) {
  let { data, error } = await client
    .from("yoru_state")
    .select("data,revision")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    const result = await client
      .from("yoru_state")
      .upsert(
        { user_id: userId, data: normalize({}), revision: 0 },
        { onConflict: "user_id", ignoreDuplicates: true },
      );
    if (result.error) throw result.error;
    const loaded = await client
      .from("yoru_state")
      .select("data,revision")
      .eq("user_id", userId)
      .single();
    if (loaded.error) throw loaded.error;
    data = loaded.data;
  }
  return { data: normalize(data.data), revision: data.revision };
}
export async function saveOperation(userId, op) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const latest = await loadData(userId);
    const next = applyOperation(latest.data, op);
    const { data, error } = await client
      .from("yoru_state")
      .update({
        data: next,
        revision: latest.revision + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId)
      .eq("revision", latest.revision)
      .select("revision");
    if (error) throw error;
    if (data?.length) return next;
  }
  throw Error("writeConflict");
}
export function hasRemoteSource(id, episode) {
  return typeof config.media?.[id]?.[episode] === "string";
}
export async function mediaSource(id, episode) {
  const path = config.media?.[id]?.[episode];
  if (!path) return null;
  const { data, error } = await client.storage
    .from("anime-media")
    .createSignedUrl(path, 7200);
  if (error) throw error;
  return data.signedUrl;
}
