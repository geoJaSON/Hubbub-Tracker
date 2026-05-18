import { Router, type IRouter } from "express";
import healthRouter from "./health";
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
import dashboardRouter from "./dashboard";
import docsRouter from "./docs";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/users", usersRouter);
router.use("/projects", projectsRouter);
router.use("/projects/:slug/scopes", scopesRouter);
router.use("/projects/:slug/milestones", milestonesRouter);
router.use("/projects/:slug/items", itemsRouter);
router.use("/projects/:slug/items/:itemNumber/comments", commentsRouter);
router.use("/projects/:slug", timeRouter);
router.use("/projects/:slug/costs", costsRouter);
router.use("/projects/:slug/messages", messagesRouter);
router.use("/presence", presenceRouter);
router.use("/standup", standupRouter);
router.use("/", activityRouter);
router.use("/search", searchRouter);
router.use("/dashboard", dashboardRouter);
router.use("/projects/:slug/docs", docsRouter);

export default router;
