import { z } from "zod";
import { SchemaType, type Schema } from "@google/generative-ai";

export const CATEGORIES = [
  "Food & Groceries",
  "Rent & Housing",
  "Utilities",
  "Transport",
  "Shopping",
  "Entertainment",
  "Health",
  "Education",
  "Subscriptions",
  "Other",
] as const;

export const createGroupSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).default(""),
  members: z
    .array(
      z.object({
        name: z.string().min(1).max(100),
      })
    )
    .min(2, "A group needs at least 2 members"),
});

export type CreateGroupInput = z.infer<typeof createGroupSchema>;

export const updateGroupSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
});

export const addMemberSchema = z.object({
  name: z.string().min(1).max(100),
});

export const createExpenseSchema = z.object({
  type: z.enum(["personal", "group"]),
  groupId: z.string().optional(),
  paidBy: z.object({
    id: z.string().min(1),
    name: z.string().min(1),
  }),
  amount: z.number().positive("Amount must be positive"),
  description: z.string().min(1).max(500),
  category: z.string().min(1),
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
});

export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;

export const expenseFilterSchema = z.object({
  groupId: z.string().optional(),
  type: z.enum(["personal", "group"]).optional(),
  category: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type ExpenseFilter = z.infer<typeof expenseFilterSchema>;

export const reportFilterSchema = z.object({
  groupId: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
});

export type ReportFilter = z.infer<typeof reportFilterSchema>;

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
