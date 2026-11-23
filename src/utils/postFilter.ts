import type { CollectionEntry } from "astro:content";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import config from "@/config";
import { resolveTimezone } from "./resolveTimezone";
import { isPreview } from "./isPreview";

dayjs.extend(utc);
dayjs.extend(timezone);

/**
 * Determines whether a post is eligible to be listed/rendered.
 *
 * - Excludes drafts always
 * - In production, excludes posts whose `pubDatetime` falls on a later calendar
 *   day than the build date, both read in the site (or per-post) timezone
 * - In dev, always shows non-draft posts to make authoring easier
 * - In the preview build (`PUBLIC_PREVIEW=true`, Cloudflare Pages), shows every
 *   post, including drafts and posts scheduled for a later day
 *
 * Publishing is day-granular by design: a post becomes visible on its
 * `pubDatetime` day, not at a time of day. `Datetime.astro` uses the same
 * timezone, so the byline shows that day unless a later `modDatetime` is set.
 */
export function postFilter({ data }: CollectionEntry<"posts">) {
  if (isPreview) return true;
  if (data.draft) return false;
  if (import.meta.env.DEV) return true;

  const tz = resolveTimezone(data.timezone ?? config.site.timezone);
  const publishDay = dayjs(data.pubDatetime).tz(tz).startOf("day");
  const buildDay = dayjs().tz(tz).startOf("day");

  return !publishDay.isAfter(buildDay);
}
