import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { IDS, asUser, createTestDb, expectError } from "./harness";
import { AVATAR_OPTIONS, CHAT_STICKERS, PET_BREEDS, PET_COLORS, PET_OUTFITS } from "@/lib/office/catalog";

const [M1, M2, M3] = IDS.members;
let db: PGlite;

type Feed = {
  id: string;
  is_anonymous: boolean;
  is_mine: boolean;
  sender_id: string | null;
  sender_name: string | null;
  body: string | null;
  reactions: Record<string, number>;
};

const feed = (user: string) => asUser(db, user, (q) => q<Feed>(`select * from public.chat_feed()`));
const send = (user: string, sql: string, params: unknown[] = []) =>
  asUser(db, user, async (q) => (await q<{ id: string }>(`select public.send_chat_message(${sql}) as id`, params))[0].id, { commit: true });

beforeAll(async () => {
  db = await createTestDb();
}, 120_000);

describe("catalogs", () => {
  it("TypeScript catalogs match the database constraints", async () => {
    const r = await db.query<{ name: string; def: string }>(`
      select conname as name, pg_get_constraintdef(oid) as def from pg_constraint
      where conrelid in ('public.avatar_appearance'::regclass, 'public.pets'::regclass) and contype = 'c'`);
    const defs = Object.fromEntries(r.rows.map((x) => [x.name, x.def]));
    const values = (def: string) => [...def.matchAll(/'([a-z_0-9]+)'::text/g)].map((m) => m[1]);
    for (const [part, opts] of Object.entries(AVATAR_OPTIONS)) {
      expect(values(defs[`avatar_${part}_ck`]).sort(), part).toEqual([...opts].sort());
    }
    expect(values(defs.pet_color_ck).sort()).toEqual([...PET_COLORS].sort());
    expect(values(defs.pet_outfit_ck).sort()).toEqual([...PET_OUTFITS].sort());
    expect(values(defs.pet_breed_ck).filter((v) => v !== "dog" && v !== "cat").sort()).toEqual(
      [...PET_BREEDS.dog, ...PET_BREEDS.cat].sort(),
    );
    const stickers = (await db.query<{ s: string[] }>(`select private.chat_stickers() as s`)).rows[0].s;
    expect(stickers).toEqual([...CHAT_STICKERS]);
  });

  it("rejects values outside the catalog and someone else's avatar", async () => {
    await expectError(
      asUser(db, M1, (q) => q(`update public.avatar_appearance set hair = 'mohawk-<script>' where user_id = $1`, [M1])),
      "avatar_hair_ck",
    );
    // A cat breed on a dog.
    await expectError(
      asUser(db, M1, (q) => q(`update public.pets set species = 'dog', breed = 'siamese' where user_id = $1`, [M1])),
      "pet_breed_ck",
    );
    const other = await asUser(db, M1, (q) => q(`update public.avatar_appearance set hair = 'bob' where user_id = $1 returning user_id`, [M2]));
    expect(other).toEqual([]);
  });
});

describe("office status", () => {
  it("is self-service only and visible to the organization", async () => {
    await asUser(db, M1, (q) => q(`insert into public.office_status (user_id, org_id, status, note) values ($1, $2, 'offsite', 'พบลูกค้า')`, [M1, IDS.org]), {
      commit: true,
    });
    await expectError(
      asUser(db, M1, (q) => q(`insert into public.office_status (user_id, org_id, status) values ($1, $2, 'break')`, [M2, IDS.org])),
      "row-level security",
    );
    const seen = await asUser(db, M3, (q) => q<{ status: string }>(`select status::text from public.office_status where user_id = $1`, [M1]));
    expect(seen).toEqual([{ status: "offsite" }]);
  });
});

describe("chat: anonymity", () => {
  it("nobody can read chat tables directly", async () => {
    for (const user of [M1, IDS.admin]) {
      await expectError(asUser(db, user, (q) => q(`select sender_id from public.chat_messages`)), "permission denied");
      await expectError(asUser(db, user, (q) => q(`select * from public.chat_reactions`)), "permission denied");
    }
  });

  it("anonymous senders are hidden from everyone but the Admin lookup, which is audited", async () => {
    const id = await send(M1, `p_kind => 'text', p_body => 'ข้อความลับจากใครสักคน', p_anonymous => true`);
    const named = await send(M2, `p_kind => 'text', p_body => 'สวัสดีทุกคน'`);

    const forM3 = await feed(M3);
    const anon = forM3.find((m) => m.id === id)!;
    expect(anon).toMatchObject({ is_anonymous: true, is_mine: false, sender_id: null, sender_name: null });
    expect(forM3.find((m) => m.id === named)).toMatchObject({ sender_id: M2, is_anonymous: false });

    const forAuthor = (await feed(M1)).find((m) => m.id === id)!;
    expect(forAuthor).toMatchObject({ is_mine: true, sender_id: null });

    // Even the Admin's regular feed hides it; only the explicit lookup reveals it.
    expect((await feed(IDS.admin)).find((m) => m.id === id)?.sender_id).toBeNull();
    for (const user of [M3, IDS.manager, IDS.director]) {
      await expectError(asUser(db, user, (q) => q(`select * from public.admin_chat_identity($1)`, [id])), "admin_only");
    }
    const who = await asUser(db, IDS.admin, (q) => q<{ sender_id: string }>(`select * from public.admin_chat_identity($1)`, [id]), { commit: true });
    expect(who[0].sender_id).toBe(M1);
    const audit = await db.query<{ details: Record<string, string> }>(
      `select details from public.admin_audit_logs where action = 'chat_identity_revealed'`,
    );
    expect(audit.rows).toHaveLength(1);
    expect(JSON.stringify(audit.rows)).not.toContain("ข้อความลับ");
  });

  it("anonymous @mentions notify without revealing the sender or copying the text", async () => {
    await send(M1, `p_kind => 'text', p_body => 'SECRET-CHAT-TEXT @m2', p_anonymous => true, p_mentions => array[$1]::uuid[]`, [M2]);
    const n = await db.query<{ actor_id: string | null; payload: Record<string, unknown> }>(
      `select actor_id, payload from public.notifications where kind = 'chat_mentioned' and user_id = $1`,
      [M2],
    );
    expect(n.rows).toHaveLength(1);
    expect(n.rows[0].actor_id).toBeNull();
    expect(n.rows[0].payload.actor_name).toBeNull();
    expect(JSON.stringify(n.rows)).not.toContain("SECRET-CHAT-TEXT");
  });
});

