"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { logActivity, requireRole, requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import type { FormState } from "./products";

const orgSchema = z.object({
  name: z.string().min(1, "Name is required").max(160),
  currency: z.string().length(3, "Use a 3-letter code"),
  currencySymbol: z.string().min(1).max(4),
  timezone: z.string().min(1).max(64),
  address: z.string().max(300).optional().or(z.literal("")),
});

export async function updateOrganization(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireRole("ADMIN");
  const parsed = orgSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;
  await db.organization.upsert({
    where: { id: 1 },
    create: { id: 1, ...d, currency: d.currency.toUpperCase(), address: d.address || null },
    update: { ...d, currency: d.currency.toUpperCase(), address: d.address || null },
  });
  await logActivity(user.id, "updated organization settings", "Organization", "1");
  revalidatePath("/settings");
  revalidatePath("/", "layout");
  return { success: true };
}

const taxSchema = z.object({
  name: z.string().min(1, "Name is required").max(80),
  rate: z.coerce.number().min(0).max(100),
  isDefault: z.coerce.boolean().default(false),
});

export async function createTaxRate(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireRole("ADMIN");
  const parsed = taxSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;
  if (d.isDefault) await db.taxRate.updateMany({ data: { isDefault: false } });
  await db.taxRate.create({ data: d });
  await logActivity(user.id, "created tax rate", "TaxRate", undefined, `${d.name} ${d.rate}%`);
  revalidatePath("/settings");
  return { success: true };
}

export async function deleteTaxRate(id: string): Promise<FormState> {
  await requireRole("ADMIN");
  await db.taxRate.delete({ where: { id } });
  revalidatePath("/settings");
  return { success: true };
}

const userSchema = z.object({
  name: z.string().min(1, "Name is required").max(120),
  email: z.string().email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  role: z.enum(["ADMIN", "MANAGER", "STAFF"]),
});

export async function createUser(_prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireRole("ADMIN");
  const parsed = userSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;
  const dup = await db.user.findUnique({ where: { email: d.email.toLowerCase() } });
  if (dup) return { error: "A user with that email already exists" };
  const u = await db.user.create({
    data: {
      name: d.name,
      email: d.email.toLowerCase(),
      passwordHash: await bcrypt.hash(d.password, 10),
      role: d.role,
    },
  });
  await logActivity(admin.id, "created user", "User", u.id, `${u.name} (${u.role})`);
  revalidatePath("/settings");
  return { success: true };
}

export async function updateUserRole(userId: string, role: "ADMIN" | "MANAGER" | "STAFF"): Promise<FormState> {
  const admin = await requireRole("ADMIN");
  if (admin.id === userId) return { error: "You cannot change your own role" };
  await db.user.update({ where: { id: userId }, data: { role } });
  await logActivity(admin.id, "changed user role", "User", userId, role);
  revalidatePath("/settings");
  return { success: true };
}

export async function deleteUser(userId: string): Promise<FormState> {
  const admin = await requireRole("ADMIN");
  if (admin.id === userId) return { error: "You cannot delete yourself" };
  await db.user.delete({ where: { id: userId } });
  await logActivity(admin.id, "deleted user", "User", userId);
  revalidatePath("/settings");
  return { success: true };
}

/** Approve a PENDING signup: grant the requested role and activate the account. */
export async function approveUser(userId: string): Promise<FormState> {
  const admin = await requireRole("ADMIN");
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) return { error: "User not found" };
  if (user.status !== "PENDING") return { error: "User is not awaiting approval" };
  await db.user.update({
    where: { id: userId },
    data: { status: "ACTIVE", role: user.requestedRole ?? "STAFF", requestedRole: null },
  });
  // clear the approval notification once handled
  await db.notification.deleteMany({
    where: { type: "ADMIN_APPROVAL", message: { contains: `(${user.email})` } },
  });
  await logActivity(admin.id, "approved admin access", "User", userId, user.email);
  revalidatePath("/settings");
  revalidatePath("/", "layout");
  return { success: true };
}

/** Reject a PENDING signup: remove the account entirely. */
export async function rejectUser(userId: string): Promise<FormState> {
  const admin = await requireRole("ADMIN");
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) return { error: "User not found" };
  if (user.status !== "PENDING") return { error: "User is not awaiting approval" };
  await db.user.delete({ where: { id: userId } });
  await db.notification.deleteMany({
    where: { type: "ADMIN_APPROVAL", message: { contains: `(${user.email})` } },
  });
  await logActivity(admin.id, "rejected admin access", "User", userId, user.email);
  revalidatePath("/settings");
  revalidatePath("/", "layout");
  return { success: true };
}

/* ---------- Categories (Settings → Categories) ---------- */

export async function createCategoryNamed(name: string): Promise<FormState> {
  await requireRole("MANAGER");
  const parsed = z.string().min(1).max(80).safeParse(name.trim());
  if (!parsed.success) return { error: "Invalid category name" };
  const dup = await db.category.findUnique({ where: { name: parsed.data } });
  if (dup) return { error: "Category already exists" };
  await db.category.create({ data: { name: parsed.data } });
  revalidatePath("/settings");
  revalidatePath("/items");
  return { success: true };
}

export async function deleteCategory(id: string): Promise<FormState> {
  await requireRole("MANAGER");
  await db.category.delete({ where: { id } }); // products keep SetNull semantics
  revalidatePath("/settings");
  revalidatePath("/items");
  return { success: true };
}

/* ---------- Units of measurement ---------- */

export async function updateUnits(units: string[]): Promise<FormState> {
  await requireRole("ADMIN");
  const parsed = z.array(z.string().min(1).max(20)).min(1).max(20).safeParse(
    [...new Set(units.map((u) => u.trim()).filter(Boolean))]
  );
  if (!parsed.success) return { error: "Provide between 1 and 20 unit names" };
  await db.organization.update({ where: { id: 1 }, data: { units: parsed.data } });
  revalidatePath("/settings");
  revalidatePath("/items");
  return { success: true };
}

/* ---------- Inventory preferences & notification settings ---------- */

const prefsSchema = z.object({
  defaultReorderPoint: z.coerce.number().int().min(0).max(100000),
  lowStockEmailAlerts: z.coerce.boolean().default(false),
});

export async function updatePreferences(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireRole("ADMIN");
  const parsed = prefsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  await db.organization.update({ where: { id: 1 }, data: parsed.data });
  await logActivity(user.id, "updated inventory preferences", "Organization", "1");
  revalidatePath("/settings");
  return { success: true };
}

export async function markNotificationsRead(ids?: string[]): Promise<FormState> {
  await requireSession();
  await db.notification.updateMany({
    where: ids?.length ? { id: { in: ids } } : { read: false },
    data: { read: true },
  });
  revalidatePath("/", "layout");
  return { success: true };
}
