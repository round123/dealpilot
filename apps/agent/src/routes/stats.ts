import { Hono } from "hono";
import { getStats } from "../services/stats-service";

const app = new Hono();

app.get("/stats", async (c) => c.json(await getStats()));

export default app;
