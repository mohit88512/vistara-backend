import express from "express";
import cors from "cors";
import helmet from "helmet";

import authRoutes from "./routes/auth.routes.js";
import productRoutes from "./routes/product.routes.js";
import categoryRoutes from "./routes/category.routes.js";
import orderRoutes from "./routes/order.routes.js";
import cartRoutes from "./routes/cart.routes.js";
import paymentRoutes from "./routes/payment.routes.js";

const app = express();

app.use(cors());
app.use(helmet());

app.use(
  "/api/v1/payments/webhook",
  express.raw({ type: "application/json" })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/products", productRoutes);
app.use("/api/v1/categories", categoryRoutes);
app.use("/api/v1/orders", orderRoutes);
app.use("/api/v1/cart", cartRoutes);
app.use("/api/v1/payments", paymentRoutes);

app.get("/api/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "VISTARA backend is running"
  });
});

export default app;