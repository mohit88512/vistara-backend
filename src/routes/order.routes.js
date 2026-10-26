import express from "express";
import { adminOnly } from "../middleware/admin.middleware.js";

import {
  createOrder,
  getMyOrders,
  getMyOrderById,
  getAllOrdersForAdmin,
  updateOrderStatus,
} from "../controllers/order.controller.js";

import { protect } from "../middleware/auth.middleware.js";
import { allowRoles } from "../middleware/role.middleware.js";

const router = express.Router();

router.post(
  "/",
  protect,
  allowRoles("customer"),
  createOrder
);

router.get(
  "/my-orders",
  protect,
  allowRoles("customer"),
  getMyOrders
);

router.get(
  "/admin/all",
  protect,
  adminOnly,
  getAllOrdersForAdmin
);

router.patch(
  "/admin/orders/:id/status",
  protect,
  adminOnly,
  updateOrderStatus
);

router.get(
  "/my-orders/:id",
  protect,
  allowRoles("customer"),
  getMyOrderById
);


export default router;
