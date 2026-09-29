import { httpServerHandler } from "cloudflare:node";
import express from "express";
import "./types";
import { attachUser, requireAuth } from "./middleware/auth";
import { errorHandler, notFoundHandler } from "./middleware/error";
import { authRouter } from "./routes/auth";
import { categoriesRouter } from "./routes/categories";
import { productsRouter } from "./routes/products";
import { salesRouter } from "./routes/sales";

const app = express();

app.disable("x-powered-by");
app.use(express.json({ limit: "256kb" }));

// Static assets are served by the assets binding ahead of the Worker;
// `run_worker_first: ["/api/*"]` in wrangler.jsonc means only API traffic
// reaches Express, so everything below is mounted under /api.
app.use("/api", attachUser);
app.use("/api/auth", authRouter);
app.use("/api/products", requireAuth, productsRouter);
app.use("/api/categories", requireAuth, categoriesRouter);
app.use("/api/sales", requireAuth, salesRouter);

app.use("/api", notFoundHandler);
app.use(errorHandler);

// The port is a routing key for the Workers runtime, not a real socket.
const PORT = 8787;
app.listen(PORT);

export default httpServerHandler({ port: PORT });
