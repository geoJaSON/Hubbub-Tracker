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
export const itemCategoryEnum = pgEnum("item_category", [
  "infrastructure_hosting",
  "security_compliance",
  "mobile_devops",
  "web_devops",
  "database_schema",
  "monitoring_observability",
  "deployment_release",
  "third_party_integration",
  "support_operations",
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
  "attachment_added",
]);
export const attachmentEntityEnum = pgEnum("attachment_entity", [
  "item",
  "comment",
  "scope",
  "message",
]);
export const notificationTypeEnum = pgEnum("notification_type", [
  "mention",
  "assigned",
  "status_changed",
  "comment_on_watched",
  "reply",
]);

// ── Users ──────────────────────────────────────────────────────────────────
export const users = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    clerkId: varchar("clerk_id", { length: 128 }),
    email: text("email"),
    displayName: text("display_name").notNull(),
    username: text("username"),
    avatarUrl: text("avatar_url"),
    role: userRoleEnum("role").notNull().default("member"),
    hourlyRateCents: integer("hourly_rate_cents"),
    active: boolean("active").notNull().default(true),
    passwordHash: text("password_hash"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    clerkIdIdx: uniqueIndex("users_clerk_id_idx").on(t.clerkId),
    usernameIdx: uniqueIndex("users_username_idx").on(t.username),
    emailIdx: uniqueIndex("users_email_idx").on(t.email),
  }),
);

// ── API Keys ─────────────────────────────────────────────────────────────────
// Long-lived bearer credentials for programmatic / automation access. The key
// is shown once at creation; only its sha256 hash is stored. A key resolves to
// its owning user (by clerk_id) and inherits that user's role and project
// memberships — see `resolvePrincipal` in api-server/src/lib/auth.ts.
export const apiKeys = pgTable(
  "api_keys",
  {
    id: serial("id").primaryKey(),
    userId: varchar("user_id", { length: 128 }).notNull(),
    name: text("name").notNull(),
    keyHash: text("key_hash").notNull(),
    prefix: varchar("prefix", { length: 24 }).notNull(),
    lastUsedAt: timestamp("last_used_at"),
    expiresAt: timestamp("expires_at"),
    revoked: boolean("revoked").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    keyHashIdx: uniqueIndex("api_keys_key_hash_idx").on(t.keyHash),
    userIdx: index("api_keys_user_id_idx").on(t.userId),
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
    githubToken: text("github_token"),
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
  startDate: date("start_date"),
  targetDate: date("target_date"),
  status: milestoneStatusEnum("status").notNull().default("open"),
  order: integer("order").notNull().default(0),
});

// ── Project Components ─────────────────────────────────────────────────────
export const projectComponents = pgTable(
  "project_components",
  {
    id: serial("id").primaryKey(),
    projectId: integer("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    projectNameIdx: uniqueIndex("project_components_project_name_idx").on(
      t.projectId,
      t.name,
    ),
  }),
);

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
    category: itemCategoryEnum("category"),
    componentId: integer("component_id").references(() => projectComponents.id, {
      onDelete: "set null",
    }),
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

// ── Labels ───────────────────────────────────────────────────────────────────
// Free-form, per-project tags. Many-to-many with items via `item_labels`.
export const labels = pgTable(
  "labels",
  {
    id: serial("id").primaryKey(),
    projectId: integer("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    color: varchar("color", { length: 24 }).notNull().default("#22c55e"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    projectNameIdx: uniqueIndex("labels_project_name_idx").on(t.projectId, t.name),
  }),
);

