import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  timestamp,
  date,
  varchar,
  pgEnum,
  uniqueIndex,
  index,
  jsonb,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// ── Enums ──────────────────────────────────────────────────────────────────
export const userRoleEnum = pgEnum("user_role", ["admin", "member"]);
export const projectMemberRoleEnum = pgEnum("project_member_role", [
  "owner",
  "member",
]);
export const scopeStatusEnum = pgEnum("scope_status", [
  "planned",
  "active",
  "on_hold",
  "complete",
]);
export const itemTypeEnum = pgEnum("item_type", [
  "todo",
  "bug",
  "request",
  "decision",
]);
export const itemStatusEnum = pgEnum("item_status", [
  "open",
  "in_progress",
  "blocked",
  "done",
  "cancelled",
]);
export const itemPriorityEnum = pgEnum("item_priority", [
  "low",
  "medium",
  "high",
  "urgent",
]);
export const milestoneStatusEnum = pgEnum("milestone_status", [
  "open",
  "complete",
]);
export const costCategoryEnum = pgEnum("cost_category", [
  "labor",
  "hosting",
  "saas",
  "contractor",
  "ai",
  "other",
]);
export const activityTypeEnum = pgEnum("activity_type", [
  "item_created",
  "item_status_changed",
  "item_assigned",
  "comment_added",
  "commit_linked",
  "message_posted",
  "cost_added",
  "decision_logged",
]);

// ── Users ──────────────────────────────────────────────────────────────────
export const users = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    clerkId: varchar("clerk_id", { length: 128 }).notNull(),
    email: text("email"),
    displayName: text("display_name").notNull(),
    username: text("username"),
    avatarUrl: text("avatar_url"),
    role: userRoleEnum("role").notNull().default("member"),
    hourlyRateCents: integer("hourly_rate_cents"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    clerkIdIdx: uniqueIndex("users_clerk_id_idx").on(t.clerkId),
    usernameIdx: uniqueIndex("users_username_idx").on(t.username),
  }),
);

// ── Projects ───────────────────────────────────────────────────────────────
export const projects = pgTable(
  "projects",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    slug: varchar("slug", { length: 64 }).notNull(),
    description: text("description"),
    githubRepo: text("github_repo"),
    archived: boolean("archived").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    slugIdx: uniqueIndex("projects_slug_idx").on(t.slug),
  }),
);