describe("chat: content rules", () => {
  it("validates kinds, stickers, image paths and rate limits", async () => {
    await expectError(send(M3, `p_kind => 'text', p_body => '   '`), "comment_required");
    await expectError(send(M3, `p_kind => 'sticker', p_sticker => 'evil'`), "invalid_sticker");
    await expectError(send(M3, `p_kind => 'image', p_media_path => 'other-org/x.png'`), "invalid_attachment_path");
    expect(await send(M3, `p_kind => 'sticker', p_sticker => 'coffee'`)).toBeTruthy();
    // 20 per minute per sender.
    for (let i = 0; i < 19; i++) await send(M3, `p_kind => 'text', p_body => $1`, [`msg ${i}`]);
    await expectError(send(M3, `p_kind => 'text', p_body => 'one too many'`), "chat_rate_limited");
  });

  it("reactions are counted without exposing who reacted", async () => {
    const id = await send(M2, `p_kind => 'text', p_body => 'react to me'`);
    await asUser(db, M1, (q) => q(`select public.react_chat_message($1, '🎉')`, [id]), { commit: true });
    await asUser(db, IDS.manager, (q) => q(`select public.react_chat_message($1, '🎉')`, [id]), { commit: true });
    const row = (await feed(M3)).find((m) => m.id === id)!;
    expect(row.reactions).toEqual({ "🎉": 2 });
    await expectError(asUser(db, M1, (q) => q(`select public.react_chat_message($1, '💩')`, [id])), "chat_reactions_emoji_check");
  });
});

describe("chat: 24-hour deletion", () => {
  it("expired messages vanish from every read at once and are purged with reactions, notifications and media", async () => {
    const id = await send(M2, `p_kind => 'text', p_body => 'EXPIRING', p_mentions => array[$1]::uuid[]`, [M1]);
    const img = await send(M2, `p_kind => 'image', p_media_path => $1`, [`${IDS.org}/expiring.png`]);
    await asUser(db, M1, (q) => q(`select public.react_chat_message($1, '👍')`, [id]), { commit: true });

    // Simulate the clock passing 24h for these two messages.
    await db.query(`update public.chat_messages set created_at = now() - interval '25 hours', expires_at = now() - interval '1 hour' where id = any ($1)`, [
      [id, img],
    ]);
    const visible = await feed(M1);
    expect(visible.map((m) => m.id)).not.toContain(id);
    expect(visible.map((m) => m.id)).not.toContain(img);
    await expectError(asUser(db, M1, (q) => q(`select public.react_chat_message($1, '❤️')`, [id])), "message_not_found");
    await expectError(asUser(db, IDS.admin, (q) => q(`select * from public.admin_chat_identity($1)`, [id])), "message_not_found");
    expect((await asUser(db, M1, (q) => q<{ v: boolean }>(`select private.chat_media_visible($1) as v`, [`${IDS.org}/expiring.png`])))[0].v).toBe(false);

    const purged = (await db.query<{ n: number }>(`select public.run_chat_purge() as n`)).rows[0].n;
    expect(purged).toBe(2);
    expect((await db.query(`select 1 from public.chat_messages where id = any ($1)`, [[id, img]])).rows).toEqual([]);
    expect((await db.query(`select 1 from public.chat_reactions where message_id = $1`, [id])).rows).toEqual([]);
    expect(
      (await db.query(`select 1 from public.notifications where kind = 'chat_mentioned' and payload->>'message_id' = $1`, [id])).rows,
    ).toEqual([]);
    expect((await db.query<{ path: string }>(`select path from public.chat_media_tombstones`)).rows).toEqual([{ path: `${IDS.org}/expiring.png` }]);
    // Retry is harmless.
    expect((await db.query<{ n: number }>(`select public.run_chat_purge() as n`)).rows[0].n).toBe(0);
  });

  it("messages can never be created with a lifetime longer than 24 hours", async () => {
    await expectError(
      db.query(`insert into public.chat_messages (org_id, sender_id, kind, body, expires_at) values ($1, $2, 'text', 'x', now() + interval '2 days')`, [
        IDS.org,
        M1,
      ]),
      "chat_messages_check",
    );
  });

  it("deactivated users and other organizations see no chat", async () => {
    await asUser(db, IDS.admin, (q) => q(`select public.admin_set_user_active($1, false)`, [M3]), { commit: true });
    expect(await feed(M3)).toEqual([]);
    await expectError(send(M3, `p_kind => 'text', p_body => 'x'`), "not_authorized");
  });
});
