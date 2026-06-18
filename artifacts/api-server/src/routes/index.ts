import { Router, type IRouter, RequestHandler } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import usersRouter from "./users";
import projectsRouter from "./projects";
import scopesRouter from "./scopes";
import milestonesRouter from "./milestones";
import itemsRouter from "./items";
import commentsRouter from "./comments";
import timeRouter from "./time";
import costsRouter from "./costs";
import messagesRouter from "./messages";
import presenceRouter from "./presence";
import standupRouter from "./standup";
import activityRouter from "./activity";
import searchRouter from "./search";
import dashboardRouter, { burnDownRouter } from "./dashboard";
import docsRouter from "./docs";
import commitsRouter from "./commits";
import componentsRouter from "./components";
import flowsRouter from "./flows";
import attachmentsRouter from "./attachments";
import dependenciesRouter from "./dependencies";
import notificationsRouter from "./notifications";
import { requireAuth, requireProjectMember } from "../lib/auth";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/auth", authRouter);
router.use("/users", usersRouter);
router.use("/projects", projectsRouter);

// All project-slug-scoped routes enforce membership after requireAuth
const memberGuard: RequestHandler[] = [
  requireAuth as RequestHandler,
  requireProjectMember as RequestHandler,
];

router.use("/projects/:slug/scopes", ...memberGuard, scopesRouter);
router.use("/projects/:slug/milestones", ...memberGuard, milestonesRouter);
router.use("/projects/:slug/items", ...memberGuard, itemsRouter);
router.use("/projects/:slug/items/:itemNumber/comments", ...memberGuard, commentsRouter);
router.use("/projects/:slug/items/:itemNumber/dependencies", ...memberGuard, dependenciesRouter);
router.use("/projects/:slug", ...memberGuard, timeRouter);
router.use("/projects/:slug/costs", ...memberGuard, costsRouter);
router.use("/projects/:slug/messages", ...memberGuard, messagesRouter);
router.use("/projects/:slug/docs", ...memberGuard, docsRouter);
router.use("/projects/:slug/commits", ...memberGuard, commitsRouter);
router.use("/projects/:slug/components", ...memberGuard, componentsRouter);
router.use("/projects/:slug/flows", ...memberGuard, flowsRouter);
router.use("/projects/:slug/attachments", ...memberGuard, attachmentsRouter);
router.use("/projects/:slug/burn-down", ...memberGuard, burnDownRouter);
router.use("/presence", presenceRouter);
router.use("/notifications", notificationsRouter);
router.use("/standup", standupRouter);
router.use("/", activityRouter);
router.use("/search", searchRouter);
router.use("/dashboard", dashboardRouter);

export default router;