// ── Project Members ────────────────────────────────────────────────────────
export const projectMembers = pgTable(
  "project_members",
  {
    id: serial("id").primaryKey(),
    projectId: integer("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    userId: varchar("user_id", { length: 128 }).notNull(),
    role: projectMemberRoleEnum("role").notNull().default("member"),
  },
  (t) => ({
    uniqueMember: uniqueIndex("project_members_unique_idx").on(
      t.projectId,
      t.userId,
    ),
  }),
);

// ── Scopes ─────────────────────────────────────────────────────────────────
export const scopes = pgTable(
  "scopes",
  {
    id: serial("id").primaryKey(),
    projectId: integer("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: varchar("slug", { length: 64 }).notNull(),
    sow: text("sow"),
    budgetCents: integer("budget_cents"),
    status: scopeStatusEnum("status").notNull().default("planned"),
    startDate: date("start_date"),
    targetDate: date("target_date"),
    order: integer("order").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    projectSlugIdx: uniqueIndex("scopes_project_slug_idx").on(
      t.projectId,
      t.slug,
    ),
  }),
);

// ── Milestones ─────────────────────────────────────────────────────────────
export const milestones = pgTable("milestones", {
  id: serial("id").primaryKey(),
  scopeId: integer("scope_id")
    .notNull()
    .references(() => scopes.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  targetDate: date("target_date"),
  status: milestoneStatusEnum("status").notNull().default("open"),
  order: integer("order").notNull().default(0),
});

// ── Items ──────────────────────────────────────────────────────────────────
export const items = pgTable(
  "items",
  {
    id: serial("id").primaryKey(),
    projectId: integer("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    type: itemTypeEnum("type").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    status: itemStatusEnum("status").notNull().default("open"),
    priority: itemPriorityEnum("priority").notNull().default("medium"),
    assigneeId: varchar("assignee_id", { length: 128 }),
    scopeId: integer("scope_id").references(() => scopes.id, {
      onDelete: "set null",
    }),
    milestoneId: integer("milestone_id").references(() => milestones.id, {
      onDelete: "set null",
    }),
    estimateMinutes: integer("estimate_minutes"),
    dueDate: date("due_date"),
    decisionRationale: text("decision_rationale"),
    closedAt: timestamp("closed_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    projectNumberIdx: uniqueIndex("items_project_number_idx").on(
      t.projectId,
      t.number,
    ),
    projectIdIdx: index("items_project_id_idx").on(t.projectId),
  }),
);

// ── Comments ───────────────────────────────────────────────────────────────
export const comments = pgTable("comments", {
  id: serial("id").primaryKey(),
  itemId: integer("item_id")
    .notNull()
    .references(() => items.id, { onDelete: "cascade" }),
  authorId: varchar("author_id", { length: 128 }).notNull(),
  body: text("body").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ── Time Entries ───────────────────────────────────────────────────────────
export const timeEntries = pgTable("time_entries", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  itemId: integer("item_id").references(() => items.id, {
    onDelete: "set null",
  }),
  userId: varchar("user_id", { length: 128 }).notNull(),
  minutes: integer("minutes").notNull(),
  billable: boolean("billable").notNull().default(true),
  note: text("note"),
  spentOn: date("spent_on").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ── Cost Entries ───────────────────────────────────────────────────────────
export const costEntries = pgTable("cost_entries", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  scopeId: integer("scope_id").references(() => scopes.id, {
    onDelete: "set null",
  }),
  category: costCategoryEnum("category").notNull(),
  vendor: text("vendor"),
  description: text("description"),
  amountCents: integer("amount_cents").notNull(),
  currency: varchar("currency", { length: 8 }).notNull().default("USD"),
  recurring: boolean("recurring").notNull().default(false),
  incurredOn: date("incurred_on").notNull(),
});

// ── Commits ────────────────────────────────────────────────────────────────
export const commits = pgTable(
  "commits",
  {
    id: serial("id").primaryKey(),
    projectId: integer("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    sha: varchar("sha", { length: 40 }).notNull(),
    authorGithub: text("author_github"),
    authorName: text("author_name"),
    message: text("message").notNull(),
    url: text("url"),
    committedAt: timestamp("committed_at").notNull(),
  },
  (t) => ({
    projectShaIdx: uniqueIndex("commits_project_sha_idx").on(
      t.projectId,
      t.sha,
    ),
  }),
);

// ── Commit-Item Links ──────────────────────────────────────────────────────
export const commitItems = pgTable(
  "commit_items",
  {
    commitId: integer("commit_id")
      .notNull()
      .references(() => commits.id, { onDelete: "cascade" }),
    itemId: integer("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
  },
  (t) => ({
    pk: uniqueIndex("commit_items_pk").on(t.commitId, t.itemId),
  }),
);

// ── Messages ───────────────────────────────────────────────────────────────
export const messages = pgTable(
  "messages",
  {
    id: serial("id").primaryKey(),
    projectId: integer("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    authorId: varchar("author_id", { length: 128 }).notNull(),
    body: text("body").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    projectCreatedIdx: index("messages_project_created_idx").on(
      t.projectId,
      t.createdAt,
    ),
  }),
);

// ── Presence ───────────────────────────────────────────────────────────────
export const presence = pgTable("presence", {
  userId: varchar("user_id", { length: 128 }).primaryKey(),
  itemId: integer("item_id").references(() => items.id, {
    onDelete: "set null",
  }),
  note: text("note"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ── Docs ───────────────────────────────────────────────────────────────────
export const docs = pgTable(
  "docs",
  {
    id: serial("id").primaryKey(),
    projectId: integer("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    slug: varchar("slug", { length: 128 }).notNull(),
    body: text("body").notNull().default(""),
    pinned: boolean("pinned").notNull().default(false),
    createdById: varchar("created_by_id", { length: 128 }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    projectSlugIdx: uniqueIndex("docs_project_slug_idx").on(
      t.projectId,
      t.slug,
    ),
  }),
);

// ── Activity ───────────────────────────────────────────────────────────────
export const activityEvents = pgTable(
  "activity_events",
  {
    id: serial("id").primaryKey(),
    projectId: integer("project_id").references(() => projects.id, {
      onDelete: "cascade",
    }),
    actorId: varchar("actor_id", { length: 128 }),
    type: activityTypeEnum("type").notNull(),
    payload: jsonb("payload").notNull().default({}),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    projectCreatedIdx: index("activity_project_created_idx").on(
      t.projectId,
      t.createdAt,
    ),
  }),
);

// ── Relations ──────────────────────────────────────────────────────────────
export const usersRelations = relations(users, ({ many }) => ({
  projectMembers: many(projectMembers),
}));

export const projectsRelations = relations(projects, ({ many }) => ({
  members: many(projectMembers),
  scopes: many(scopes),
  items: many(items),
  messages: many(messages),
  commits: many(commits),
  docs: many(docs),
  costEntries: many(costEntries),
  timeEntries: many(timeEntries),
  activityEvents: many(activityEvents),
}));

export const projectMembersRelations = relations(
  projectMembers,
  ({ one }) => ({
    project: one(projects, {
      fields: [projectMembers.projectId],
      references: [projects.id],
    }),
  }),
);

export const scopesRelations = relations(scopes, ({ one, many }) => ({
  project: one(projects, {
    fields: [scopes.projectId],
    references: [projects.id],
  }),
  milestones: many(milestones),
  items: many(items),
  costEntries: many(costEntries),
}));

export const milestonesRelations = relations(milestones, ({ one, many }) => ({
  scope: one(scopes, {
    fields: [milestones.scopeId],
    references: [scopes.id],
  }),
  items: many(items),
}));

export const itemsRelations = relations(items, ({ one, many }) => ({
  project: one(projects, {
    fields: [items.projectId],
    references: [projects.id],
  }),
  scope: one(scopes, {
    fields: [items.scopeId],
    references: [scopes.id],
  }),
  milestone: one(milestones, {
    fields: [items.milestoneId],
    references: [milestones.id],
  }),
  comments: many(comments),
  timeEntries: many(timeEntries),
  commitLinks: many(commitItems),
}));

export const commentsRelations = relations(comments, ({ one }) => ({
  item: one(items, {
    fields: [comments.itemId],
    references: [items.id],
  }),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  project: one(projects, {
    fields: [messages.projectId],
    references: [projects.id],
  }),
}));
