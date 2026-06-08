import { z } from "zod";
import { SchemaType, type Schema } from "@google/generative-ai";
import { SUPPORTED_CURRENCIES } from "./currencies";

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
    currency: z.enum(SUPPORTED_CURRENCIES).optional(),
    accountId: z.string().nullish(),
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
      .transform((s) => s.toUpperCase())
      .pipe(z.enum(SUPPORTED_CURRENCIES, { message: "Unsupported currency" }))
      .optional(),
    locale: z.string().min(2).max(35).optional(),
    weekStart: z.union([z.literal(0), z.literal(1)]).optional(),
  })
  .strict();

export type UpdatePrefsInput = z.infer<typeof updatePrefsSchema>;

// ── Accounts / wallets (Phase 1C) ──────────────────

export const ACCOUNT_KINDS = ["cash", "bank", "card", "wallet"] as const;

export const createAccountSchema = z
  .object({
    name: z.string().min(1).max(60),
    kind: z.enum(ACCOUNT_KINDS).default("bank"),
    currency: z.enum(SUPPORTED_CURRENCIES).optional(),
    openingBalance: z.number().default(0),
  })
  .strict();

export type CreateAccountInput = z.infer<typeof createAccountSchema>;

export const updateAccountSchema = z
  .object({
    name: z.string().min(1).max(60).optional(),
    kind: z.enum(ACCOUNT_KINDS).optional(),
    openingBalance: z.number().optional(),
    archived: z.boolean().optional(),
  })
  .strict();

export type UpdateAccountInput = z.infer<typeof updateAccountSchema>;

export const createTransferSchema = z
  .object({
    fromAccountId: z.string().min(1),
    toAccountId: z.string().min(1),
    amount: z.number().positive("Amount must be positive"),
    date: z.string().refine((d) => !isNaN(Date.parse(d)), "Invalid date"),
    note: z.string().max(200).default(""),
  })
  .strict()
  .refine((v) => v.fromAccountId !== v.toAccountId, {
    message: "Pick two different accounts",
    path: ["toAccountId"],
  });

export type CreateTransferInput = z.infer<typeof createTransferSchema>;

// ── Budgets (Phase 2A) ─────────────────────────────

export const createBudgetSchema = z
  .object({
    scope: z.enum(["overall", "category"]),
    category: z.enum(CATEGORIES).nullish(),
    amount: z.number().positive("Amount must be positive"),
    rollover: z.boolean().default(false),
  })
  .strict()
  .superRefine((val, ctx) => {
    if (val.scope === "category" && !val.category) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Pick a category for a category budget",
        path: ["category"],
      });
    }
  });

export type CreateBudgetInput = z.infer<typeof createBudgetSchema>;

export const updateBudgetSchema = z
  .object({
    amount: z.number().positive().optional(),
    rollover: z.boolean().optional(),
  })
  .strict();

export type UpdateBudgetInput = z.infer<typeof updateBudgetSchema>;

// "YYYY-MM"; defaults are applied by the service when omitted.
export const monthSchema = z
  .string()
  .regex(/^\d{4}-\d{2}$/, "Use YYYY-MM")
  .optional();

// ── Recurring rules (Phase 2B) ─────────────────────

const isoDateRequired = z
  .string()
  .refine((d) => !isNaN(Date.parse(d)), "Invalid date");

export const createRecurringSchema = z
  .object({
    amount: z.number().positive("Amount must be positive"),
    currency: z.enum(SUPPORTED_CURRENCIES).optional(),
    category: z.enum(ALL_CATEGORIES),
    description: z.string().min(1).max(200),
    direction: z.enum(["expense", "income"]).default("expense"),
    accountId: z.string().nullish(),
    cadence: z.enum(["weekly", "monthly", "yearly"]).default("monthly"),
    startDate: isoDateRequired,
    autoPost: z.boolean().default(false),
    endDate: isoDateRequired.nullish(),
  })
  .strict()
  .superRefine((val, ctx) => {
    const ok =
      val.direction === "income"
        ? (INCOME_CATEGORIES as readonly string[]).includes(val.category)
        : (CATEGORIES as readonly string[]).includes(val.category);
    if (!ok) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Choose a valid ${val.direction} category`,
        path: ["category"],
      });
    }
  });

export type CreateRecurringInput = z.infer<typeof createRecurringSchema>;

export const updateRecurringSchema = z
  .object({
    amount: z.number().positive().optional(),
    description: z.string().min(1).max(200).optional(),
    category: z.enum(ALL_CATEGORIES).optional(),
    cadence: z.enum(["weekly", "monthly", "yearly"]).optional(),
    autoPost: z.boolean().optional(),
    active: z.boolean().optional(),
    endDate: isoDateRequired.nullish(),
  })
  .strict();

export type UpdateRecurringInput = z.infer<typeof updateRecurringSchema>;

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

// ── Natural-language entry (Phase 3) ───────────────

export const parseTextSchema = z
  .object({ text: z.string().min(2).max(300) })
  .strict();

export const coachSchema = z
  .object({
    messages: z
      .array(
        z.object({
          role: z.enum(["user", "assistant"]),
          content: z.string().min(1).max(1000),
        })
      )
      .min(1)
      .max(20),
  })
  .strict();

export type CoachInput = z.infer<typeof coachSchema>;

export const geminiNlSchema: Schema = {
  type: SchemaType.OBJECT,
  properties: {
    amount: { type: SchemaType.NUMBER, description: "Numeric amount" },
    currency: {
      type: SchemaType.STRING,
      description: `Optional ISO code, one of: ${SUPPORTED_CURRENCIES.join(", ")}`,
    },
    direction: {
      type: SchemaType.STRING,
      description: 'Either "expense" or "income"',
    },
    category: {
      type: SchemaType.STRING,
      description: `One of: ${[...CATEGORIES, ...INCOME_CATEGORIES].join(", ")}`,
    },
    description: { type: SchemaType.STRING },
    date: { type: SchemaType.STRING, description: "YYYY-MM-DD" },
  },
  required: ["amount", "direction", "category", "description", "date"],
};

export const nlResultSchema = z.object({
  amount: z.number().positive(),
  currency: z.string().optional(),
  direction: z.enum(["expense", "income"]),
  category: z.string(),
  description: z.string().min(1),
  date: z.string(),
});

export type NlResult = z.infer<typeof nlResultSchema>;

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
