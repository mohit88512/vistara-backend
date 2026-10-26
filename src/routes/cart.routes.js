import express from "express";
import { addToCart, getMyCart, updateCartQuantity, removeFromCart, clearCart} from "../controllers/cart.controller.js";
import { protect } from "../middleware/auth.middleware.js";
import { allowRoles } from "../middleware/role.middleware.js";

const router = express.Router();

router.get(
  "/",
  protect,
  allowRoles("customer"),
  getMyCart
);

router.post(
  "/add",
  protect,
  allowRoles("customer"),
  addToCart
);

router.patch(
  "/quantity",
  protect,
  allowRoles("customer"),
  updateCartQuantity
);

router.delete(
  "/remove/:productId",
  protect,
  allowRoles("customer"),
  removeFromCart
);

router.delete(
  "/clear",
  protect,
  allowRoles("customer"),
  clearCart
);
export default router;