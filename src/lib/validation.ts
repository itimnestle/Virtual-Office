import { z } from "zod";

export const passwordSchema = z
  .string()
  .min(10)
  .max(72)
  .regex(/[A-Za-z]/)
  .regex(/\d/);

export const newPasswordForm = z
  .object({ password: passwordSchema, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "mismatch" });

export const emailSchema = z.string().trim().toLowerCase().pipe(z.email().max(254));

export const roleSchema = z.enum(["director", "manager", "member", "admin"]);

export const inviteForm = z.object({
  email: emailSchema,
  fullName: z.string().trim().min(1).max(120),
  role: roleSchema,
  teamId: z.uuid().nullable(),
});

export const createTaskForm = z.object({
  teamId: z.uuid(),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(20000).optional(),
  assigneeIds: z.array(z.uuid()).max(20),
  priority: z.enum(["low", "medium", "high"]),
  size: z.enum(["xs", "s", "m", "l", "xl"]).nullable(),
  estimatedHours: z.number().min(0).max(2000).nullable(),
  dueLocal: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
    .nullable(),
  isPrivate: z.boolean(),
  isUrgent: z.boolean(),
  categoryId: z.uuid().nullable(),
});

export const settingsForm = z.object({
  fullName: z.string().trim().min(1).max(120),
  nickname: z.string().trim().max(40),
  locale: z.enum(["th", "en"]),
  theme: z.enum(["system", "light", "dark"]),
  reduceMotion: z.boolean(),
});
