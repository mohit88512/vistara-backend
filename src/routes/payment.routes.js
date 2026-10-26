
import express from "express";
import { protect } from "../middleware/auth.middleware.js";
import { allowRoles } from "../middleware/role.middleware.js";
import { createPaymentOrder,verifyPayment, handleRazorpayWebhook, } from "../controllers/payment.controller.js";

const router = express.Router();

router.post(
  "/create-order",
  protect,
  allowRoles("customer"),
  createPaymentOrder
);

router.post(
  "/verify",
  protect,
  allowRoles("customer"),
  verifyPayment
);

router.post("/webhook", handleRazorpayWebhook);

export default router;