export const itemLabels = pgTable(
  "item_labels",
  {
    itemId: integer("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    labelId: integer("label_id")
      .notNull()
      .references(() => labels.id, { onDelete: "cascade" }),
  },
  (t) => ({
    uniq: uniqueIndex("item_labels_unique_idx").on(t.itemId, t.labelId),
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
    order: integer("order").notNull().default(0),
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

// ── Standup Cache ──────────────────────────────────────────────────────────
export const standupCache = pgTable(
  "standup_cache",
  {
    id: serial("id").primaryKey(),
    userId: varchar("user_id", { length: 128 }).notNull(),
    forDate: date("for_date").notNull(),
    content: text("content").notNull(),
    generatedAt: timestamp("generated_at").notNull().defaultNow(),
  },
  (t) => ({
    userDateIdx: uniqueIndex("standup_cache_user_date_idx").on(
      t.userId,
      t.forDate,
    ),
  }),
);

// ── App Settings ───────────────────────────────────────────────────────────
export const appSettings = pgTable("app_settings", {
  key: varchar("key", { length: 128 }).primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ── Attachments ────────────────────────────────────────────────────────────
// Polymorphic: a file attached to an item, comment, scope, or message. The blob
// itself lives in the configured storage backend (local disk by default) under
// `storageKey`; this row is the metadata + access-control anchor (via projectId).
export const attachments = pgTable(
  "attachments",
  {
    id: serial("id").primaryKey(),
    projectId: integer("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    entityType: attachmentEntityEnum("entity_type").notNull(),
    entityId: integer("entity_id").notNull(),
    filename: text("filename").notNull(),
    mimeType: varchar("mime_type", { length: 255 }).notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    storageBackend: varchar("storage_backend", { length: 16 })
      .notNull()
      .default("local"),
    storageKey: text("storage_key").notNull(),
    uploadedBy: varchar("uploaded_by", { length: 128 }).notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    entityIdx: index("attachments_entity_idx").on(
      t.projectId,
      t.entityType,
      t.entityId,
    ),
  }),
);

// ── Notifications ──────────────────────────────────────────────────────────
// Per-user inbox. recipientId/actorId hold the stable string user id (users.clerkId).
// readAt IS NULL means unread.
export const notifications = pgTable(
  "notifications",
  {
    id: serial("id").primaryKey(),
    recipientId: varchar("recipient_id", { length: 128 }).notNull(),
    actorId: varchar("actor_id", { length: 128 }),
    type: notificationTypeEnum("type").notNull(),
    projectId: integer("project_id").references(() => projects.id, {
      onDelete: "cascade",
    }),
    itemId: integer("item_id").references(() => items.id, {
      onDelete: "cascade",
    }),
    payload: jsonb("payload").notNull().default({}),
    readAt: timestamp("read_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    recipientUnreadIdx: index("notifications_recipient_unread_idx").on(
      t.recipientId,
      t.readAt,
      t.createdAt,
    ),
  }),
);

// ── Item Dependencies ──────────────────────────────────────────────────────
// (itemId, dependsOnItemId) means "itemId is blocked by dependsOnItemId".
export const itemDependencies = pgTable(
  "item_dependencies",
  {
    id: serial("id").primaryKey(),
    itemId: integer("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    dependsOnItemId: integer("depends_on_item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    pairIdx: uniqueIndex("item_dependencies_pair_idx").on(
      t.itemId,
      t.dependsOnItemId,
    ),
    itemIdx: index("item_dependencies_item_idx").on(t.itemId),
    dependsIdx: index("item_dependencies_depends_idx").on(t.dependsOnItemId),
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

export const flows = pgTable("flows", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  slug: text("slug").notNull(),
  data: jsonb("data").notNull().default({ nodes: [], edges: [] }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const projectsRelations = relations(projects, ({ many }) => ({
  members: many(projectMembers),
  scopes: many(scopes),
  components: many(projectComponents),
  items: many(items),
  messages: many(messages),
  commits: many(commits),
  docs: many(docs),
  flows: many(flows),
  costEntries: many(costEntries),
  timeEntries: many(timeEntries),
  activityEvents: many(activityEvents),
}));

export const flowsRelations = relations(flows, ({ one }) => ({
  project: one(projects, {
    fields: [flows.projectId],
    references: [projects.id],
  }),
}));

export const projectComponentsRelations = relations(
  projectComponents,
  ({ one, many }) => ({
    project: one(projects, {
      fields: [projectComponents.projectId],
      references: [projects.id],
    }),
    items: many(items),
  }),
);

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
  component: one(projectComponents, {
    fields: [items.componentId],
    references: [projectComponents.id],
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
