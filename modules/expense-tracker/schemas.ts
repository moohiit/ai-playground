import { z } from "zod";
import { SchemaType, type Schema } from "@google/generative-ai";

export const CATEGORIES = [
  "Food & Groceries",
  "Rent & Housing",
  "Utilities",
  "Transport",
  "Shopping",
  "Cosmetics & Personal Care",
  "Entertainment",
  "Health",
  "Education",
  "Subscriptions",
  "Other",
] as const;

// Phase 1A: income categories are a separate set so spending reports don't fragment.
export const INCOME_CATEGORIES = [
  "Salary",
  "Business",
  "Investments",
  "Freelance",
  "Gifts",
  "Refunds",
  "Other",
] as const;

export const createGroupSchema = z
  .object({
    name: z.string().min(1).max(100),
    description: z.string().max(500).default(""),
    memberEmails: z
      .array(z.string().email())
      .min(1, "Add at least 1 other member by email"),
  })
  .strict();

export type CreateGroupInput = z.infer<typeof createGroupSchema>;

export const updateGroupSchema = z
  .object({
    name: z.string().min(1).max(100).optional(),
    description: z.string().max(500).optional(),
  })
  .strict();

export const addMemberSchema = z
  .object({
    email: z.string().email(),
  })
  .strict();

// Category is validated against the right set in a refine (depends on `direction`).
const ALL_CATEGORIES = [...CATEGORIES, ...INCOME_CATEGORIES] as const;

const expenseObjectSchema = z
  .object({
    type: z.enum(["personal", "group"]),
    direction: z.enum(["expense", "income"]).default("expense"),
    groupId: z.string().optional(),
    paidBy: z.object({
      id: z.string().min(1),
      name: z.string().min(1),
    }),
    amount: z.number().positive("Amount must be positive"),
    description: z.string().min(1).max(500),
    category: z.enum(ALL_CATEGORIES),
    date: z.string().refine((d) => !isNaN(Date.parse(d)), "Invalid date"),
    splitAmong: z
      .array(
        z.object({
          memberId: z.string().min(1),
          name: z.string().min(1),
        })
      )
      .optional(),
    items: z
      .array(
        z.object({
          name: z.string(),
          quantity: z.number().default(1),
          price: z.number(),
        })
      )
      .optional(),
  })
  .strict();

// Validate the category against the right set, given the (possibly partial) direction.
// `currentType`/`currentDirection` let updates fall back to the stored values.
function refineDirectionCategory(
  val: { type?: string; direction?: string; category?: string },
  ctx: z.RefinementCtx
) {
  if (val.direction === "income") {
    if (val.type !== undefined && val.type !== "personal") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Income must be a personal entry",
        path: ["type"],
      });
    }
    if (
      val.category !== undefined &&
      !(INCOME_CATEGORIES as readonly string[]).includes(val.category)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Choose an income category",
        path: ["category"],
      });
    }
  } else if (val.direction === "expense" || val.direction === undefined) {
    if (
      val.category !== undefined &&
      val.direction !== undefined &&
      !(CATEGORIES as readonly string[]).includes(val.category)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Choose an expense category",
        path: ["category"],
      });
    }
  }
}

export const createExpenseSchema =
  expenseObjectSchema.superRefine(refineDirectionCategory);

// PATCH: every field optional. Category/direction consistency is re-validated in the
// service against the stored row, since a partial update may omit `direction`.
export const updateExpenseSchema = expenseObjectSchema
  .partial()
  .superRefine(refineDirectionCategory);

export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;

const isoDate = z
  .string()
  .refine((d) => !isNaN(Date.parse(d)), "Invalid date")
  .optional();

export const expenseFilterSchema = z.object({
  groupId: z.string().optional(),
  type: z.enum(["personal", "group"]).optional(),
  direction: z.enum(["expense", "income", "all"]).optional(),
  category: z.string().optional(),
  q: z.string().trim().max(100).optional(),
  dateFrom: isoDate,
  dateTo: isoDate,
  settled: z.enum(["true", "false", "all"]).optional().default("false"),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(500).default(20),
});

export type ExpenseFilter = z.infer<typeof expenseFilterSchema>;

export const reportFilterSchema = z.object({
  groupId: z.string().optional(),
  category: z.string().optional(),
  q: z.string().trim().max(100).optional(),
  dateFrom: isoDate,
  dateTo: isoDate,
  settled: z.enum(["true", "false", "all"]).optional().default("all"),
  scope: z.enum(["all", "personal", "group"]).optional().default("all"),
});

export type ReportFilter = z.infer<typeof reportFilterSchema>;

export const DEFAULT_PREFS = {
  baseCurrency: "INR",
  locale: "en-IN",
  weekStart: 1,
} as const;

// Phase 0 scaffold for Phase 1B (multi-currency). All fields optional so the client can
// PATCH a single preference. `baseCurrency` validated as an ISO-4217-style 3-letter code.
export const updatePrefsSchema = z
  .object({
    baseCurrency: z
      .string()
      .regex(/^[A-Za-z]{3}$/, "Use a 3-letter currency code (e.g. INR)")
      .transform((s) => s.toUpperCase())
      .optional(),
    locale: z.string().min(2).max(35).optional(),
    weekStart: z.union([z.literal(0), z.literal(1)]).optional(),
  })
  .strict();

export type UpdatePrefsInput = z.infer<typeof updatePrefsSchema>;

export const geminiReceiptSchema: Schema = {
  type: SchemaType.OBJECT,
  properties: {
    vendor: {
      type: SchemaType.STRING,
      description: "Store or vendor name",
    },
    date: {
      type: SchemaType.STRING,
      description: "Receipt date in YYYY-MM-DD format",
    },
    items: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          name: { type: SchemaType.STRING },
          quantity: { type: SchemaType.NUMBER },
          price: { type: SchemaType.NUMBER },
        },
        required: ["name", "quantity", "price"],
      },
    },
    total: {
      type: SchemaType.NUMBER,
      description: "Total amount on the receipt",
    },
    category: {
      type: SchemaType.STRING,
      description: `One of: ${CATEGORIES.join(", ")}`,
    },
  },
  required: ["vendor", "date", "items", "total", "category"],
};

export const receiptResultSchema = z.object({
  vendor: z.string(),
  date: z.string(),
  items: z.array(
    z.object({
      name: z.string(),
      quantity: z.number(),
      price: z.number(),
    })
  ),
  total: z.number(),
  category: z.string(),
});

export type ReceiptResult = z.infer<typeof receiptResultSchema>;
